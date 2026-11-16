'use strict';
/* Language Workbook — один движок для всех языков.
   Профили языков: langs.js, промты: prompts.js, хранилище: store.js. */

/* ================================================================ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const LS = {
  get(k, d) { try { const v = localStorage.getItem('ewb:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ewb:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem('ewb:' + k); } catch { /* ignore */ } },
};

const settings = Object.assign(
  { strictCase: true, strictAccents: true, strictTones: true, includeSchema: true, autoCopy: true, theme: 'auto',
    lang: 'en', pinyinMode: 'hidden', ttsRate: 0.9, perLang: {} },
  LS.get('settings', {})
);
// миграция с первой (английской) версии сайта
if (settings.level && !settings.perLang.en) settings.perLang.en = { level: settings.level, focus: settings.focus || '' };
delete settings.level; delete settings.focus;
const saveSettings = () => LS.set('settings', settings);

const api = (path, body) => localApi(path, body);

function toast(msg, bad = false, ms = 3500) {
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

const fill = (tpl, vars) => String(tpl).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));

function hashStr(s) {
  let x = 2166136261;
  for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let x = hashStr(seed) || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CJK = '\\u3400-\\u9fff\\uf900-\\ufaff';
const CJK_RE = new RegExp(`[${CJK}]`);
const pctClass = (p) => (p == null ? '' : p >= 85 ? 'good' : p >= 60 ? 'mid' : 'low');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const countHanzi = (s) => (String(s).match(new RegExp(`[${CJK}]`, 'g')) || []).length;
const countWords = (s) => (String(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ================================================================ language */
let TL = LANGS[settings.lang] || LANGS.en;
const isZh = () => TL.engine === 'zh';
function perLang(code = TL.code) {
  const p = settings.perLang[code] = settings.perLang[code] || {};
  if (!LANGS[code].levels.includes(p.level)) p.level = LANGS[code].defLevel;
  if (typeof p.focus !== 'string') p.focus = '';
  return p;
}
function setLang(code) {
  if (!LANGS[code]) code = 'en';
  TL = LANGS[code];
  settings.lang = code;
  saveSettings();
  const d = document.documentElement;
  d.dataset.lang = code;
  d.dataset.script = TL.script;
  $('#brand-mark').textContent = TL.engine === 'zh' ? '中' : TL.badge === 'EN' ? 'Aa' : TL.badge;
  $('#btn-py').hidden = !isZh();
  applyPinyinMode();
}
const TF_NATIVE = {
  en: { T: 'True', F: 'False', NG: 'Not Given' }, de: { T: 'Richtig', F: 'Falsch', NG: 'Nicht im Text' },
  fr: { T: 'Vrai', F: 'Faux', NG: 'Non mentionné' }, it: { T: 'Vero', F: 'Falso', NG: 'Non detto' }, zh: { T: '对', F: '错', NG: '没提到' },
};
const TF_RU = { T: 'Верно', F: 'Неверно', NG: 'Нет информации' };
const tfLabels = () => Object.fromEntries(['T', 'F', 'NG'].map((k) => [k, `${TF_NATIVE[TL.code][k]} · ${TF_RU[k]}`]));

/* ================================================================ markup: **bold** и {汉字|pīnyīn} */
const RUBY_SRC = '\\{([^{}|]+)\\|([^{}]*)\\}';
const plain = (s) => String(s ?? '').replace(new RegExp(RUBY_SRC, 'g'), '$1').replace(/\*\*/g, '');

/** opts.vocab = true — подсвечивать слова словаря (только в тексте статьи). */
function rich(text, opts = {}) {
  const out = [];
  String(text ?? '').split(/\*\*(.+?)\*\*/g).forEach((part, i) => {
    if (!part) return;
    const nodes = rubyNodes(part, opts);
    if (i % 2) out.push(h('strong', null, nodes)); else out.push(...nodes);
  });
  return out;
}
function rubyNodes(str, opts) {
  const out = [];
  const re = new RegExp(RUBY_SRC, 'g');
  let last = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push(...plainNodes(str.slice(last, m.index), opts));
    out.push(rubyEl(m[1], m[2], opts));
    last = re.lastIndex;
  }
  if (last < str.length) out.push(...plainNodes(str.slice(last), opts));
  return out;
}
function vocabTip(v) {
  if (isZh()) return settings.pinyinMode === 'hidden' ? v.ru : `${v.reading} — ${v.ru}`;
  return v.ru;
}
const vocabLookup = (m) => (S.vmap ? S.vmap.get(S.vci ? m.toLowerCase() : m) : null);
function rubyEl(hz, py, opts) {
  const v = opts.vocab ? vocabLookup(hz) : null;
  const el = h('ruby', { class: 'py' + (v ? ' vocab tip' : ''), 'data-tip': v ? vocabTip(v) : null }, hz, h('rt', null, py));
  el.addEventListener('click', () => { el.classList.toggle('show'); speak(hz); });
  return el;
}
function plainNodes(str, opts) {
  if (!opts.vocab || !S.vre) return [str];
  const out = [];
  let last = 0;
  str.replace(S.vre, (...args) => {
    const m = args[0], off = args[args.length - 2];
    out.push(str.slice(last, off));
    const v = vocabLookup(m);
    out.push(h('span', { class: 'vocab tip', tabindex: 0, 'data-tip': v ? vocabTip(v) : '', onclick: () => speak(m) }, m));
    last = off + m.length;
    return m;
  });
  out.push(str.slice(last));
  return out;
}

const PY_MODES = { hidden: 'скрыт', hover: 'при наведении', shown: 'показан' };
function applyPinyinMode() {
  document.documentElement.dataset.py = settings.pinyinMode;
  $('#btn-py').textContent = '拼音: ' + PY_MODES[settings.pinyinMode];
}
function cyclePinyin() {
  const order = ['hidden', 'hover', 'shown'];
  settings.pinyinMode = order[(order.indexOf(settings.pinyinMode) + 1) % 3];
  saveSettings();
  applyPinyinMode();
  $$('ruby.py.show').forEach((r) => r.classList.remove('show'));
}

/* ================================================================ speech */
const warnedVoice = {};
function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const pre = lang.slice(0, 2).toLowerCase();
  const ok = (v) => v.lang.replace('_', '-').toLowerCase().startsWith(pre) && !(pre === 'zh' && /HK|TW|yue/i.test(v.lang));
  const cands = voices.filter(ok);
  const exact = (v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase();
  const nice = (v) => /natural|online|neural|google/i.test(v.name);
  return cands.find((v) => exact(v) && nice(v)) || cands.find(nice) || cands.find(exact) || cands[0];
}
function speak(text, { rate, queue = false, lang } = {}) {
  if (!('speechSynthesis' in window) || !text) return;
  lang = lang || TL.tts;
  if (!queue) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain(text));
  const v = pickVoice(lang);
  if (v) u.voice = v;
  else if (!warnedVoice[lang] && speechSynthesis.getVoices().length) {
    warnedVoice[lang] = true;
    toast(`Нет голоса для языка «${TL.name}». Откройте сайт в Microsoft Edge или установите языковой пакет (Windows: Параметры → Время и язык → Речь).`, true, 8000);
  }
  u.lang = v ? v.lang : lang;
  u.rate = rate ?? settings.ttsRate;
  speechSynthesis.speak(u);
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();

/* ================================================================ checking: common */
function lev(a, b) {
  a = [...a]; b = [...b];
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/* ---------- алфавитные языки: регистр, диакритика, сокращения */
const CONTRACTIONS = [
  [/\bwon't\b/gi, 'will not'], [/\bcan't\b/gi, 'cannot'], [/\bshan't\b/gi, 'shall not'], [/\bain't\b/gi, 'is not'],
  [/\bcan not\b/gi, 'cannot'], [/n't\b/gi, ' not'], [/'m\b/gi, ' am'], [/'re\b/gi, ' are'], [/'ve\b/gi, ' have'], [/'ll\b/gi, ' will'],
];
const keepCase = (src, repl) => (/^[A-Z]/.test(src) ? repl[0].toUpperCase() + repl.slice(1) : repl);
function expand(s) {
  for (const [re, r] of CONTRACTIONS) s = s.replace(re, (m) => (/^[A-Za-z]/.test(m) ? keepCase(m, r) : r));
  return s.replace(/\s+/g, ' ').trim();
}
function normA(s) {
  return plain(s)
    .replace(/[‘’ʼ`´]/g, "'").replace(/[“”«»„‹›]/g, '"').replace(/[–—]/g, '-').replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/\s+([!?;:])/g, '$1').replace(/'\s+/g, "'")
    .replace(/\s*[.!?;,]+$/, '').trim();
}
const stripPunct = (s) => s.replace(/[,;:!?."()[\]¡¿]/g, ' ').replace(/\s+/g, ' ').trim();
const stripMarks = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ß/g, 'ss').replace(/ẞ/g, 'SS').replace(/æ/g, 'ae').replace(/Æ/g, 'AE').replace(/œ/g, 'oe').replace(/Œ/g, 'OE');
function accentForms(s) {
  const f = new Set([stripMarks(s)]);
  if (TL.code === 'de') f.add(stripMarks(s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')));
  return f;
}
const accentEq = (a, b) => { const fb = accentForms(b); return [...accentForms(a)].some((x) => fb.has(x)); };

/** → {status: correct|case|accent|wrong|empty, note?, typo?, expected?} */
function gradeAlpha(user, variants, { sentenceStart = false, ignoreCase = false } = {}) {
  const u0 = normA(user);
  if (!u0) return { status: 'empty' };
  const RANK = { wrong: 0, typo: 1, accent: 2, case: 3 };
  let best = { kind: 'wrong' };
  const bump = (kind, expected) => { if (RANK[kind] > RANK[best.kind]) best = { kind, expected }; };
  for (const v0 of variants) {
    let v = normA(v0);
    if (!v) continue;
    if (sentenceStart) v = capFirst(v);
    let u = u0;
    if (ignoreCase) { u = u.toLowerCase(); v = v.toLowerCase(); }
    const pairs = [[u, v]];
    if (TL.contractions) pairs.push([expand(u), expand(v)]);
    for (const [a, b] of pairs) {
      if (a === b) return { status: 'correct' };
      const pa = stripPunct(a), pb = stripPunct(b);
      if (pa === pb) return { status: 'correct', note: 'пунктуация отличается от ключа' };
      if (pa.toLowerCase() === pb.toLowerCase()) bump('case', v);
      else if (accentEq(pa, pb)) bump('accent', v);
      else if (accentEq(pa.toLowerCase(), pb.toLowerCase())) { bump('accent', v); best.caseToo = best.kind === 'accent'; }
      else {
        const d = lev(stripMarks(pa.toLowerCase()), stripMarks(pb.toLowerCase()));
        if ((d === 1 && pb.length >= 4) || (d === 2 && pb.length >= 7)) bump('typo');
      }
    }
  }
  if (best.kind === 'case') {
    return settings.strictCase ? { status: 'case', expected: best.expected } : { status: 'correct', note: 'регистр букв отличается (строгая проверка выключена)' };
  }
  if (best.kind === 'accent') {
    if (best.caseToo && settings.strictCase) return { status: 'accent', expected: best.expected, note: 'а также ошибка регистра (заглавная/строчная)' };
    return settings.strictAccents ? { status: 'accent', expected: best.expected } : { status: 'correct', note: 'диакритика отличается (строгая проверка выключена)' };
  }
  return { status: 'wrong', typo: best.kind === 'typo' };
}

function isSentenceStart(before) {
  const b = plain(before).replace(/\s+$/, '');
  return b === '' || /^\s*\d+[.)]?\s*$/.test(b) || /[.!?]["'”»)]?$/.test(b) || /(^|[\s,.!?:])["“«]$/.test(b) || /^[—–-]$/.test(b);
}

/* ---------- китайский: иероглифы и пиньинь */
const TONES = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', v: 'ǖǘǚǜ' };
const MARK2 = {};
for (const [b, s] of Object.entries(TONES)) [...s].forEach((c, i) => { MARK2[c] = [b, i + 1]; });

function pyParse(s) {
  s = plain(s).normalize('NFC').toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v');
  let letters = '';
  const tones = [];
  for (const ch of s) {
    if (MARK2[ch]) { letters += MARK2[ch][0]; tones.push(MARK2[ch][1]); }
    else if (/[1-4]/.test(ch)) tones.push(+ch);
    else if (/[a-z]/.test(ch)) letters += ch;
  }
  return { letters, tones: tones.join('') };
}
function numToMark(s) {
  return s.replace(/([a-zA-ZüÜ:]+)([0-5])/g, (m, syl, t) => {
    t = +t;
    const x = syl.replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/v/g, 'ü').replace(/V/g, 'Ü');
    if (t === 0 || t === 5) return x;
    const lower = x.toLowerCase();
    let idx = lower.indexOf('a');
    if (idx < 0) idx = lower.indexOf('e');
    if (idx < 0 && lower.includes('ou')) idx = lower.indexOf('o');
    if (idx < 0) for (let i = lower.length - 1; i >= 0; i--) if ('iouü'.includes(lower[i])) { idx = i; break; }
    if (idx < 0) return m;
    const base = lower[idx] === 'ü' ? 'v' : lower[idx];
    let c = TONES[base][t - 1];
    if (x[idx] !== lower[idx]) c = c.toUpperCase();
    return x.slice(0, idx) + c + x.slice(idx + 1);
  });
}
const PY_PAREN = /[(（][^)）]*[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü][^)）]*[)）]/gi;
function normZh(s) {
  s = plain(s).normalize('NFKC').replace(PY_PAREN, '');
  s = s.replace(/[“”«»„「」『』]/g, '"').replace(/[‘’]/g, "'").replace(/、/g, ',').replace(/[。｡]/g, '.').replace(/…+/g, '…');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(new RegExp(`\\s+(?=[${CJK},.!?;:"])|(?<=[${CJK},.!?;:"])\\s+`, 'g'), '');
  s = s.replace(/[.!?;,~…]+$/, '').trim();
  return s.toLowerCase();
}
const stripZhPunct = (s) => s.replace(/[,.!?;:"'…~\-—()[\]《》<>\s]/g, '');
function gradeZh(user, variants) {
  const u = normZh(user);
  if (!u) return { status: 'empty' };
  let best = { status: 'wrong' };
  for (const v0 of variants) {
    const v = normZh(v0);
    if (!v) continue;
    if (u === v) return { status: 'correct' };
    const a = stripZhPunct(u), b = stripZhPunct(v);
    if (a === b) return { status: 'correct', note: 'пунктуация отличается от ключа' };
    if ([...b].length >= 3 && lev(a, b) === 1) best = { status: 'wrong', typo: true };
  }
  if (!CJK_RE.test(u) && /[a-z]/.test(u) && variants.some((v) => CJK_RE.test(v))) best.note = 'нужно ответить иероглифами, а не пиньинем';
  return best;
}
function gradePy(user, variants) {
  const raw = String(user || '').trim();
  if (!raw) return { status: 'empty' };
  const u = pyParse(raw);
  if (!u.letters) return { status: 'wrong', note: CJK_RE.test(raw) ? 'нужно написать пиньинь латиницей' : null };
  let best = { status: 'wrong' };
  for (const v of variants) {
    const p = pyParse(v);
    if (!p.letters) continue;
    if (p.letters === u.letters && p.tones === u.tones) return { status: 'correct' };
    if (p.letters === u.letters) {
      best = { status: 'tone', expected: plain(v), detail: `тоны: у вас ${u.tones.split('').join('-') || 'не указаны'}, нужно ${p.tones.split('').join('-')}` };
    } else if (best.status !== 'tone' && lev(p.letters, u.letters) === 1) {
      best = { status: 'wrong', typo: true };
    }
  }
  if (best.status === 'tone' && !settings.strictTones) return { status: 'correct', note: 'тоны не совпали, но строгая проверка тонов выключена (' + best.detail + ')' };
  return best;
}

const gradeText = (v, variants, opts = {}) => (isZh() ? gradeZh(v, variants) : gradeAlpha(v, variants, opts));
const normCmp = (s) => (isZh() ? normZh(s) : normA(s).toLowerCase());

/* ================================================================ JSON parsing & normalization */
function parseLenient(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Поле пустое — вставьте JSON от ИИ.');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].includes('{')) s = fence[1];
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Не найден JSON-объект { ... }. Скопируйте ответ ИИ целиком.');
  const rootStart = s.search(/\{\s*"(schema|language|meta|sections)"/);
  s = s.slice(rootStart >= 0 ? rootStart : a, b + 1);
  const attempts = [s, s.replace(/,\s*([}\]])/g, '$1'), s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')];
  let firstErr;
  for (const t of attempts) {
    try { return JSON.parse(t); } catch (e) { firstErr = firstErr || e; }
  }
  const m = String(firstErr.message).match(/position (\d+)/);
  let where = '';
  if (m) {
    const pos = +m[1];
    where = `\nСтрока ${s.slice(0, pos).split('\n').length}: …${s.slice(Math.max(0, pos - 60), pos)}⟦здесь⟧${s.slice(pos, pos + 40)}…`;
  }
  throw new Error('JSON повреждён: ' + firstErr.message + where + '\nПопросите ИИ: «Исправь JSON, он невалидный».');
}

function detectLang(t) {
  const c = String(t.language || (t.meta && t.meta.language) || '').toLowerCase().slice(0, 2);
  if (LANGS[c]) return c;
  if (String(t.schema || '').startsWith('chinesetest')) return 'zh';
  if (String(t.schema || '').startsWith('englishtest')) return 'en';
  return null;
}

const TYPE_ALIAS = {
  gapfill: 'gap_fill', gap: 'gap_fill', fill: 'gap_fill', fill_in: 'gap_fill', fill_in_the_blanks: 'gap_fill', cloze: 'gap_fill', dictation: 'gap_fill',
  word_formation: 'gap_fill', key_word_transformation: 'gap_fill', transformation: 'gap_fill', sentence_completion: 'gap_fill', completion: 'gap_fill', hanzi: 'gap_fill',
  mcq: 'multiple_choice', choice: 'multiple_choice', odd_one_out: 'multiple_choice', multiplechoice: 'multiple_choice', listening: 'multiple_choice',
  tf: 'true_false', tfng: 'true_false', true_false_not_given: 'true_false', truefalse: 'true_false',
  match: 'matching', match_headings: 'matching',
  tones: 'pinyin', pinyin_writing: 'pinyin', write_pinyin: 'pinyin',
  order: 'word_order', reorder: 'word_order', sentence_order: 'word_order', word_ordering: 'word_order', make_sentence: 'word_order',
  correction: 'error_correction', find_the_mistake: 'error_correction', sick_sentence: 'error_correction',
  translation: 'open', translate: 'open', short_answer: 'open', open_question: 'open', questions: 'open', numbers: 'open',
  essay: 'writing', composition: 'writing', speaking: 'discussion',
};
const KNOWN_TYPES = ['gap_fill', 'pinyin', 'multiple_choice', 'true_false', 'matching', 'word_order', 'error_correction', 'open', 'writing', 'discussion'];
const BLANK_RE = /_{3,}/;
const toArr = (x) => (x == null ? [] : Array.isArray(x) ? x.flat(Infinity).map(String) : [String(x)]);

function blankVariants(item, n, warn) {
  let a = item.answers ?? item.answer ?? item.key_answer;
  if (a == null) { warn('нет ответа'); return Array.from({ length: n }, () => []); }
  if (!Array.isArray(a)) a = [a];
  if (n === 1) return [toArr(a).map(plain)];
  if (a.length === n) return a.map((x) => toArr(x).map(plain));
  warn(`пропусков ${n}, а ответов ${a.length}`);
  return Array.from({ length: n }, (_, i) => toArr(a[i]).map(plain));
}

const TF_MAP = { t: 'T', true: 'T', '对': 'T', '√': 'T', yes: 'T', richtig: 'T', vrai: 'T', vero: 'T', f: 'F', false: 'F', '错': 'F', '×': 'F', no: 'F', falsch: 'F', faux: 'F', falso: 'F', ng: 'NG', 'not given': 'NG', not_given: 'NG', notgiven: 'NG' };
const normTF = (x) => TF_MAP[String(x ?? '').trim().toLowerCase()] || String(x ?? '').trim().toUpperCase();

function normalizeTest(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') throw new Error('JSON должен быть объектом.');
  const t = JSON.parse(JSON.stringify(raw));
  t.meta = t.meta || {};
  if (!Array.isArray(t.sections)) {
    if (Array.isArray(t.tasks)) t.sections = [{ title: 'Задания', tasks: t.tasks }];
    else throw new Error('В JSON нет "sections" — это не тест для тренажёра.');
  }
  if (typeof t.text === 'string') t.text = { paragraphs: t.text.split(/\n\s*\n/) };
  else if (Array.isArray(t.text)) t.text = { paragraphs: t.text };
  if (t.text && !Array.isArray(t.text.paragraphs)) t.text = null;
  if (t.text) {
    t.text.paragraphs = t.text.paragraphs.map((p) => (typeof p === 'string'
      ? { text: p, ru: '' }
      : { text: String(p.text ?? p.zh ?? p.content ?? ''), ru: String(p.ru ?? p.translation ?? '') }));
  }
  t.vocabulary = (Array.isArray(t.vocabulary) ? t.vocabulary : []).map((v) => ({
    word: plain(v.word ?? v.zh ?? v.en ?? v.hanzi ?? v.phrase ?? v.term ?? ''),
    reading: plain(v.py ?? v.pinyin ?? v.ipa ?? ''),
    forms: String(v.plural ?? v.forms ?? ''),
    gender: String(v.gender ?? '').toLowerCase().charAt(0),
    ru: v.ru ?? v.translation ?? '', in_text: v.in_text ?? '', example: v.example ?? '', example_ru: v.example_ru ?? '',
    level: v.hsk ?? v.level ?? '', pos: v.pos ?? '',
  })).filter((v) => v.word);
  t.grammar_notes = Array.isArray(t.grammar_notes) ? t.grammar_notes : [];
  t.sections.forEach((sec, si) => {
    sec.tasks = (Array.isArray(sec.tasks) ? sec.tasks : []).map((task, ti) => normTask(task, `${si}.${ti}`, warnings));
  });
  return { test: t, warnings };
}

function normTask(task, key, warnings) {
  task = { ...task };
  let type = String(task.type || '').toLowerCase().replace(/[\s-]+/g, '_');
  type = TYPE_ALIAS[type] || type;
  const label = `Задание ${task.id || key}`;
  if (!KNOWN_TYPES.includes(type)) {
    warnings.push(`${label}: неизвестный тип "${task.type}" — показано как открытое.`);
    type = 'open';
  }
  task.type = type;
  task._key = key;
  task.items = Array.isArray(task.items) ? task.items : [];

  task.items = task.items.map((it, ii) => {
    it = typeof it === 'string' ? { text: it } : { ...it };
    const w = (msg) => warnings.push(`${label}, пункт ${ii + 1}: ${msg}.`);
    if (it.audio) it.audio = plain(it.audio);
    if (type === 'gap_fill') {
      it.text = String(it.text ?? it.sentence ?? it.question ?? '');
      let parts = it.text.split(BLANK_RE);
      if (parts.length === 1) parts = [it.text + ' ', ''];
      it._parts = parts;
      it._variants = blankVariants(it, parts.length - 1, w);
    } else if (type === 'pinyin') {
      if (/[{|}]/.test(String(it.text ?? ''))) w('в тексте была подсказка пиньинем — убрана');
      it.text = plain(it.text ?? it.hanzi ?? it.word ?? '');
      it._variants = toArr(it.answers ?? it.answer ?? it.pinyin);
      if (!it._variants.length) w('нет ответа');
    } else if (type === 'multiple_choice') {
      it.question = it.question ?? it.text ?? '';
      it.options = toArr(it.options ?? it.choices);
      it._answer = resolveMC(it, w);
    } else if (type === 'true_false') {
      it.statement = it.statement ?? it.text ?? '';
      it._answer = normTF(it.answer);
    } else if (type === 'matching') {
      it.left = String(it.left ?? it.word ?? it.term ?? it.paragraph ?? it.text ?? '');
      it.answer = String(it.answer ?? it.right ?? it.definition ?? it.heading ?? '');
    } else if (type === 'word_order') {
      it.words = toArr(it.words ?? it.tokens ?? it.blocks);
      it._variants = toArr(it.answers ?? it.answer).map(plain);
      if (it.words.length < 2) w('мало блоков для составления');
      if (!it._variants.length) w('нет ответа');
    } else if (type === 'error_correction') {
      it.text = String(it.text ?? it.sentence ?? '');
      it._variants = toArr(it.answers ?? it.answer ?? it.correct).map(plain);
      if (!it._variants.length) w('нет правильного варианта');
    } else if (type === 'open') {
      it.text = String(it.text ?? it.question ?? it.prompt ?? '');
      it._variants = toArr(it.answers ?? it.answer).concat(it.model_answer ? [String(it.model_answer)] : []).map(plain);
    } else if (type === 'discussion') {
      it.text = String(it.text ?? it.question ?? '');
    }
    return it;
  });

  if (type === 'true_false') {
    task._options = toArr(task.options).map(normTF);
    if (!task._options.length) task._options = ['T', 'F', 'NG'];
    for (const it of task.items) if (it._answer && !task._options.includes(it._answer)) task._options.push(it._answer);
  }
  if (type === 'matching') {
    const all = [...task.items.map((i) => i.answer), ...toArr(task.extra)].filter(Boolean);
    task._options = seededShuffle([...new Set(all)], key + (task.id || '') + all.length);
  }
  if (type === 'writing') {
    task.required_words = toArr(task.required_words).map(plain);
    task.min = task.min_chars ?? task.min_words;
    task.max = task.max_chars ?? task.max_words;
    task.items = [{}];
  }
  return task;
}

function resolveMC(it, w) {
  const opts = it.options;
  let a = it.answer ?? it.correct;
  if (typeof a === 'number') return opts[a] ?? opts[a - 1] ?? (w('индекс ответа вне вариантов'), '');
  a = String(a ?? '').trim();
  const na = normCmp(a);
  const exact = opts.find((o) => o === a) || opts.find((o) => normCmp(o) === na);
  if (exact) return exact;
  const letter = a.match(/^([a-hA-H])(?:[).:、．]|\s|$)/);
  if (letter) {
    const rest = normCmp(a.slice(letter[0].length));
    const byRest = rest && opts.find((o) => normCmp(o) === rest);
    if (byRest) return byRest;
    const idx = LETTERS.indexOf(letter[1].toUpperCase());
    if (opts[idx]) return opts[idx];
  }
  const stripped = opts.find((o) => normCmp(o.replace(/^[a-h][).]\s*/i, '')) === na);
  if (stripped) return stripped;
  w(`ответ "${plain(a)}" не найден среди вариантов`);
  return '';
}

/* ================================================================ state */
const S = {
  init: null, rec: null, id: null, test: null, warnings: [], vmap: null, vre: null, vci: false,
  fields: [], items: [], saved: {}, checked: false, attemptSaved: false, lastInput: null,
  startedAt: 0, elapsed: 0, timerId: null, lastReport: '', firstReport: '', result: null,
};

/* ================================================================ router & global events */
window.addEventListener('hashchange', route);
$('#btn-theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  settings.theme = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = settings.theme;
  saveSettings();
});
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-py').addEventListener('click', cyclePinyin);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.altKey && e.code === 'KeyP' && isZh()) { e.preventDefault(); cyclePinyin(); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && S.test && location.hash.startsWith('#test=')) {
    e.preventDefault();
    if (!S.checked) checkAll();
  }
});
document.addEventListener('focusin', (e) => {
  if (e.target.matches && e.target.matches('input.gap, textarea.ans')) S.lastInput = e.target;
});
setLang(settings.lang);
route();

async function route() {
  closeModal();
  const lm = location.hash.match(/lang=(\w+)/);
  if (lm && LANGS[lm[1]]) { setLang(lm[1]); history.replaceState(null, '', location.pathname + location.search); }
  const m = location.hash.match(/test=([\w-]+)/);
  try {
    if (m) await openTest(m[1]);
    else await renderHome();
  } catch (e) {
    console.error(e);
    $('#view').replaceChildren(h('div', { class: 'card' }, h('h2', null, 'Ошибка'), h('div', { class: 'error-box' }, e.message), h('p', null, h('a', { href: '#' }, '← На главную'))));
  }
  window.scrollTo(0, 0);
}

/* ================================================================ prompts */
function langVars(L = TL) {
  return {
    LANG_CODE: L.code, LANG_NAME: L.name.toLowerCase(), LANG_GEN: L.gen, EXAMS: L.exams, LANG_NOTES: L.notes,
    GRAMMAR_BANK: Object.entries(L.grammar).map(([lvl, arr]) => `- **${lvl}**: ${arr.join('; ')}.`).join('\n'),
  };
}
function schemaText(L = TL) {
  return isZh() ? PROMPTS.zh.schema : fill(PROMPTS.alpha.schema, langVars(L));
}
function generatePrompt(text, focus, doneTopics) {
  const p = perLang();
  const base = {
    LEVEL: p.level, GRAMMAR_FOCUS: focus || 'auto', DONE_TOPICS: doneTopics.length ? doneTopics.join('; ') : 'пока нет',
    SCHEMA: schemaText(), TEXT: text || '[ВСТАВЬТЕ ТЕКСТ СЮДА]',
  };
  return isZh() ? fill(PROMPTS.zh.generate, base) : fill(PROMPTS.alpha.generate, { ...langVars(), ...base });
}
function reviewPrompt(level, nextRound) {
  const schema = settings.includeSchema
    ? schemaText()
    : (isZh()
      ? 'Используй ту же JSON-схему chinesetest/v1, что и в первом сообщении этого чата (разметка пиньиня {汉字|hànzì}, "audio" для аудирования, в "answers" — только иероглифы).'
      : `Используй ту же JSON-схему workbook/v2, что и в первом сообщении этого чата ("language": "${TL.code}"; типы: gap_fill, multiple_choice, true_false, matching, word_order, error_correction, open, writing, discussion; пропуск = ___; ответы с правильным регистром и диакритикой; "answer" = точный текст варианта).`);
  const tpl = isZh() ? PROMPTS.zh.review : PROMPTS.alpha.review;
  return fill(tpl, { ...langVars(), LEVEL: level, NEXT_ROUND: nextRound, SCHEMA: schema });
}

/* ================================================================ HOME */
async function renderHome() {
  stopTimer();
  S.test = null;
  $('#bar-slot').replaceChildren();
  $('#topbar-center').replaceChildren();
  document.title = `Language Workbook — ${TL.name}`;
  S.init = await api('/api/init?lang=' + TL.code);
  const { tests, stats, bank_count: bankCount, done_topics: doneTopics, counts } = S.init;
  const p = perLang();

  /* --- language picker */
  const picker = h('div', { class: 'langs' }, LANG_ORDER.map((code) => {
    const L = LANGS[code];
    const n = counts[code] || 0;
    return h('button', { class: 'lang-card' + (code === TL.code ? ' on' : ''), style: `--h:${L.hue}`, onclick: () => { if (code !== TL.code) { setLang(code); renderHome(); } } },
      h('span', { class: 'lang-badge' }, L.badge),
      h('span', null, h('b', null, L.name), h('span', { class: 'n' }, `${L.native} · ${L.levelSystem} · ${n} тест.`)));
  }));

  /* --- prompt builder */
  const levelSel = h('select', { class: 'sel' }, TL.levels.map((l) => h('option', { value: l, selected: l === p.level }, TL.levelInfo ? `${l} · ${TL.levelInfo[l]}` : l)));
  const focusInp = h('input', { class: 'txt', placeholder: 'auto — ИИ сам выберет 2–3 темы из текста', value: p.focus });
  const chipsBox = h('div', { class: 'chips' });
  const draftKey = 'draft:' + TL.code;
  const article = h('textarea', { class: 'big prose', placeholder: `Вставьте текст статьи / главы книги — на ${TL.name.toLowerCase().replace(/ий$/, 'ом')} или на русском. ИИ адаптирует его под ваш уровень.`, value: LS.get(draftKey, TL.code === 'en' ? LS.get('draftArticle', '') : '') });
  const wc = h('span', { class: 'muted small' });
  const updWc = () => {
    const n = countHanzi(article.value);
    wc.textContent = n > 20 ? `${n} иероглифов` : `${countWords(article.value)} слов`;
    LS.set(draftKey, article.value);
  };
  article.addEventListener('input', updWc); updWc();

  const renderChips = () => {
    const cur = focusInp.value.split(/\s*;\s*/).filter(Boolean);
    chipsBox.replaceChildren(...(TL.grammar[p.level] || []).map((g) => h('button', {
      class: 'chip btnlike' + (cur.includes(g) ? ' on' : ''), title: doneTopics.includes(g) ? 'уже было' : null,
      onclick: () => {
        const list = focusInp.value.split(/\s*;\s*/).filter(Boolean);
        const i = list.indexOf(g);
        if (i >= 0) list.splice(i, 1); else list.push(g);
        focusInp.value = list.join('; ');
        p.focus = focusInp.value; saveSettings(); renderChips();
      },
    }, g)));
  };
  levelSel.addEventListener('change', () => { p.level = levelSel.value; saveSettings(); renderChips(); });
  focusInp.addEventListener('input', () => { p.focus = focusInp.value; saveSettings(); renderChips(); });
  renderChips();

  const copyGen = async () => {
    const text = article.value.trim();
    const ok = await copyText(generatePrompt(text, focusInp.value.trim(), doneTopics));
    toast(ok ? (text ? 'Промт + текст скопированы. Вставьте в чат с ИИ (Ctrl+V).' : 'Промт скопирован (без текста — допишите его в чате).') : 'Не удалось скопировать', !ok);
  };

  /* --- paste json */
  const jsonArea = h('textarea', { class: 'big', placeholder: 'Вставьте ответ ИИ (можно целиком, с ```json … ```) — лишнее будет отброшено автоматически.' });
  const errBox = h('div');
  const fileInp = h('input', { type: 'file', accept: '.json,.txt,.md', style: 'display:none' });
  fileInp.addEventListener('change', async () => {
    const f = fileInp.files[0];
    if (f) { jsonArea.value = await f.text(); openFromJson(jsonArea.value, null, errBox); }
  });

  /* --- library */
  const chains = {};
  for (const t of tests) (chains[t.root_id] = chains[t.root_id] || []).push(t);
  const chainList = Object.values(chains)
    .map((c) => c.sort((a, b) => (a.created || '').localeCompare(b.created || '')))
    .sort((a, b) => (b.at(-1).created || '').localeCompare(a.at(-1).created || ''));
  const lib = chainList.length ? chainList.map((chain) => h('div', { class: 'chain' }, chain.map((t, i) => h('div', { class: 'chain-row' },
    i > 0 ? h('span', { class: 'muted small' }, '↳') : null,
    h('span', { class: 'chip' }, `R${t.round || i + 1}`),
    t.level ? h('span', { class: 'chip' }, t.level) : null,
    h('span', { class: 't', title: t.title }, t.title),
    h('span', { class: 'muted small' }, fmtDate(t.created)),
    h('span', { class: 'pct ' + pctClass(t.best_pct), title: `попыток: ${t.attempts}` }, t.best_pct == null ? '—' : t.best_pct + '%'),
    h('a', { class: 'btn sm', href: '#test=' + t.id }, 'Открыть'),
    h('button', { class: 'btn sm danger', title: 'Удалить', onclick: async () => {
      if (!confirm(`Удалить тест «${t.title}» и его попытки?`)) return;
      await api('/api/test/delete', { id: t.id });
      LS.del('ans:' + t.id);
      renderHome();
    } }, '✕'),
  )))) : [h('p', { class: 'muted' }, `Пока нет тестов (${TL.name.toLowerCase()}). Создайте первый ↑ или откройте демо.`)];

  /* --- bank */
  const copyBank = async () => {
    const bank = await api('/api/bank?lang=' + TL.code);
    if (!bank.length) return toast('Банк ошибок пуст');
    const ok = await copyText(buildBankReport(bank.slice(-60)));
    toast(ok ? `Скопировано: ${Math.min(60, bank.length)} последних ошибок + промт. Вставьте в чат с ИИ.` : 'Не удалось скопировать', !ok);
  };

  $('#view').replaceChildren(
    picker,
    h('div', { class: 'steps' },
      h('div', { class: 'step' }, h('b', null, 'Шаг 1'), 'Выберите язык, вставьте текст и скопируйте промт → отправьте ИИ'),
      h('div', { class: 'step' }, h('b', null, 'Шаг 2'), 'Вставьте JSON-ответ ИИ → решайте тест'),
      h('div', { class: 'step' }, h('b', null, 'Шаг 3'), '«Проверить» → ваши ошибки уже в буфере, отправьте ИИ'),
      h('div', { class: 'step' }, h('b', null, 'Шаг 4'), 'ИИ присылает разбор + JSON повторения → вставьте его, повторяйте до 100%'),
    ),
    h('div', { class: 'grid-2' },
      h('div', { class: 'card' },
        h('h2', null, `1. Новый тест · ${TL.name}`),
        h('p', { class: 'sub' }, `Промт, уровень (${TL.levelSystem}), грамматика и текст собираются в одно сообщение для ИИ.`),
        h('div', { class: 'row' },
          h('label', { class: 'field', style: `width:${isZh() ? 190 : 110}px` }, 'Уровень', levelSel),
          h('label', { class: 'field', style: 'flex:1' }, 'Грамматический фокус (через ;)', focusInp)),
        h('div', { class: 'row' }, chipsBox),
        h('div', { class: 'row' }, article),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: copyGen }, '📋 Скопировать промт + текст'), wc,
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn sm', onclick: () => { article.value = ''; updWc(); } }, 'Очистить')),
      ),
      h('div', null,
        h('div', { class: 'card' },
          h('h2', null, '2. Вставить JSON от ИИ'),
          h('p', { class: 'sub' }, 'Ответ можно вставлять целиком — программа сама найдёт JSON, определит язык и починит мелкие огрехи.'),
          jsonArea, errBox,
          h('div', { class: 'row', style: 'margin-top:10px' },
            h('button', { class: 'btn primary', onclick: () => openFromJson(jsonArea.value, null, errBox) }, '▶ Открыть тест'),
            h('button', { class: 'btn', onclick: () => fileInp.click() }, 'Из файла…'), fileInp,
            h('button', { class: 'btn', onclick: async () => {
              try { jsonArea.value = await navigator.clipboard.readText(); openFromJson(jsonArea.value, null, errBox); }
              catch { toast('Браузер не дал прочитать буфер — вставьте вручную (Ctrl+V)', true); }
            } }, 'Вставить из буфера'))),
        dataCard(),
        h('div', { class: 'card' },
          h('h2', null, 'Банк ошибок'),
          h('p', { class: 'sub' }, `Ошибки из всех тестов (${TL.name.toLowerCase()}) копятся здесь. Можно попросить ИИ сделать тест по всем сразу.`),
          h('div', { class: 'row' },
            h('span', { class: 'stat' }, h('b', null, bankCount), h('span', null, 'ошибок в банке')),
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn', onclick: copyBank, disabled: !bankCount }, '📋 Промт: тест по банку ошибок'),
            h('button', { class: 'btn sm danger', disabled: !bankCount, onclick: async () => {
              if (!confirm(`Очистить банк ошибок (${TL.name.toLowerCase()})?`)) return;
              await api('/api/bank/clear', { lang: TL.code }); renderHome();
            } }, 'Очистить'))),
      ),
    ),
    h('div', { class: 'card', style: 'margin-top:18px' },
      h('div', { class: 'row', style: 'margin-bottom:12px' },
        h('h2', { style: 'margin:0' }, `Мои тесты · ${TL.name}`), h('span', { class: 'spacer' }),
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('b', null, stats.attempts), h('span', null, 'попыток')),
          h('div', { class: 'stat' }, h('b', { class: 'pct ' + pctClass(stats.avg_pct) }, stats.avg_pct == null ? '—' : stats.avg_pct + '%'), h('span', null, 'средний результат')),
          h('div', { class: 'stat' }, h('b', null, stats.minutes), h('span', null, 'минут практики')))),
      lib),
  );
}

function dataCard() {
  const fileInp = h('input', { type: 'file', accept: '.json', style: 'display:none' });
  fileInp.addEventListener('change', async () => {
    const f = fileInp.files[0];
    if (!f) return;
    try {
      const n = store.importAll(JSON.parse(await f.text()));
      toast(`Импортировано тестов: ${n}`);
      renderHome();
    } catch (e) { toast(e.message, true, 6000); }
  });
  const download = () => {
    const blob = new Blob([JSON.stringify(store.exportAll(), null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `language-workbook-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
  };
  const demo = window.DEMO_TESTS && window.DEMO_TESTS[TL.code];
  return h('div', { class: 'card' },
    h('h2', null, 'Данные'),
    h('p', { class: 'sub' }, DB.persistent
      ? 'Тесты и результаты всех языков хранятся только в этом браузере. Для переноса на другое устройство — резервная копия.'
      : '⚠ Браузер запретил сохранение (приватный режим?) — данные пропадут после закрытия вкладки.'),
    h('div', { class: 'row' },
      demo ? h('button', { class: 'btn', onclick: async () => {
        const { id } = await api('/api/test', { test: demo, lang: TL.code });
        location.hash = '#test=' + id;
      } }, '▶ Демо-тест') : null,
      h('button', { class: 'btn', onclick: download }, '⬇ Резервная копия'),
      h('button', { class: 'btn', onclick: () => fileInp.click() }, '⬆ Восстановить'), fileInp,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm danger', onclick: () => {
        if (!confirm('Удалить ВСЕ тесты, попытки и банк ошибок (всех языков) из этого браузера?')) return;
        store.wipe(); renderHome();
      } }, 'Удалить всё')));
}

async function openFromJson(raw, parentId, errBox) {
  errBox.replaceChildren();
  try {
    const parsed = parseLenient(raw);
    let lang = detectLang(parsed);
    if (parentId) {
      const parent = store.get(parentId);
      lang = lang || (parent && (parent.lang || 'en'));
    }
    lang = lang || TL.code;
    if (lang !== TL.code) toast(`Это тест на язык «${LANGS[lang].name}» — открываю в этом разделе.`);
    const prev = TL;
    TL = LANGS[lang];
    let warnings;
    try { ({ warnings } = normalizeTest(parsed)); } finally { TL = prev; }
    const { id } = await api('/api/test', { test: parsed, parent_id: parentId, lang });
    if (warnings.length) toast(`Тест открыт, но есть ${warnings.length} замечаний к JSON (см. вверху страницы)`);
    location.hash = '#test=' + id;
  } catch (e) {
    errBox.replaceChildren(h('div', { class: 'error-box' }, e.message));
  }
}

/* ================================================================ TEST */
async function openTest(id) {
  stopTimer();
  const rec = await api('/api/test?id=' + encodeURIComponent(id));
  setLang(rec.lang);
  S.init = await api('/api/init?lang=' + rec.lang);
  const { test, warnings } = normalizeTest(rec.test);
  Object.assign(S, {
    rec, id, test, warnings, fields: [], items: [], saved: LS.get('ans:' + id, {}), lastInput: null,
    checked: false, attemptSaved: false, lastReport: '', firstReport: '', result: null,
  });
  buildVocabIndex(test.vocabulary);
  renderTest();
}

const ARTICLE_RE = /^(?:(?:to|the|a|an|der|die|das|den|dem|des|ein|eine|le|la|les|un|une|des|il|lo|gli|i|uno|una)\s+|(?:l'|un'))/i;
function buildVocabIndex(vocab) {
  S.vmap = new Map();
  if (isZh()) {
    S.vci = false;
    for (const v of vocab) S.vmap.set(v.word, v);
    const terms = [...S.vmap.keys()].filter((k) => [...k].length >= 2 || vocab.length < 8)
      .sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    S.vre = terms.length ? new RegExp(`(${terms.join('|')})`, 'g') : null;
    return;
  }
  S.vci = true;
  for (const v of vocab) {
    const core = v.word.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[’]/g, "'").trim().replace(ARTICLE_RE, '').trim();
    for (const term of [v.in_text, core]) {
      if (term && term.length >= 3 && !S.vmap.has(term.toLowerCase())) S.vmap.set(term.toLowerCase(), v);
    }
  }
  const terms = [...S.vmap.keys()].sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  S.vre = terms.length ? new RegExp(`(?<![\\p{L}])(${terms.join('|')})(?![\\p{L}])`, 'giu') : null;
}

function renderTest() {
  const t = S.test, meta = t.meta;
  document.title = (meta.title || 'Тест') + ' — Language Workbook';
  S.fields = []; S.items = []; S.checked = false;

  $('#topbar-center').replaceChildren(h('a', { class: 'btn sm', href: '#' }, '← Все тесты'), h('span', { class: 'chip' }, TL.name), h('span', { class: 'timer', id: 'timer' }, '00:00'));

  const tabs = [];
  if (t.review && (t.review.summary || (t.review.items || []).length)) tabs.push(['Разбор ошибок', renderReview(t.review)]);
  if (t.text && t.text.paragraphs.length) tabs.push([isZh() ? '课文 Текст' : 'Текст', renderArticle(t)]);
  if (t.vocabulary.length) tabs.push([`${isZh() ? '生词 ' : ''}Словарь (${t.vocabulary.length})`, renderVocab(t.vocabulary, meta.title)]);
  if (t.grammar_notes.length) tabs.push([isZh() ? '语法 Грамматика' : 'Грамматика', renderGrammar(t.grammar_notes)]);

  let side = null;
  if (tabs.length) {
    const tabBar = h('div', { class: 'tabs' });
    const body = h('div', { class: 'tab-body' });
    const panes = tabs.map(([, el]) => h('div', { class: 'tab-pane' }, el));
    const btns = tabs.map(([name], i) => h('button', { class: 'tab', onclick: () => select(i) }, name));
    const select = (i) => { btns.forEach((b, j) => b.classList.toggle('on', i === j)); panes.forEach((p, j) => { p.hidden = i !== j; }); body.scrollTop = 0; LS.set('tab:' + S.id, i); };
    tabBar.append(...btns); body.append(...panes);
    select(Math.min(LS.get('tab:' + S.id, 0), tabs.length - 1));
    side = h('aside', { class: 'card side' }, tabBar, body);
  }

  const main = h('div', { class: 'tasks' });
  t.sections.forEach((sec) => {
    if (!sec.tasks.length) return;
    main.append(h('h2', { class: 'section-title' }, rich(sec.title || '')));
    sec.tasks.forEach((task) => main.append(renderTask(task, sec)));
  });

  const nextArea = h('textarea', { class: 'big', id: 'next-json', placeholder: 'Вставьте сюда ответ ИИ с JSON для повторения…' });
  const nextErr = h('div');
  const nextRound = (meta.round || 1) + 1;
  main.append(h('div', { class: 'card next-box', id: 'next-box' },
    h('h2', null, `Следующий раунд (${nextRound}): JSON для повторения`),
    h('p', { class: 'sub' }, 'После проверки ваши ошибки окажутся в буфере обмена. Отправьте их ИИ, а его ответ (разбор + JSON) вставьте сюда.'),
    nextArea, nextErr,
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'btn primary', onclick: () => openFromJson(nextArea.value, S.id, nextErr) }, `▶ Открыть раунд ${nextRound}`),
      h('button', { class: 'btn', onclick: async () => {
        try { nextArea.value = await navigator.clipboard.readText(); openFromJson(nextArea.value, S.id, nextErr); }
        catch { toast('Браузер не дал прочитать буфер — вставьте вручную (Ctrl+V)', true); }
      } }, 'Вставить из буфера'))));

  const head = h('div', { class: 'test-head' },
    h('div', { style: 'flex:1;min-width:0' },
      h('h1', null, meta.title || plain(t.text && t.text.title) || 'Тест'),
      h('div', { class: 'chips', style: 'margin-top:8px' },
        meta.level ? h('span', { class: 'chip' }, meta.level) : null,
        h('span', { class: 'chip' }, `Раунд ${meta.round || 1}`),
        meta.topic ? h('span', { class: 'chip' }, meta.topic) : null,
        (meta.grammar_topics || []).map((g) => h('span', { class: 'chip info' }, plain(g))))));

  const warn = S.warnings.length ? h('details', { class: 'warn-box' },
    h('summary', null, `⚠ Замечания к JSON (${S.warnings.length}) — некоторые ответы могут проверяться неточно`),
    h('ul', null, S.warnings.map((w) => h('li', null, w)))) : null;

  $('#view').replaceChildren(...[head, warn].filter(Boolean), h('div', { class: 'test-layout' + (side ? ' with-side' : '') }, side, main));

  for (const f of S.fields) {
    if (S.saved[f.key] != null) setVal(f, S.saved[f.key]);
    if (f.onRestore) f.onRestore();
  }
  for (const sec of t.sections) for (const task of sec.tasks) if (task._boxEl) markBoxUsage(task);
  renderBar();
  startTimer();
}

/* ---------- side panel */
function renderArticle(t) {
  const ruEls = [];
  const paras = t.text.paragraphs.map((p, i) => {
    const ru = p.ru ? h('p', { class: 'ru', hidden: true }, p.ru) : null;
    if (ru) ruEls.push(ru);
    return h('div', { class: 'para' },
      h('div', { class: 'para-side' },
        h('span', { class: 'para-n' }, i + 1),
        h('button', { class: 'mini', title: 'Прочитать абзац', onclick: () => speak(p.text) }, '🔊'),
        ru ? h('button', { class: 'mini', title: 'Перевод абзаца', onclick: () => { ru.hidden = !ru.hidden; } }, 'RU') : null),
      h('div', null, h('p', { class: 'ptext' }, rich(p.text, { vocab: true })), ru));
  });
  const wrap = h('div', { class: 'article' },
    t.text.title ? h('h2', null, rich(t.text.title)) : null,
    t.text.title_ru ? h('p', { class: 'title-ru' }, t.text.title_ru) : null,
    h('div', { class: 'tools' },
      h('button', { class: 'btn sm', onclick: () => { speechSynthesis.cancel(); t.text.paragraphs.forEach((p) => speak(p.text, { queue: true })); } }, '🔊 Читать весь текст'),
      h('button', { class: 'btn sm', onclick: () => speechSynthesis.cancel() }, '⏹'),
      ruEls.length ? h('button', { class: 'btn sm', onclick: () => { const show = ruEls.some((r) => r.hidden); ruEls.forEach((r) => { r.hidden = !show; }); } }, 'RU Перевод абзацев') : null,
      h('span', { class: 'small muted' }, isZh()
        ? 'Клик по слову — пиньинь + озвучка; подсвеченные — слова урока (наведите для перевода).'
        : 'Подсвеченные — слова урока (наведите — перевод, клик — произношение); двойной клик по любому слову — озвучить.')),
    paras);
  if (!isZh()) wrap.addEventListener('dblclick', () => { const s = String(getSelection() || '').trim(); if (s) speak(s); });
  return wrap;
}

function renderVocab(vocab, title) {
  const zh = isZh();
  const hasRd = vocab.some((v) => v.reading || v.forms);
  const table = h('table', { class: 'vt' },
    h('thead', null, h('tr', null,
      h('th', null, zh ? '汉字' : 'Слово'),
      hasRd ? h('th', null, zh ? 'Пиньинь' : 'Формы') : null,
      h('th', null, 'Перевод и пример'))),
    h('tbody', null, vocab.map((v) => h('tr', null,
      h('td', { class: 'w' },
        h('span', { class: v.gender ? 'g-' + v.gender : null, style: 'cursor:pointer', title: 'Произнести', onclick: () => speak(v.word) }, v.word),
        v.level ? h('span', { class: 'lvl' }, (zh ? 'HSK' : '') + String(v.level).replace(/^HSK/i, '')) : null,
        h('div', null,
          h('button', { class: 'say', title: 'Произнести', onclick: () => speak(v.word) }, '🔊'),
          zh ? h('button', { class: 'say', title: 'Порядок черт и тренировка написания', onclick: () => showStrokes(v.word) }, '✍') : null)),
      hasRd ? h('td', { class: 'rd' }, h('span', { onclick: (e) => e.currentTarget.classList.toggle('shown') },
        [v.reading, v.forms].filter(Boolean).join(zh ? ' ' : ' · '))) : null,
      h('td', { class: 'ru' },
        h('span', { onclick: (e) => e.currentTarget.classList.toggle('shown') }, v.ru),
        v.pos ? h('span', { class: 'muted small' }, ` · ${v.pos}`) : null,
        v.example ? h('div', { class: 'ex' }, h('div', { class: 'exl' }, rich(v.example)), v.example_ru ? h('div', null, v.example_ru) : null) : null)))));
  const cb = (label, cls) => h('label', { class: 'small muted', style: 'display:flex;gap:6px;align-items:center;cursor:pointer' },
    h('input', { type: 'checkbox', onchange: (e) => table.classList.toggle(cls, e.target.checked) }), label);
  const exportAnki = () => {
    const lines = vocab.map((v) => [v.word, [v.reading, v.forms].filter(Boolean).join(' · '), v.ru, plain(v.example) + (v.example_ru ? ' — ' + v.example_ru : '')]
      .map((x) => String(x).replace(/\t|\n/g, ' ')).join('\t'));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${(title || 'words').replace(/[\\/:*?"<>|]/g, '_')}.txt` });
    document.body.append(a); a.click(); a.remove();
    toast('Файл для Anki скачан: Файл → Импорт, разделитель — табуляция.');
  };
  return h('div', null,
    h('div', { class: 'tools' },
      hasRd ? cb(zh ? 'Скрыть пиньинь' : 'Скрыть формы', 'hide-rd') : null, cb('Скрыть перевод', 'hide-ru'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', onclick: exportAnki }, '⬇ Anki')),
    TL.genders ? h('p', { class: 'small muted', style: 'margin-top:-6px' }, 'Цвет — род: ', h('span', { class: 'g-m' }, 'мужской'), ' · ', h('span', { class: 'g-f' }, 'женский'), TL.genders.n ? [' · ', h('span', { class: 'g-n' }, 'средний')] : null, '. Клик по размытому — показать.') : null,
    table);
}

function renderGrammar(notes) {
  return h('div', null, notes.map((n) => h('div', { class: 'gnote' },
    h('h3', null, rich(n.title || '')),
    n.explanation ? h('p', null, rich(n.explanation)) : null,
    (n.examples || []).length ? h('ul', null, n.examples.map((e) => h('li', null, rich(e)))) : null)));
}

function renderReview(r) {
  return h('div', null,
    r.summary ? h('div', { class: 'notice info' }, r.summary) : null,
    (r.items || []).map((it) => h('div', { class: 'review-item' },
      it.rule ? h('div', { class: 'rule' }, plain(it.rule)) : null,
      h('div', null, it.mistake ? h('span', { class: 'mis' }, plain(it.mistake)) : null, it.mistake ? ' → ' : '', h('span', { class: 'cor' }, rich(it.correct || ''))),
      it.explanation ? h('div', { class: 'small muted' }, rich(it.explanation)) : null)));
}

/* ---------- stroke order (китайский; HanziWriter загружается по требованию) */
let hwPromise = null;
function loadHanziWriter() {
  if (window.HanziWriter) return Promise.resolve();
  hwPromise = hwPromise || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5.0/dist/hanzi-writer.min.js';
    s.onload = resolve;
    s.onerror = () => { hwPromise = null; reject(new Error('Не удалось загрузить модуль иероглифов (нужен интернет).')); };
    document.head.append(s);
  });
  return hwPromise;
}
async function showStrokes(word) {
  const chars = [...word].filter((c) => CJK_RE.test(c));
  if (!chars.length) return;
  const cont = h('div', { class: 'strokes' }, h('span', { class: 'muted' }, 'Загрузка…'));
  modal(h('h2', { style: 'font-family:var(--zh)' }, word), h('p', { class: 'small muted', style: 'margin:0' }, '«Анимация» — порядок черт. «Написать» — нарисуйте иероглиф мышью / пальцем, программа подскажет ошибки.'),
    cont, h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: closeModal }, 'Закрыть')));
  try { await loadHanziWriter(); } catch (e) { cont.replaceChildren(h('div', { class: 'error-box' }, e.message)); return; }
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  cont.replaceChildren();
  chars.forEach((c) => {
    const box = h('div', { class: 'stroke-box' });
    const wrap = h('div', { style: 'text-align:center' }, box);
    cont.append(wrap);
    const writer = window.HanziWriter.create(box, c, {
      width: 160, height: 160, padding: 10, showOutline: true, showCharacter: true,
      strokeColor: col('--text'), outlineColor: col('--border'), drawingColor: col('--accent'), highlightColor: col('--py'),
      strokeAnimationSpeed: 1, delayBetweenStrokes: 220,
      onLoadCharDataError: () => box.replaceChildren(h('div', { class: 'muted small', style: 'padding:60px 10px' }, 'нет данных')),
    });
    wrap.append(h('div', { class: 'row', style: 'justify-content:center;margin-top:6px' },
      h('button', { class: 'btn sm', onclick: () => writer.animateCharacter() }, '▶ Анимация'),
      h('button', { class: 'btn sm', onclick: () => writer.quiz({ onComplete: (d) => toast(`${c}: готово, ошибок — ${d.totalMistakes}`) }) }, '✍ Написать')));
  });
}

/* ---------- tasks */
function audioControls(text, transcriptEl) {
  return h('div', null,
    h('button', { class: 'play', type: 'button', onclick: () => speak(text) }, '▶ Слушать'),
    h('button', { class: 'play slow', type: 'button', onclick: () => speak(text, { rate: 0.6 }) }, '🐢 Медленно'),
    transcriptEl);
}

function renderTask(task, sec) {
  const scoreEl = h('span', { class: 'task-score' });
  const wrap = h('div', { class: 'card task' },
    h('div', { class: 'task-head' },
      task.id ? h('span', { class: 'task-id' }, task.id) : null,
      h('span', { class: 'task-title' }, rich(task.title || '')),
      task.instruction_zh ? h('span', { class: 'task-sub' }, rich(task.instruction_zh)) : null,
      scoreEl),
    task.instruction ? h('p', { class: 'instr' }, rich(task.instruction)) : null);
  task._scoreEl = scoreEl;
  const ctx = { task, sec };

  if (task.type === 'matching') { wrap.append(renderMatching(ctx)); return wrap; }
  if (task.type === 'writing') { wrap.append(renderWriting(ctx)); return wrap; }

  if (Array.isArray(task.box) && task.box.length) {
    const box = h('div', { class: 'box chips' }, task.box.map((w) => {
      const chip = h('button', { class: 'chip btnlike', title: 'Вставить в активное поле' }, rich(w));
      chip.dataset.plain = plain(w);
      chip.addEventListener('click', () => {
        const inp = task._lastInput;
        if (inp && !inp.readOnly) { inp.value = plain(w); inp.dispatchEvent(new Event('input')); inp.focus(); }
      });
      return chip;
    }));
    wrap.append(box);
    task._boxEl = box;
  }

  task.items.forEach((it, ii) => {
    const io = { task, sec, it, ii, fields: [], fb: h('div', { class: 'fb' }) };
    const body = h('div', { class: 'item-body' });
    io.el = h('div', { class: 'item' }, h('div', { class: 'item-n' }, ii + 1), body);
    S.items.push(io);

    if (it.audio && task.type !== 'discussion') {
      io.transcript = h('div', { class: 'transcript', hidden: true }, '📝 ', it.audio);
      body.append(audioControls(it.audio, io.transcript));
    }

    if (task.type === 'gap_fill') {
      if (it.prompt) body.append(h('div', { class: 'orig' }, rich(it.prompt)));
      if (it.key) body.append(h('div', { class: 'key' }, it.key));
      if (it.ru) body.append(h('div', { class: 'hint-ru' }, it.ru));
      const sentence = h('div', { class: 'sentence' });
      it._parts.forEach((part, bi) => {
        sentence.append(...rich(part));
        if (bi < it._parts.length - 1) {
          const inp = h('input', { class: 'gap', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', lang: TL.tts });
          const grow = () => {
            const w = [...inp.value].reduce((n, c) => n + (CJK_RE.test(c) ? 2.2 : 1), 0);
            inp.style.width = Math.max(9, w + 3) + 'ch';
          };
          inp.addEventListener('input', grow);
          inp.addEventListener('focus', () => { task._lastInput = inp; });
          const before = it._parts.slice(0, bi + 1).join('x');
          addField({ kind: 'text', mode: 'gap', el: inp, io, bi, nBlanks: it._parts.length - 1, variants: it._variants[bi] || [], sentenceStart: isSentenceStart(before), onRestore: grow });
          sentence.append(inp);
        }
      });
      body.append(sentence);
    } else if (task.type === 'pinyin') {
      const inp = h('input', { class: 'gap pyin', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'nǐ hǎo / ni3 hao3' });
      inp.addEventListener('input', () => { if (/[0-5]/.test(inp.value)) inp.value = numToMark(inp.value); });
      body.append(h('div', { class: 'row', style: 'gap:16px' },
        h('span', { class: 'big-hz', style: 'cursor:pointer', title: 'Произнести', onclick: () => speak(it.text) }, it.text),
        inp, it.ru ? h('span', { class: 'hint-ru' }, it.ru) : null));
      addField({ kind: 'text', mode: 'pinyin', el: inp, io, variants: it._variants });
    } else if (task.type === 'multiple_choice') {
      if (it.question) body.append(h('div', { class: 'sentence', style: 'line-height:1.7' }, rich(it.question)));
      const long = it.options.some((o) => plain(o).length > (isZh() ? 16 : 40));
      const name = 'r' + task._key + '_' + ii;
      const group = h('div', { class: 'opts' + (long ? ' vertical' : '') }, it.options.map((o, oi) => h('label', { class: 'opt' },
        h('input', { type: 'radio', name, value: o }),
        h('span', null, h('span', { class: 'letter' }, LETTERS[oi]), rich(o)))));
      body.append(group);
      addField({ kind: 'radio', el: group, io, answer: it._answer });
    } else if (task.type === 'true_false') {
      body.append(h('div', { class: 'sentence', style: 'line-height:1.7' }, rich(it.statement)));
      const name = 'r' + task._key + '_' + ii;
      const labels = tfLabels();
      const group = h('div', { class: 'opts' }, task._options.map((o) => h('label', { class: 'opt' },
        h('input', { type: 'radio', name, value: o }), h('span', null, labels[o] || o))));
      body.append(group);
      addField({ kind: 'radio', el: group, io, answer: it._answer, labels });
    } else if (task.type === 'word_order') {
      if (it.ru) body.append(h('div', { class: 'hint-ru' }, it.ru));
      body.append(renderWordOrder(task, it, io, ii));
    } else if (task.type === 'error_correction') {
      body.append(h('div', { class: 'orig' }, rich(it.text)));
      const ta = h('textarea', { class: 'ans', rows: 1, spellcheck: 'false', lang: TL.tts, placeholder: 'Перепишите предложение правильно…' });
      ta.value = plain(it.text);
      body.append(ta);
      addField({ kind: 'area', mode: 'ec', el: ta, io, variants: it._variants, initial: ta.value });
    } else if (task.type === 'open') {
      body.append(h('div', { class: 'sentence', style: 'line-height:1.8' }, rich(it.text)));
      const ta = h('textarea', { class: 'ans', rows: 2, spellcheck: 'true', lang: TL.tts, placeholder: isZh() ? 'Ваш ответ иероглифами…' : `Ваш ответ (${TL.name.toLowerCase()})…` });
      body.append(ta);
      addField({ kind: 'area', mode: 'open', el: ta, io, variants: it._variants });
    } else if (task.type === 'discussion') {
      body.append(h('div', { class: 'sentence', style: 'line-height:1.8' }, rich(it.text), h('button', { class: 'say', onclick: () => speak(it.text) }, '🔊')));
      if (it.ru) body.append(h('div', { class: 'hint-ru' }, it.ru));
    }
    body.append(io.fb);
    wrap.append(io.el);
  });
  return wrap;
}

function renderWordOrder(task, it, io, ii) {
  const tokens = it.words;
  let order = seededShuffle(tokens.map((_, i) => i), task._key + ':' + ii);
  if (tokens.length > 2 && order.every((x, i) => x === i)) order = order.slice(1).concat(order[0]);
  const line = h('div', { class: 'wo-line' });
  const pool = h('div', { class: 'wo-pool' });
  const wrapEl = h('div', null, line, pool);
  const f = { kind: 'order', mode: 'order', el: wrapEl, statusEl: line, io, tokens, seq: [], variants: it._variants };
  const poolBtns = order.map((ti) => {
    const b = h('button', { class: 'wo-tok', type: 'button' }, rich(tokens[ti]));
    b.addEventListener('click', () => { if (f.locked || f.seq.includes(ti)) return; f.seq.push(ti); f.render(); f.notify(); });
    return [ti, b];
  });
  pool.append(...poolBtns.map(([, b]) => b));
  f.render = () => {
    line.replaceChildren(...f.seq.map((ti, pos) => {
      const b = h('button', { class: 'wo-tok', type: 'button' }, rich(tokens[ti]));
      b.addEventListener('click', () => { if (f.locked) return; f.seq.splice(pos, 1); f.render(); f.notify(); });
      return b;
    }));
    for (const [ti, b] of poolBtns) b.disabled = f.seq.includes(ti);
  };
  addField(f);
  return wrapEl;
}

function renderMatching({ task, sec }) {
  const opts = task._options;
  const left = h('div', { class: 'match-left' });
  task.items.forEach((it, ii) => {
    const io = { task, sec, it, ii, fields: [], fb: h('div', { class: 'fb' }) };
    const sel = h('select', { class: 'msel' }, h('option', { value: '' }, '—'),
      opts.map((o, oi) => h('option', { value: o, title: plain(o) }, LETTERS[oi])));
    io.el = h('div', { class: 'item' },
      h('div', { class: 'item-n' }, ii + 1),
      h('div', { class: 'item-body' }, h('div', null, rich(it.left)), io.fb), sel);
    S.items.push(io);
    left.append(io.el);
    addField({ kind: 'select', el: sel, io, answer: it.answer, letterOf: (v) => LETTERS[opts.indexOf(v)] });
  });
  const right = h('div', { class: 'match-right' }, h('ol', null, opts.map((o) => h('li', null, rich(o)))));
  return h('div', { class: 'match-grid' }, left, right);
}

function renderWriting({ task, sec }) {
  const io = { task, sec, it: task.items[0], ii: 0, fields: [], fb: h('div', { class: 'fb' }) };
  const zh = isZh();
  const ta = h('textarea', { class: 'ans essay', spellcheck: 'true', lang: TL.tts, placeholder: 'Пишите здесь…' });
  const counter = h('span');
  const chips = task.required_words.map((w) => ({ w, el: h('span', { class: 'chip' }, w) }));
  const upd = () => {
    const n = zh ? countHanzi(ta.value) : countWords(ta.value);
    const { min, max } = task;
    counter.textContent = `${n} ${zh ? 'иероглифов' : 'слов'}` + (min || max ? ` (нужно ${min || '?'}–${max || '?'})` : '');
    counter.style.color = min && n < min ? 'var(--warn)' : max && n > max ? 'var(--bad)' : 'var(--ok)';
    const low = stripMarks(ta.value.toLowerCase());
    for (const c of chips) {
      if (zh) { c.el.classList.toggle('hit', ta.value.includes(c.w)); continue; }
      const core = stripMarks(c.w.toLowerCase().replace(/\s*\(.*?\)/g, '').trim().replace(ARTICLE_RE, '').trim());
      const stem = core.split(' ').map((x) => (x.length > 5 ? x.slice(0, x.length - 2) : x)).join(' ');
      c.el.classList.toggle('hit', low.includes(core) || low.includes(stem));
    }
  };
  ta.addEventListener('input', upd);
  io.el = h('div', null, ta, h('div', { class: 'wc' }, counter, chips.length ? h('span', null, 'Обязательные слова:') : null, chips.map((c) => c.el)), io.fb);
  S.items.push(io);
  addField({ kind: 'area', mode: 'writing', el: ta, io, onRestore: upd });
  return io.el;
}

/* ---------- fields */
function addField(f) {
  f.key = `${f.io.task._key}.${f.io.ii}.${f.bi || 0}`;
  f.mode = f.mode || 'choice';
  f.status = null;
  f.io.fields.push(f);
  S.fields.push(f);
  f.notify = () => {
    S.saved[f.key] = rawVal(f);
    LS.set('ans:' + S.id, S.saved);
    updateProgress();
    if (f.io.task._boxEl) markBoxUsage(f.io.task);
  };
  if (f.kind !== 'order') {
    f.el.addEventListener('input', f.notify);
    f.el.addEventListener('change', f.notify);
  }
  if (f.kind === 'text') {
    f.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.isComposing) {
        e.preventDefault();
        const list = S.fields.filter((x) => x.kind === 'text' && !x.el.readOnly);
        const i = list.indexOf(f);
        if (list[i + 1]) list[i + 1].el.focus();
      }
    });
  }
}

function markBoxUsage(task) {
  const used = S.fields.filter((f) => f.io.task === task).map((f) => normCmp(getVal(f)));
  $$('.chip', task._boxEl).forEach((c) => c.classList.toggle('used', used.includes(normCmp(c.dataset.plain))));
}

function getVal(f) {
  if (f.kind === 'radio') { const c = $('input:checked', f.el); return c ? c.value : ''; }
  if (f.kind === 'order') {
    const words = f.seq.map((i) => plain(f.tokens[i]));
    return isZh() ? words.join('') : words.join(' ');
  }
  return f.el.value;
}
const rawVal = (f) => (f.kind === 'order' ? f.seq.join(',') : getVal(f));
function setVal(f, v) {
  if (f.kind === 'radio') $$('input', f.el).forEach((i) => { i.checked = i.value === v; });
  else if (f.kind === 'order') {
    f.seq = [...new Set(String(v || '').split(',').filter((x) => x !== '').map(Number).filter((n) => n >= 0 && n < f.tokens.length))];
    f.render();
  } else f.el.value = v;
}
function lockField(f, locked) {
  if (f.kind === 'radio') $$('input', f.el).forEach((i) => { i.disabled = locked; });
  else if (f.kind === 'select') f.el.disabled = locked;
  else if (f.kind === 'order') f.el.classList.toggle('locked', locked);
  else f.el.readOnly = locked;
}
const statusEl = (f) => f.statusEl || f.el;
const isGradable = (f) => ['gap', 'pinyin', 'choice', 'ec', 'order'].includes(f.mode);
const isFilled = (f) => {
  const v = getVal(f).trim();
  return f.mode === 'ec' ? v && v !== f.initial : !!v;
};

/* ---------- bottom bar */
function insertChar(c) {
  const el = S.lastInput;
  if (!el || !document.body.contains(el) || el.readOnly) { toast('Сначала кликните в поле ввода'); return; }
  const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
  el.setRangeText(c, s, e, 'end');
  el.dispatchEvent(new Event('input'));
  el.focus();
}
function renderBar() {
  const slot = $('#bar-slot');
  const prog = h('div', { class: 'progress' }, h('i', { id: 'prog-i' }));
  const progTxt = h('span', { class: 'small muted', id: 'prog-t' });
  const charbar = TL.chars.length ? h('div', { class: 'charbar', title: 'Вставить символ в активное поле' },
    TL.chars.map((c) => h('button', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => insertChar(c) }, c))) : null;
  let content;
  if (!S.checked) {
    content = [charbar, prog, progTxt,
      h('button', { class: 'btn', onclick: resetAll, title: 'Стереть все ответы' }, 'Сбросить'),
      h('button', { class: 'btn primary', onclick: checkAll }, '✓ Проверить', h('span', { class: 'small', style: 'opacity:.7' }, 'Ctrl+Enter'))];
  } else {
    const r = S.result;
    const hasMistakes = S.fields.some((f) => MISTAKE.includes(f.status));
    content = [
      h('span', { class: 'score pct ' + pctClass(r.pct) }, `${r.correct}/${r.total} · ${r.pct}%`),
      h('button', { class: 'btn', onclick: showResultModal }, '📋 Отчёт'),
      hasMistakes ? h('button', { class: 'btn', onclick: retryMistakes }, '↻ Перерешать ошибки') : null,
      h('button', { class: 'btn', onclick: resetAll }, 'Заново'),
      h('button', { class: 'btn primary', onclick: () => { $('#next-box').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => $('#next-json').focus(), 400); } }, '→ JSON повторения'),
    ];
  }
  slot.replaceChildren(h('div', { class: 'bar' }, content));
  updateProgress();
}

function updateProgress() {
  const all = S.fields.filter((f) => f.mode !== 'writing');
  const done = all.filter(isFilled).length;
  const i = $('#prog-i'), t = $('#prog-t');
  if (i) i.style.width = (all.length ? (100 * done) / all.length : 0) + '%';
  if (t) t.textContent = `${done}/${all.length}`;
}

/* ---------- timer */
function startTimer(base) {
  stopTimer();
  S.startedAt = base || Date.now();
  S.timerId = setInterval(() => {
    const el = $('#timer');
    if (!el) return;
    const s = Math.floor((Date.now() - S.startedAt) / 1000);
    el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
}
function stopTimer() {
  if (S.timerId) clearInterval(S.timerId);
  S.timerId = null;
}

/* ---------- checking */
const MISTAKE = ['wrong', 'case', 'accent', 'tone', 'empty'];
const STATUS_CLASSES = ['st-correct', 'st-wrong', 'st-case', 'st-accent', 'st-tone', 'st-empty', 'st-review'];

function gradeField(f) {
  const v = getVal(f);
  switch (f.mode) {
    case 'gap': return gradeText(v, f.variants, { sentenceStart: f.sentenceStart });
    case 'order': return gradeText(v, f.variants, { ignoreCase: true });
    case 'pinyin': return gradePy(v, f.variants);
    case 'ec':
      if (!v.trim()) return { status: 'empty' };
      if (normCmp(v) === normCmp(f.initial)) return { status: 'wrong', note: 'предложение не исправлено' };
      return gradeText(v, f.variants, { sentenceStart: true });
    case 'choice': return { status: !v ? 'empty' : v === f.answer ? 'correct' : 'wrong' };
    case 'open': {
      if (!v.trim()) return { status: 'skipped' };
      const g = f.variants.length ? gradeText(v, f.variants, { sentenceStart: true }) : { status: 'wrong' };
      return ['correct', 'case', 'accent'].includes(g.status) ? g : { status: 'review' };
    }
    case 'writing': return { status: v.trim() ? 'review' : 'skipped' };
    default: return { status: 'skipped' };
  }
}

function checkAll() {
  const firstCheck = !S.attemptSaved;
  for (const f of S.fields) {
    if (f.status === 'correct' && f.locked) continue;
    Object.assign(f, { status: null, note: null, typo: false, expected: null, detail: null }, gradeField(f));
    statusEl(f).classList.remove(...STATUS_CLASSES);
    if (f.status !== 'skipped') statusEl(f).classList.add('st-' + f.status);
    f.locked = true;
    lockField(f, true);
  }
  S.items.forEach(renderFeedback);
  S.items.forEach((io) => { if (io.transcript) io.transcript.hidden = false; });
  S.checked = true;
  stopTimer();
  S.elapsed = Math.round((Date.now() - S.startedAt) / 1000);

  const gradable = S.fields.filter(isGradable);
  const correct = gradable.filter((f) => f.status === 'correct').length;
  const total = gradable.length;
  const pct = total ? Math.round((100 * correct) / total) : 100;
  const mistakes = S.fields.filter((f) => MISTAKE.includes(f.status));
  const reviews = S.fields.filter((f) => f.status === 'review');
  const kinds = {};
  for (const f of mistakes) kinds[f.status] = (kinds[f.status] || 0) + 1;
  S.result = { correct, total, pct, mistakes: mistakes.length, kinds, reviews: reviews.length, firstCheck };

  for (const sec of S.test.sections) for (const task of sec.tasks) {
    const fs = S.fields.filter((f) => f.io.task === task && isGradable(f));
    if (!task._scoreEl || !fs.length) continue;
    const c = fs.filter((f) => f.status === 'correct').length;
    task._scoreEl.textContent = `${c}/${fs.length}`;
    task._scoreEl.className = 'task-score pct ' + pctClass(Math.round((100 * c) / fs.length));
  }

  S.lastReport = buildReport();
  if (firstCheck) S.firstReport = S.lastReport;
  let copiedP = Promise.resolve(false);
  if (settings.autoCopy && firstCheck && (mistakes.length || reviews.length)) copiedP = copyText(S.lastReport);

  if (firstCheck) {
    S.attemptSaved = true;
    api('/api/attempt', {
      test_id: S.id, lang: TL.code, title: S.test.meta.title || '', round: S.test.meta.round || 1,
      correct, total, pct, seconds: S.elapsed, reviews: reviews.length,
      mistakes: mistakes.map(mistakeRecord),
    }).catch((e) => toast('Не удалось сохранить попытку: ' + e.message, true));
  }
  copiedP.then((copied) => { S.result.copied = copied; renderBar(); showResultModal(); });
}

const KIND_RU = {
  wrong: 'неверный ответ', case: 'ошибка регистра (заглавная/строчная буква)', accent: 'ошибка диакритики (умлаут/акцент/ударение)',
  tone: 'ошибка в тонах', empty: 'нет ответа',
};

function renderFeedback(io) {
  io.fb.replaceChildren();
  const { it } = io;
  const lines = [];
  let anyBad = false;
  for (const f of io.fields) {
    const pre = f.nBlanks > 1 ? `Пропуск ${f.bi + 1}: ` : '';
    const right = correctText(f);
    if (f.status === 'wrong' || f.status === 'empty') {
      anyBad = true;
      lines.push(h('div', { class: 'l-bad' }, '✗ ', pre, f.status === 'empty' ? 'нет ответа. ' : '', 'Правильно: ', h('b', null, right),
        f.typo ? (isZh() && f.mode !== 'pinyin' ? ' (отличается один иероглиф)' : ' (похоже на опечатку)') : '', f.note ? ` — ${f.note}` : ''));
      if (f.kind === 'radio') $$('input', f.el).forEach((i) => i.nextElementSibling.classList.toggle('right-answer', i.value === f.answer));
    } else if (f.status === 'case') {
      anyBad = true;
      lines.push(h('div', { class: 'l-warn' }, 'Аа ', pre, 'Ошибка регистра (заглавная/строчная буква). Правильно: ', h('b', null, f.expected || right)));
    } else if (f.status === 'accent') {
      anyBad = true;
      lines.push(h('div', { class: 'l-warn' }, 'ä ', pre, 'Ошибка диакритики (умлаут / accent / ударение)', f.note ? `, ${f.note}` : '', '. Правильно: ', h('b', null, f.expected || right)));
    } else if (f.status === 'tone') {
      anyBad = true;
      lines.push(h('div', { class: 'l-warn' }, '〰 Ошибка в тонах: ', h('b', null, f.expected || right), f.detail ? ` (${f.detail})` : ''));
    } else if (f.status === 'review') {
      lines.push(h('div', { class: 'l-rev' }, f.mode === 'writing' ? '📝 Текст уйдёт на проверку ИИ вместе с отчётом.' : '📝 Не совпало с ключом дословно — отправлено на проверку ИИ.'));
      if (it.model_answer) lines.push(h('div', { class: 'expl' }, 'Образец: ', h('i', null, rich(it.model_answer))));
    } else if (f.status === 'correct' && f.note) {
      lines.push(h('div', { class: 'l-ok' }, '✓ ', pre, 'Засчитано, ', f.note));
    } else if (f.status === 'skipped' && f.mode === 'open' && it.model_answer) {
      lines.push(h('div', { class: 'expl' }, 'Образец: ', h('i', null, rich(it.model_answer))));
    }
  }
  if (anyBad && it.explanation) lines.push(h('div', { class: 'expl' }, '💡 ', rich(it.explanation)));
  io.fb.append(...lines);
}

function correctText(f) {
  if (f.mode === 'choice') {
    if (f.labels) return f.labels[f.answer] || f.answer;
    if (f.letterOf) return `${f.letterOf(f.answer)}) ${plain(f.answer)}`;
    return plain(f.answer) || '(ключ отсутствует)';
  }
  const vs = (f.variants || []).map((v) => (f.sentenceStart && !isZh() ? capFirst(normA(v)) : plain(v).trim()));
  return vs.length ? [...new Set(vs)].join(' / ') : '(ключ отсутствует)';
}

function retryMistakes() {
  closeModal();
  for (const f of S.fields) {
    if (MISTAKE.includes(f.status)) {
      f.locked = false;
      f.status = null;
      lockField(f, false);
      statusEl(f).classList.remove(...STATUS_CLASSES);
      if (f.kind === 'radio') $$('input', f.el).forEach((i) => { i.checked = false; i.nextElementSibling.classList.remove('right-answer'); });
      else if (f.kind === 'order') { f.seq = []; f.render(); }
      else if (f.mode === 'ec') f.el.value = f.initial;
      else f.el.value = '';
      if (f.kind === 'text') f.el.dispatchEvent(new Event('input'));
    }
  }
  S.items.forEach((io) => { if (io.fields.some((f) => f.status == null)) io.fb.replaceChildren(); });
  S.checked = false;
  renderBar();
  const first = S.fields.find((f) => !f.locked);
  if (first) { first.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first.kind === 'text' || first.kind === 'area') first.el.focus({ preventScroll: true }); }
  startTimer(Date.now() - S.elapsed * 1000);
}

function resetAll() {
  if (!confirm('Стереть все ответы в этом тесте?')) return;
  closeModal();
  S.saved = {};
  LS.del('ans:' + S.id);
  S.attemptSaved = false;
  S.firstReport = '';
  S.result = null;
  renderTest();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================================================================ reports */
function itemContext(f) {
  const { task, it } = f.io;
  const audio = it.audio ? [`Аудио (озвучивалось): ${it.audio}`] : [];
  switch (task.type) {
    case 'gap_fill': {
      let ctx = plain(it.text);
      if (f.nBlanks > 1) {
        let k = 0;
        ctx = it._parts.map((p, i) => plain(p) + (i < it._parts.length - 1 ? `___(${++k})` : '')).join('');
      }
      return [...audio, it.prompt ? `Исходное: ${plain(it.prompt)}` : null, it.key ? `Ключевое слово: ${it.key}` : null, it.ru ? `Перевод: ${it.ru}` : null,
        `Предложение: ${ctx}${f.nBlanks > 1 ? `  [пропуск ${f.bi + 1}]` : ''}`].filter(Boolean);
    }
    case 'pinyin': return [`Иероглифы: ${it.text}${it.ru ? ` (${it.ru})` : ''} — нужно написать пиньинь`];
    case 'multiple_choice':
      return [...audio, it.question ? `Вопрос: ${plain(it.question)}` : null, `Варианты: ${it.options.map((o, i) => `${LETTERS[i]}) ${plain(o)}`).join('; ')}`].filter(Boolean);
    case 'true_false': return [...audio, `Утверждение: ${plain(it.statement)}`];
    case 'matching': return [`Элемент: ${plain(it.left)}`];
    case 'word_order': return [`Блоки: ${it.words.map(plain).join(' / ')}${it.ru ? ` (смысл: ${it.ru})` : ''}`];
    case 'error_correction': return [`Предложение с ошибкой: ${plain(it.text)}`];
    case 'open': return [...audio, `Задание: ${plain(it.text)}`];
    default: return [];
  }
}

function userText(f) {
  const v = getVal(f).trim();
  if (!v) return '(пусто)';
  if (f.labels) return f.labels[v] || v;
  if (f.letterOf) return `${f.letterOf(v)}) ${plain(v)}`;
  if (f.kind === 'order') return f.seq.map((i) => plain(f.tokens[i])).join(' ');
  return plain(v);
}

function mistakeRecord(f) {
  const { task, sec } = f.io;
  return {
    section: sec ? plain(sec.title) : '', task: `${task.id || ''} ${plain(task.title || '')}`.trim(), task_type: task.type,
    instruction: plain(task.instruction || ''), context: itemContext(f).join(' | '),
    user: userText(f), correct: correctText(f), kind: f.status, typo: !!f.typo, detail: f.detail || '',
  };
}
const taskHeader = (task) => `\n[${task.id ? task.id + '. ' : ''}${plain(task.title || '')}] ${plain(task.instruction || '')}`.trimEnd();

function buildReport() {
  const t = S.test, meta = t.meta, r = S.result || {};
  const mistakes = S.fields.filter((f) => MISTAKE.includes(f.status));
  const reviews = S.fields.filter((f) => f.status === 'review' && f.mode === 'open');
  const essays = S.fields.filter((f) => f.status === 'review' && f.mode === 'writing');
  const kindsTxt = Object.entries(r.kinds || {}).filter(([k]) => k !== 'wrong').map(([k, n]) => `${KIND_RU[k].split(' (')[0]}: ${n}`).join(', ');
  const L = [];
  L.push(`=== РЕЗУЛЬТАТ ТЕСТА · ${TL.name} ===`);
  L.push(`Тест: ${meta.title || ''} | Раунд: ${meta.round || 1} | Уровень: ${meta.level || perLang().level}`);
  if ((meta.grammar_topics || []).length) L.push(`Грамматика теста: ${meta.grammar_topics.map(plain).join('; ')}`);
  L.push(`Результат: ${r.correct}/${r.total} (${r.pct}%) · ошибок: ${mistakes.length}${kindsTxt ? ` (из них ${kindsTxt})` : ''} · открытых ответов на проверку: ${reviews.length}${essays.length ? ' · письменная работа: 1' : ''} · время: ${Math.round((S.elapsed || 0) / 60)} мин`);
  L.push('');
  if (mistakes.length) {
    L.push(`=== МОИ ОШИБКИ (${mistakes.length}) ===`);
    let lastTask = null;
    mistakes.forEach((f, i) => {
      const { task } = f.io;
      if (task !== lastTask) { L.push(taskHeader(task)); lastTask = task; }
      L.push(`${i + 1}) ${itemContext(f).join('\n   ')}`);
      L.push(`   Мой ответ: «${userText(f)}»`);
      L.push(`   Ключ: «${correctText(f)}»`);
      L.push(`   Тип: ${KIND_RU[f.status]}${f.detail ? ` (${f.detail})` : ''}${f.status === 'accent' && f.note ? `, ${f.note}` : ''}${f.typo ? ' (возможно, опечатка)' : ''}`);
    });
    L.push('');
  }
  if (reviews.length) {
    L.push(`=== ОТКРЫТЫЕ ОТВЕТЫ НА ПРОВЕРКУ (${reviews.length}) ===`);
    let lastTask = null;
    reviews.forEach((f, i) => {
      const { task, it } = f.io;
      if (task !== lastTask) { L.push(taskHeader(task)); lastTask = task; }
      L.push(`${i + 1}) ${plain(it.text)}`);
      L.push(`   Мой ответ: «${getVal(f).trim()}»`);
      if (it.model_answer) L.push(`   Образец из теста: «${plain(it.model_answer)}»`);
    });
    L.push('');
  }
  for (const f of essays) {
    const { task } = f.io;
    const v = getVal(f);
    L.push('=== ПИСЬМЕННАЯ РАБОТА НА ПРОВЕРКУ ===');
    L.push(`Задание: ${plain(task.instruction || '')}`);
    if (task.required_words.length) L.push(`Обязательные слова: ${task.required_words.join(', ')}`);
    L.push(`Мой текст (${isZh() ? countHanzi(v) + ' иероглифов' : countWords(v) + ' слов'}):\n${v.trim()}`);
    L.push('');
  }
  if (!mistakes.length && !reviews.length && !essays.length) L.push('Ошибок нет! 🎉\n');
  L.push('=== ИНСТРУКЦИЯ ДЛЯ ИИ ===');
  L.push(reviewPrompt(meta.level || perLang().level, (meta.round || 1) + 1));
  return L.join('\n');
}

function buildBankReport(bank) {
  const L = [`=== НАКОПЛЕННЫЕ ОШИБКИ · ${TL.name} (${bank.length}) ===`];
  L.push('Это мои ошибки из разных тестов за последнее время. Найди в них закономерности и сделай тест на их проработку.');
  bank.forEach((m, i) => {
    L.push(`\n${i + 1}) [${m.task || ''}] ${m.instruction || ''}`);
    L.push(`   ${String(m.context || '').split(' | ').join('\n   ')}`);
    L.push(`   Мой ответ: «${m.user}» · Ключ: «${m.correct}» · Тип: ${KIND_RU[m.kind] || m.kind}${m.detail ? ` (${m.detail})` : ''}`);
  });
  L.push('\n=== ИНСТРУКЦИЯ ДЛЯ ИИ ===');
  L.push(reviewPrompt(perLang().level, 1));
  return L.join('\n');
}

/* ================================================================ modals */
function closeModal() { $('#modal-root').replaceChildren(); }
function modal(...content) {
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) closeModal(); } }, h('div', { class: 'modal' }, content));
  $('#modal-root').replaceChildren(back);
}

function showResultModal() {
  const r = S.result;
  if (!r) return;
  const pre = h('pre', { class: 'report', hidden: true }, S.firstReport || S.lastReport);
  const needsAI = r.mistakes + r.reviews > 0;
  let notice;
  if (!needsAI) notice = h('div', { class: 'notice' }, '🎉 Ни одной ошибки! Можно брать новый текст или попросить ИИ усложнить тест.');
  else if (r.copied) notice = h('div', { class: 'notice' }, '✓ Отчёт с ошибками и инструкцией для ИИ уже в буфере обмена. Откройте чат с ИИ и нажмите Ctrl+V.');
  else notice = h('div', { class: 'notice info' }, 'Нажмите «Скопировать отчёт» и отправьте его ИИ.');
  const kindsTxt = Object.entries(r.kinds || {}).filter(([k]) => k !== 'wrong' && k !== 'empty').map(([k, n]) => `${{ case: 'регистр', accent: 'диакритика', tone: 'тоны' }[k]}: ${n}`).join(', ');

  modal(
    h('h2', null, r.firstCheck ? 'Результат' : 'Результат после исправления'),
    h('div', { class: 'result-grid' },
      h('div', { class: 'big-score pct ' + pctClass(r.pct) }, r.pct + '%'),
      h('div', { class: 'counts' },
        h('span', null, `Верно: ${r.correct} из ${r.total}`),
        h('span', null, `Ошибок: ${r.mistakes}` + (kindsTxt ? ` (${kindsTxt})` : '')),
        r.reviews ? h('span', null, `Открытых ответов на проверку ИИ: ${r.reviews}`) : null,
        h('span', { class: 'muted' }, `Время: ${Math.floor(S.elapsed / 60)} мин ${S.elapsed % 60} с`))),
    notice,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: async () => { const ok = await copyText(S.firstReport || S.lastReport); toast(ok ? 'Скопировано' : 'Не удалось скопировать', !ok); } },
        r.firstCheck ? '📋 Скопировать отчёт' : '📋 Скопировать отчёт первой проверки'),
      h('button', { class: 'btn', onclick: () => { pre.hidden = !pre.hidden; } }, 'Показать отчёт'),
      r.mistakes ? h('button', { class: 'btn', onclick: retryMistakes }, '↻ Перерешать ошибки') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: closeModal }, 'Смотреть ответы')),
    pre,
    h('p', { class: 'small muted', style: 'margin-bottom:0' }, 'Когда ИИ пришлёт разбор и JSON — вставьте его в блок «Следующий раунд» внизу страницы.'),
  );
}

function openSettings() {
  const cb = (key, label, hint) => h('label', { style: 'display:flex;gap:10px;align-items:flex-start;margin:10px 0;cursor:pointer' },
    h('input', { type: 'checkbox', checked: settings[key], onchange: (e) => { settings[key] = e.target.checked; saveSettings(); } }),
    h('span', null, h('b', null, label), h('br'), h('span', { class: 'small muted' }, hint)));
  const rateSel = h('select', { class: 'sel', style: 'width:auto' },
    [[0.6, 'медленно'], [0.75, 'спокойно'], [0.9, 'обычно'], [1, 'естественно']].map(([v, l]) => h('option', { value: v, selected: settings.ttsRate === v }, l)));
  const SAMPLE = { en: 'Hello! Let\'s start.', de: 'Hallo! Fangen wir an.', fr: 'Bonjour ! On commence.', it: 'Ciao! Cominciamo.', zh: '你好，我们开始学习吧。' };
  rateSel.addEventListener('change', () => { settings.ttsRate = +rateSel.value; saveSettings(); speak(SAMPLE[TL.code]); });
  const zh = isZh();
  const pySel = h('select', { class: 'sel', style: 'width:auto' }, Object.entries(PY_MODES).map(([k, l]) => h('option', { value: k, selected: settings.pinyinMode === k }, l)));
  pySel.addEventListener('change', () => { settings.pinyinMode = pySel.value; saveSettings(); applyPinyinMode(); });
  modal(
    h('h2', null, `Настройки · ${TL.name}`),
    zh ? h('div', { class: 'row', style: 'margin:10px 0' }, h('b', null, 'Пиньинь над иероглифами:'), pySel, h('span', { class: 'small muted' }, 'Alt+P — переключить')) : null,
    h('div', { class: 'row', style: 'margin:10px 0' }, h('b', null, 'Скорость озвучки:'), rateSel),
    zh
      ? cb('strictTones', 'Строгая проверка тонов', 'Пиньинь с верными буквами, но неверными тонами считается ошибкой. Тоны можно вводить цифрами: lv3xing2 = lǚxíng.')
      : [cb('strictCase', 'Строгая проверка заглавных букв', 'Ответ с неверным регистром (monday вместо Monday, haus вместо Haus) считается ошибкой. Если пропуск в начале предложения — заглавная обязательна.'),
        TL.code !== 'en' ? cb('strictAccents', 'Строгая проверка диакритики', 'Ответ без умлаутов / accents / ударений (Muller, ecole, perche) считается отдельной ошибкой. Немецкие ae/oe/ue/ss вместо ä/ö/ü/ß распознаются.') : null],
    cb('autoCopy', 'Автоматически копировать ошибки при проверке', 'После нажатия «Проверить» отчёт сразу попадает в буфер обмена.'),
    cb('includeSchema', 'Добавлять схему JSON в отчёт', 'Надёжнее (ИИ точно выдаст правильный формат, даже в новом чате), но отчёт длиннее.'),
    h('p', { class: 'small muted' }, 'Настройки проверки общие для всех языков.'),
    h('div', { class: 'row', style: 'margin-top:16px' }, h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: closeModal }, 'Готово')),
  );
}
