'use strict';

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

/** Текст с **жирным** → массив узлов (без innerHTML, безопасно). */
function rich(text, decorate = (s) => [s]) {
  const out = [];
  String(text ?? '').split(/\*\*(.+?)\*\*/g).forEach((part, i) => {
    if (!part) return;
    if (i % 2) out.push(h('strong', null, decorate(part)));
    else out.push(...decorate(part));
  });
  return out;
}

const LS = {
  get(k, d) { try { const v = localStorage.getItem('ewb:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ewb:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem('ewb:' + k); } catch { /* ignore */ } },
};

const settings = Object.assign(
  { strictCase: true, includeSchema: true, autoCopy: true, theme: 'auto', level: 'B2', focus: '' },
  LS.get('settings', {})
);
const saveSettings = () => LS.set('settings', settings);

/* Данные хранятся в браузере (store.js) — сервер не нужен. */
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

function fill(tpl, vars) {
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

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

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const pctClass = (p) => (p == null ? '' : p >= 85 ? 'good' : p >= 60 ? 'mid' : 'low');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const countWords = (s) => (String(s).match(/[A-Za-z0-9'’-]+/g) || []).length;

/* ================================================================ speech */
function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const v = voices.find((x) => /^en[-_]GB/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  u.lang = v ? v.lang : 'en-GB';
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();

/* ================================================================ answer checking */
const CONTRACTIONS = [
  [/\bwon't\b/gi, 'will not'], [/\bcan't\b/gi, 'cannot'], [/\bshan't\b/gi, 'shall not'], [/\bain't\b/gi, 'is not'],
  [/\bcan not\b/gi, 'cannot'], [/n't\b/gi, ' not'], [/'m\b/gi, ' am'], [/'re\b/gi, ' are'], [/'ve\b/gi, ' have'], [/'ll\b/gi, ' will'],
];
function keepCase(src, repl) {
  return /^[A-Z]/.test(src) ? repl[0].toUpperCase() + repl.slice(1) : repl;
}
function expand(s) {
  for (const [re, r] of CONTRACTIONS) s = s.replace(re, (m) => (/^[A-Za-z]/.test(m) ? keepCase(m, r) : r));
  return s.replace(/\s+/g, ' ').trim();
}
function norm(s) {
  return String(s ?? '')
    .replace(/[‘’ʼ`´]/g, "'").replace(/[“”«»„]/g, '"').replace(/[–—]/g, '-').replace(/ /g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/\s*[.!?;,]+$/, '').trim();
}
const stripPunct = (s) => s.replace(/[,;:!?."()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function lev(a, b) {
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

/** Возвращает {status: correct|case|wrong|empty, note?, typo?} */
function grade(user, variants, { sentenceStart = false } = {}) {
  const u = norm(user);
  if (!u) return { status: 'empty' };
  let best = { status: 'wrong' };
  for (let v of variants) {
    v = norm(v);
    if (!v) continue;
    if (sentenceStart) v = capFirst(v);
    const cands = [[u, v], [expand(u), expand(v)]];
    for (const [a, b] of cands) {
      if (a === b) return { status: 'correct' };
      if (stripPunct(a) === stripPunct(b)) return { status: 'correct', note: 'пунктуация отличается от ключа' };
      if (a.toLowerCase() === b.toLowerCase() || stripPunct(a).toLowerCase() === stripPunct(b).toLowerCase()) {
        best = { status: 'case', expected: v };
      }
    }
    if (best.status !== 'case') {
      const a = expand(u).toLowerCase(), b = expand(v).toLowerCase();
      const d = lev(a, b);
      if ((d === 1 && b.length >= 4) || (d === 2 && b.length >= 7)) best = { status: 'wrong', typo: true };
    }
  }
  if (best.status === 'case' && !settings.strictCase) return { status: 'correct', note: 'регистр букв отличается (строгая проверка выключена)' };
  return best;
}

function isSentenceStart(before) {
  const b = String(before).replace(/\s+$/, '');
  return b === '' || /^\s*\d+[.)]?\s*$/.test(b) || /[.!?]["'”»)]?$/.test(b) || /(^|[\s,.!?:])["“«]$/.test(b);
}

/* ================================================================ JSON parsing & normalization */
function parseLenient(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Поле пустое — вставьте JSON от ИИ.');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].includes('{')) s = fence[1];
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Не найден JSON-объект { ... }. Скопируйте ответ ИИ целиком.');
  s = s.slice(a, b + 1);
  const attempts = [
    s,
    s.replace(/,\s*([}\]])/g, '$1'),
    s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"'),
    s.replace(/,\s*([}\]])/g, '$1').replace(/^\s*\/\/.*$/gm, ''),
  ];
  let firstErr;
  for (const t of attempts) {
    try { return JSON.parse(t); } catch (e) { firstErr = firstErr || e; }
  }
  const m = String(firstErr.message).match(/position (\d+)/);
  let where = '';
  if (m) {
    const pos = +m[1];
    const line = s.slice(0, pos).split('\n').length;
    where = `\nСтрока ${line}: …${s.slice(Math.max(0, pos - 60), pos)}⟦здесь⟧${s.slice(pos, pos + 40)}…`;
  }
  throw new Error('JSON повреждён: ' + firstErr.message + where + '\nПопросите ИИ: «Исправь JSON, он невалидный».');
}

const TYPE_ALIAS = {
  gapfill: 'gap_fill', gap: 'gap_fill', fill: 'gap_fill', fill_in: 'gap_fill', fill_in_the_blanks: 'gap_fill', cloze: 'gap_fill',
  word_formation: 'gap_fill', key_word_transformation: 'gap_fill', transformation: 'gap_fill', sentence_completion: 'gap_fill', completion: 'gap_fill',
  mcq: 'multiple_choice', choice: 'multiple_choice', odd_one_out: 'multiple_choice', multiplechoice: 'multiple_choice',
  tfng: 'true_false', true_false_not_given: 'true_false', truefalse: 'true_false',
  match: 'matching', match_headings: 'matching',
  correction: 'error_correction', find_the_mistake: 'error_correction',
  translation: 'open', translate: 'open', short_answer: 'open', open_question: 'open', questions: 'open', numbers: 'open',
  essay: 'writing', speaking: 'discussion',
};
const KNOWN_TYPES = ['gap_fill', 'multiple_choice', 'true_false', 'matching', 'error_correction', 'open', 'writing', 'discussion'];
const BLANK_RE = /_{3,}/;
const toArr = (x) => (x == null ? [] : Array.isArray(x) ? x.flat(Infinity).map(String) : [String(x)]);

function blankVariants(item, n, warn) {
  let a = item.answers ?? item.answer ?? item.key_answer;
  if (a == null) { warn('нет ответа'); return Array.from({ length: n }, () => []); }
  if (!Array.isArray(a)) a = [a];
  if (n === 1) {
    if (a.length === 1) return [toArr(a[0])];
    return [toArr(a)];
  }
  if (a.length === n) return a.map(toArr);
  warn(`пропусков ${n}, а ответов ${a.length}`);
  return Array.from({ length: n }, (_, i) => toArr(a[i]));
}

const TF_MAP = { t: 'T', true: 'T', f: 'F', false: 'F', ng: 'NG', 'not given': 'NG', notgiven: 'NG', not_given: 'NG', yes: 'T', no: 'F' };
const TF_LABEL = { T: 'True', F: 'False', NG: 'Not Given' };
const normTF = (x) => TF_MAP[String(x ?? '').trim().toLowerCase()] || String(x ?? '').trim().toUpperCase();

function normalizeTest(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') throw new Error('JSON должен быть объектом.');
  const t = JSON.parse(JSON.stringify(raw));
  t.meta = t.meta || {};
  if (!Array.isArray(t.sections)) {
    if (Array.isArray(t.tasks)) t.sections = [{ title: 'Tasks', tasks: t.tasks }];
    else throw new Error('В JSON нет "sections" — это не тест формата englishtest/v1.');
  }
  if (typeof t.text === 'string') t.text = { paragraphs: t.text.split(/\n\s*\n/) };
  else if (Array.isArray(t.text)) t.text = { paragraphs: t.text };
  if (t.text && !Array.isArray(t.text.paragraphs)) t.text = null;
  t.vocabulary = (Array.isArray(t.vocabulary) ? t.vocabulary : []).map((v) => ({
    en: v.en ?? v.word ?? v.phrase ?? '', ru: v.ru ?? v.translation ?? '', in_text: v.in_text ?? '', example: v.example ?? '',
  })).filter((v) => v.en);
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
    if (type === 'gap_fill') {
      it.text = String(it.text ?? it.sentence ?? it.question ?? '');
      let parts = it.text.split(BLANK_RE);
      if (parts.length === 1) parts = [it.text + ' ', ''];
      it._parts = parts;
      it._variants = blankVariants(it, parts.length - 1, w);
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
    } else if (type === 'error_correction') {
      it.text = String(it.text ?? it.sentence ?? '');
      it._variants = toArr(it.answers ?? it.answer ?? it.correct);
      if (!it._variants.length) w('нет правильного варианта');
    } else if (type === 'open') {
      it.text = String(it.text ?? it.question ?? it.prompt ?? '');
      it._variants = toArr(it.answers ?? it.answer).concat(it.model_answer ? [String(it.model_answer)] : []);
    } else if (type === 'discussion') {
      it.text = String(it.text ?? it.question ?? '');
    }
    return it;
  });

  if (type === 'true_false') {
    task._options = toArr(task.options).map(normTF);
    if (!task._options.length) task._options = ['T', 'F', 'NG'];
  }
  if (type === 'matching') {
    const all = [...task.items.map((i) => i.answer), ...toArr(task.extra)].filter(Boolean);
    task._options = seededShuffle([...new Set(all)], key + (task.id || '') + all.length);
  }
  if (type === 'writing') {
    task.required_words = toArr(task.required_words);
    task.items = [{}];
  }
  return task;
}

function resolveMC(it, w) {
  const opts = it.options;
  let a = it.answer ?? it.correct;
  if (typeof a === 'number') return opts[a] ?? opts[a - 1] ?? (w('индекс ответа вне вариантов'), '');
  a = String(a ?? '').trim();
  const exact = opts.find((o) => o === a) || opts.find((o) => norm(o).toLowerCase() === norm(a).toLowerCase());
  if (exact) return exact;
  const letter = a.match(/^([a-hA-H])(?:[).:]|\s|$)/);
  if (letter) {
    const idx = LETTERS.indexOf(letter[1].toLowerCase());
    const rest = norm(a.slice(letter[0].length)).toLowerCase();
    const byRest = rest && opts.find((o) => norm(o).toLowerCase() === rest);
    if (byRest) return byRest;
    if (opts[idx]) return opts[idx];
  }
  const stripped = opts.find((o) => norm(o.replace(/^[a-h][).]\s*/i, '')).toLowerCase() === norm(a).toLowerCase());
  if (stripped) return stripped;
  w(`ответ "${a}" не найден среди вариантов`);
  return '';
}

/* ================================================================ state */
const S = {
  init: null, rec: null, id: null, test: null, warnings: [],
  fields: [], items: [], saved: {}, checked: false, attemptSaved: false,
  startedAt: 0, elapsed: 0, timerId: null, lastReport: '', result: null,
};

/* ================================================================ router */
window.addEventListener('hashchange', route);
$('#btn-theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  settings.theme = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = settings.theme;
  saveSettings();
});
$('#btn-settings').addEventListener('click', openSettings);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && S.test && location.hash.startsWith('#test=')) {
    e.preventDefault();
    if (!S.checked) checkAll();
  }
});
route();

async function route() {
  closeModal();
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

/* ================================================================ HOME */
const GRAMMAR_BANK = {
  B1: ['Present Perfect vs Past Simple', 'Past Continuous', 'used to / would', 'Future forms', 'First & second conditionals', 'Modals of obligation', 'Gerund vs infinitive', 'Defining relative clauses', 'Passive (present/past)', 'Reported statements', 'Comparatives', 'Articles', 'Quantifiers', 'Phrasal verbs'],
  B2: ['Present Perfect Continuous', 'Narrative tenses / Past Perfect', 'Third & mixed conditionals', 'wish / if only', 'Passive + have something done', 'Reporting verbs', 'Modals of deduction (past)', 'Non-defining relative clauses', 'Gerund vs infinitive (meaning change)', 'Future continuous & perfect', 'Linking words: contrast & purpose', 'be used to / get used to', 'so / such, too / enough', 'Dependent prepositions'],
  C1: ['Inversion', 'Cleft sentences', 'Participle clauses', 'Advanced passive (It is said that…)', 'Subjunctive', 'Unreal past (It\'s time, would rather)', 'Implied conditionals (But for, Had I…)', 'Modal perfects (needn\'t have)', 'Ellipsis & substitution', 'Emphatic do/did', 'Future in the past', 'Nominalisation', 'Hedging & discourse markers', 'Advanced collocations'],
};

async function renderHome() {
  stopTimer();
  S.test = null;
  $('#bar-slot').replaceChildren();
  $('#topbar-center').replaceChildren();
  document.title = 'English Workbook';
  S.init = await api('/api/init');
  const { tests, stats, bank_count: bankCount, done_topics: doneTopics } = S.init;

  /* --- 1. prompt builder */
  const levelSel = h('select', { class: 'sel' }, ['B1', 'B1+', 'B2', 'B2+', 'C1', 'C1+'].map((l) => h('option', { value: l, selected: l === settings.level }, l)));
  const focusInp = h('input', { class: 'txt', placeholder: 'auto — ИИ сам выберет 2–3 темы из текста', value: settings.focus });
  const chipsBox = h('div', { class: 'chips' });
  const article = h('textarea', { class: 'big prose', placeholder: 'Вставьте сюда текст статьи / главы книги (на английском или русском)…', value: LS.get('draftArticle', '') });
  const wc = h('span', { class: 'muted small' });
  const updWc = () => { wc.textContent = `${countWords(article.value)} слов`; LS.set('draftArticle', article.value); };
  article.addEventListener('input', updWc); updWc();

  const renderChips = () => {
    const bankKey = settings.level.startsWith('C') ? 'C1' : settings.level.startsWith('B2') ? 'B2' : 'B1';
    const cur = focusInp.value.split(/\s*;\s*/).filter(Boolean);
    chipsBox.replaceChildren(...GRAMMAR_BANK[bankKey].map((g) => h('button', {
      class: 'chip btnlike' + (cur.includes(g) ? ' on' : ''), title: doneTopics.includes(g) ? 'уже было' : '',
      onclick: () => {
        const list = focusInp.value.split(/\s*;\s*/).filter(Boolean);
        const i = list.indexOf(g);
        if (i >= 0) list.splice(i, 1); else list.push(g);
        focusInp.value = list.join('; ');
        settings.focus = focusInp.value; saveSettings(); renderChips();
      },
    }, g)));
  };
  levelSel.addEventListener('change', () => { settings.level = levelSel.value; saveSettings(); renderChips(); });
  focusInp.addEventListener('input', () => { settings.focus = focusInp.value; saveSettings(); renderChips(); });
  renderChips();

  const copyGen = async () => {
    const text = article.value.trim();
    const prompt = fill(S.init.prompts.generate, {
      LEVEL: settings.level,
      GRAMMAR_FOCUS: focusInp.value.trim() || 'auto',
      DONE_TOPICS: doneTopics.length ? doneTopics.join('; ') : 'пока нет',
      SCHEMA: S.init.prompts.schema,
      TEXT: text || '[ВСТАВЬТЕ ТЕКСТ СЮДА]',
    });
    const ok = await copyText(prompt);
    toast(ok ? (text ? 'Промт + текст скопированы. Вставьте в чат с ИИ (Ctrl+V).' : 'Промт скопирован (без текста — допишите его в чате).') : 'Не удалось скопировать', !ok);
  };

  /* --- 2. paste json */
  const jsonArea = h('textarea', { class: 'big', placeholder: 'Вставьте ответ ИИ (можно целиком, с ```json … ```) — лишнее будет отброшено автоматически.' });
  const errBox = h('div');
  const fileInp = h('input', { type: 'file', accept: '.json,.txt,.md', style: 'display:none' });
  fileInp.addEventListener('change', async () => {
    const f = fileInp.files[0];
    if (f) { jsonArea.value = await f.text(); openFromJson(jsonArea.value, null, errBox); }
  });

  /* --- 3. library */
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
  )))) : [h('p', { class: 'muted' }, 'Пока пусто. Создайте первый тест ↑')];

  /* --- 4. mistakes bank */
  const copyBank = async () => {
    const bank = await api('/api/bank');
    if (!bank.length) return toast('Банк ошибок пуст');
    const report = buildBankReport(bank.slice(-60));
    const ok = await copyText(report);
    toast(ok ? `Скопировано: ${Math.min(60, bank.length)} последних ошибок + промт. Вставьте в чат с ИИ.` : 'Не удалось скопировать', !ok);
  };

  $('#view').replaceChildren(
    h('div', { class: 'steps' },
      h('div', { class: 'step' }, h('b', null, 'Шаг 1'), 'Вставьте текст статьи и скопируйте промт → отправьте ИИ'),
      h('div', { class: 'step' }, h('b', null, 'Шаг 2'), 'Вставьте JSON-ответ ИИ → решайте тест'),
      h('div', { class: 'step' }, h('b', null, 'Шаг 3'), '«Проверить» → ваши ошибки уже в буфере, отправьте ИИ'),
      h('div', { class: 'step' }, h('b', null, 'Шаг 4'), 'ИИ присылает разбор + JSON повторения → вставьте его, повторяйте до 100%'),
    ),
    h('div', { class: 'grid-2' },
      h('div', { class: 'card' },
        h('h2', null, '1. Новый тест из статьи'),
        h('p', { class: 'sub' }, 'Промт, уровень, грамматика и текст собираются в одно сообщение для ИИ.'),
        h('div', { class: 'row' },
          h('label', { class: 'field', style: 'width:110px' }, 'Уровень', levelSel),
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
          h('p', { class: 'sub' }, 'Ответ можно вставлять целиком — программа сама найдёт JSON и починит мелкие огрехи.'),
          jsonArea, errBox,
          h('div', { class: 'row', style: 'margin-top:10px' },
            h('button', { class: 'btn primary', onclick: () => openFromJson(jsonArea.value, null, errBox) }, '▶ Открыть тест'),
            h('button', { class: 'btn', onclick: () => fileInp.click() }, 'Из файла…'), fileInp,
            h('button', { class: 'btn', onclick: async () => {
              try { jsonArea.value = await navigator.clipboard.readText(); openFromJson(jsonArea.value, null, errBox); }
              catch { toast('Браузер не дал прочитать буфер — вставьте вручную (Ctrl+V)', true); }
            } }, 'Вставить из буфера'),
          ),
        ),
        dataCard(),
        h('div', { class: 'card' },
          h('h2', null, 'Банк ошибок'),
          h('p', { class: 'sub' }, 'Все ошибки из всех тестов копятся здесь. Можно попросить ИИ сделать тест по всем сразу.'),
          h('div', { class: 'row' },
            h('span', { class: 'stat' }, h('b', null, bankCount), h('span', null, 'ошибок в банке')),
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn', onclick: copyBank, disabled: !bankCount }, '📋 Промт: тест по банку ошибок'),
            h('button', { class: 'btn sm danger', disabled: !bankCount, onclick: async () => {
              if (!confirm('Очистить банк ошибок?')) return;
              await api('/api/bank/clear', {}); renderHome();
            } }, 'Очистить')),
        ),
      ),
    ),
    h('div', { class: 'card', style: 'margin-top:18px' },
      h('div', { class: 'row', style: 'margin-bottom:12px' },
        h('h2', { style: 'margin:0' }, 'Мои тесты'), h('span', { class: 'spacer' }),
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('b', null, stats.attempts), h('span', null, 'попыток')),
          h('div', { class: 'stat' }, h('b', { class: 'pct ' + pctClass(stats.avg_pct) }, stats.avg_pct == null ? '—' : stats.avg_pct + '%'), h('span', null, 'средний результат')),
          h('div', { class: 'stat' }, h('b', null, stats.minutes), h('span', null, 'минут практики')))),
      lib,
    ),
  );
}

async function openFromJson(raw, parentId, errBox) {
  errBox.replaceChildren();
  try {
    const parsed = parseLenient(raw);
    const { warnings } = normalizeTest(parsed);
    const { id } = await api('/api/test', { test: parsed, parent_id: parentId });
    if (warnings.length) toast(`Тест открыт, но есть ${warnings.length} замечаний к JSON (см. вверху страницы)`);
    location.hash = '#test=' + id;
  } catch (e) {
    errBox.replaceChildren(h('div', { class: 'error-box' }, e.message));
  }
}

/* ================================================================ TEST */
async function openTest(id) {
  stopTimer();
  if (!S.init) S.init = await api('/api/init');
  const rec = await api('/api/test?id=' + encodeURIComponent(id));
  const { test, warnings } = normalizeTest(rec.test);
  Object.assign(S, {
    rec, id, test, warnings, fields: [], items: [], saved: LS.get('ans:' + id, {}),
    checked: false, attemptSaved: false, lastReport: '', firstReport: '', result: null,
  });
  renderTest();
}

function renderTest() {
  const t = S.test, meta = t.meta;
  document.title = (meta.title || 'Тест') + ' — English Workbook';
  S.fields = []; S.items = []; S.checked = false;

  /* top bar */
  const timerEl = h('span', { class: 'timer', id: 'timer' }, '00:00');
  $('#topbar-center').replaceChildren(h('a', { class: 'btn sm', href: '#' }, '← Все тесты'), timerEl);

  /* side panel */
  const tabs = [];
  if (t.review && (t.review.summary || (t.review.items || []).length)) tabs.push(['Разбор ошибок', renderReview(t.review)]);
  if (t.text && t.text.paragraphs.length) tabs.push(['Текст', renderArticle(t)]);
  if (t.vocabulary.length) tabs.push([`Словарь (${t.vocabulary.length})`, renderVocab(t.vocabulary)]);
  if (t.grammar_notes.length) tabs.push(['Грамматика', renderGrammar(t.grammar_notes)]);

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

  /* tasks */
  const main = h('div', { class: 'tasks' });
  t.sections.forEach((sec) => {
    if (!sec.tasks.length) return;
    main.append(h('h2', { class: 'section-title' }, sec.title || ''));
    sec.tasks.forEach((task) => main.append(renderTask(task, sec)));
  });

  /* next round box */
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
      h('h1', null, meta.title || (t.text && t.text.title) || 'Тест'),
      h('div', { class: 'chips', style: 'margin-top:8px' },
        meta.level ? h('span', { class: 'chip' }, meta.level) : null,
        h('span', { class: 'chip' }, `Раунд ${meta.round || 1}`),
        meta.topic ? h('span', { class: 'chip' }, meta.topic) : null,
        (meta.grammar_topics || []).map((g) => h('span', { class: 'chip', style: 'background:var(--info-soft);color:var(--info)' }, g)))),
  );

  const warn = S.warnings.length ? h('details', { class: 'warn-box' },
    h('summary', null, `⚠ Замечания к JSON (${S.warnings.length}) — некоторые ответы могут проверяться неточно`),
    h('ul', null, S.warnings.map((w) => h('li', null, w)))) : null;

  $('#view').replaceChildren(...[head, warn].filter(Boolean), h('div', { class: 'test-layout' + (side ? ' with-side' : '') }, side, main));

  /* restore answers */
  for (const f of S.fields) {
    if (S.saved[f.key] != null) setVal(f, S.saved[f.key]);
    f.onRestore && f.onRestore();
  }
  for (const sec of t.sections) for (const task of sec.tasks) if (task._boxEl) markBoxUsage(task);
  renderBar();
  startTimer();
}

/* ---------- side renderers */
function renderArticle(t) {
  const vocab = t.vocabulary;
  const map = new Map();
  for (const v of vocab) {
    for (const term of [v.in_text, v.en.replace(/^to\s+/i, '').replace(/\s*\(.*?\)\s*/g, ' ').trim()]) {
      if (term && term.length >= 3 && !map.has(term.toLowerCase())) map.set(term.toLowerCase(), v);
    }
  }
  const terms = [...map.keys()].sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = terms.length ? new RegExp(`(?<![A-Za-z])(${terms.join('|')})(?![A-Za-z])`, 'gi') : null;
  const deco = (str) => {
    if (!re) return [str];
    const out = []; let last = 0;
    str.replace(re, (m, g, off) => {
      out.push(str.slice(last, off));
      const v = map.get(m.toLowerCase());
      out.push(h('span', { class: 'vocab', tabindex: 0, 'data-tip': v ? v.ru : '', onclick: () => speak(m) }, m));
      last = off + m.length;
      return m;
    });
    out.push(str.slice(last));
    return out;
  };
  const wrap = h('div', { class: 'article' },
    t.text.title ? h('h2', null, t.text.title) : null,
    h('p', { class: 'muted small', style: 'margin-top:-8px' }, 'Наведите на подсвеченное слово — перевод; клик — произношение; клик по номеру абзаца — прочитать вслух; двойной клик по слову — озвучить.'),
    t.text.paragraphs.map((p, i) => h('div', { class: 'para' },
      h('div', { class: 'para-n', title: 'Прочитать вслух', onclick: () => speak(String(p).replace(/\*\*/g, '')) }, i + 1),
      h('p', null, rich(p, deco)))));
  wrap.addEventListener('dblclick', () => { const s = String(getSelection() || '').trim(); if (s) speak(s); });
  return wrap;
}

function renderVocab(vocab) {
  const table = h('table', { class: 'vt' },
    h('thead', null, h('tr', null, h('th', null, 'English'), h('th', null, 'Перевод'))),
    h('tbody', null, vocab.map((v) => h('tr', null,
      h('td', { class: 'en' }, h('button', { class: 'say', title: 'Произнести', onclick: () => speak(v.en) }, '🔊'), v.en,
        v.example ? h('div', { class: 'ex' }, v.example) : null),
      h('td', { class: 'ru' }, h('span', { onclick: (e) => e.currentTarget.classList.toggle('shown') }, v.ru))))));
  const toggle = h('label', { class: 'small muted', style: 'display:flex;gap:6px;align-items:center;margin-bottom:10px;cursor:pointer' },
    h('input', { type: 'checkbox', onchange: (e) => table.classList.toggle('hide-ru', e.target.checked) }),
    'Режим самопроверки: скрыть перевод (клик — показать)');
  return h('div', null, toggle, table);
}

function renderGrammar(notes) {
  return h('div', null, notes.map((n) => h('div', { class: 'gnote' },
    h('h3', null, n.title || ''),
    n.explanation ? h('p', null, rich(n.explanation)) : null,
    (n.examples || []).length ? h('ul', null, n.examples.map((e) => h('li', null, rich(e)))) : null)));
}

function renderReview(r) {
  return h('div', null,
    r.summary ? h('div', { class: 'notice info' }, r.summary) : null,
    (r.items || []).map((it) => h('div', { class: 'review-item' },
      it.rule ? h('div', { class: 'rule' }, it.rule) : null,
      h('div', null, it.mistake ? h('span', { class: 'mis' }, it.mistake) : null, it.mistake ? ' → ' : '', h('span', { class: 'cor' }, it.correct || '')),
      it.explanation ? h('div', { class: 'small muted' }, rich(it.explanation)) : null)));
}

/* ---------- task renderers */
function renderTask(task, sec) {
  const scoreEl = h('span', { class: 'task-score' });
  const wrap = h('div', { class: 'card task' },
    h('div', { class: 'task-head' },
      task.id ? h('span', { class: 'task-id' }, task.id) : null,
      h('span', { class: 'task-title' }, task.title || ''), scoreEl),
    task.instruction ? h('p', { class: 'instr' }, rich(task.instruction)) : null);
  task._scoreEl = scoreEl;
  const ctx = { task, sec };

  if (task.type === 'matching') return wrap.append(renderMatching(ctx)), wrap;
  if (task.type === 'writing') return wrap.append(renderWriting(ctx)), wrap;

  let box = null;
  if (Array.isArray(task.box) && task.box.length) {
    box = h('div', { class: 'box chips' }, task.box.map((w) => h('button', {
      class: 'chip btnlike', title: 'Вставить в активное поле',
      onclick: () => {
        const inp = task._lastInput;
        if (inp && !inp.readOnly) { inp.value = w; inp.dispatchEvent(new Event('input')); inp.focus(); }
      },
    }, w)));
    wrap.append(box);
    task._boxEl = box;
  }

  task.items.forEach((it, ii) => {
    const itemObj = { task, sec, it, ii, fields: [], fb: h('div', { class: 'fb' }) };
    const body = h('div', { class: 'item-body' });
    const itemEl = h('div', { class: 'item' }, h('div', { class: 'item-n' }, ii + 1), body);
    itemObj.el = itemEl;
    S.items.push(itemObj);

    if (task.type === 'gap_fill') {
      if (it.prompt) body.append(h('div', { class: 'orig' }, rich(it.prompt)));
      if (it.key) body.append(h('div', { class: 'key' }, it.key));
      const sentence = h('div', { class: 'sentence' });
      let before = '';
      it._parts.forEach((part, bi) => {
        sentence.append(...rich(part));
        before += part;
        if (bi < it._parts.length - 1) {
          const inp = h('input', { class: 'gap', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
          const grow = () => { inp.style.width = Math.max(9, inp.value.length + 2) + 'ch'; };
          inp.addEventListener('input', grow);
          inp.addEventListener('focus', () => { task._lastInput = inp; });
          addField({ kind: 'text', el: inp, itemObj, bi, nBlanks: it._parts.length - 1, variants: it._variants[bi] || [], sentenceStart: isSentenceStart(before), onRestore: grow });
          sentence.append(inp);
          before = '';
        }
      });
      body.append(sentence);
    } else if (task.type === 'multiple_choice') {
      body.append(h('div', { class: 'sentence', style: 'line-height:1.6' }, rich(it.question)));
      const long = it.options.some((o) => o.length > 40);
      const name = 'r' + task._key + '_' + ii;
      const group = h('div', { class: 'opts' + (long ? ' vertical' : '') }, it.options.map((o, oi) => h('label', { class: 'opt' },
        h('input', { type: 'radio', name, value: o }),
        h('span', null, h('span', { class: 'letter' }, LETTERS[oi] + ')'), o))));
      body.append(group);
      addField({ kind: 'radio', el: group, itemObj, answer: it._answer });
    } else if (task.type === 'true_false') {
      body.append(h('div', { class: 'sentence', style: 'line-height:1.6' }, rich(it.statement)));
      const name = 'r' + task._key + '_' + ii;
      const group = h('div', { class: 'opts' }, task._options.map((o) => h('label', { class: 'opt' },
        h('input', { type: 'radio', name, value: o }), h('span', null, TF_LABEL[o] || o))));
      body.append(group);
      addField({ kind: 'radio', el: group, itemObj, answer: it._answer, labels: TF_LABEL });
    } else if (task.type === 'error_correction') {
      body.append(h('div', { class: 'orig' }, rich(it.text)));
      const ta = h('textarea', { class: 'ans', rows: 1, spellcheck: 'false', placeholder: 'Перепишите предложение правильно…' });
      ta.value = it.text.replace(/\*\*/g, '');
      body.append(ta);
      addField({ kind: 'area', mode: 'ec', el: ta, itemObj, variants: it._variants, sentenceStart: true, initial: ta.value });
    } else if (task.type === 'open') {
      body.append(h('div', { class: 'sentence', style: 'line-height:1.6' }, rich(it.text)));
      const ta = h('textarea', { class: 'ans', rows: 2, spellcheck: 'true', placeholder: 'Ваш ответ на английском…' });
      body.append(ta);
      addField({ kind: 'area', mode: 'open', el: ta, itemObj, variants: it._variants, sentenceStart: true });
    } else if (task.type === 'discussion') {
      body.append(h('div', { class: 'sentence', style: 'line-height:1.6' }, rich(it.text)));
    }
    body.append(itemObj.fb);
    wrap.append(itemEl);
  });
  return wrap;
}

function renderMatching({ task, sec }) {
  const opts = task._options;
  const left = h('div', { class: 'match-left' });
  task.items.forEach((it, ii) => {
    const itemObj = { task, sec, it, ii, fields: [], fb: h('div', { class: 'fb' }) };
    const sel = h('select', { class: 'msel' }, h('option', { value: '' }, '—'),
      opts.map((o, oi) => h('option', { value: o, title: o }, LETTERS[oi])));
    const el = h('div', { class: 'item' },
      h('div', { class: 'item-n' }, ii + 1),
      h('div', { class: 'item-body' }, h('div', null, rich(it.left)), itemObj.fb), sel);
    itemObj.el = el;
    S.items.push(itemObj);
    left.append(el);
    addField({ kind: 'select', el: sel, itemObj, answer: it.answer, letterOf: (v) => LETTERS[opts.indexOf(v)] });
  });
  const right = h('div', { class: 'match-right' }, h('ol', null, opts.map((o) => h('li', null, rich(o)))));
  return h('div', { class: 'match-grid' }, left, right);
}

function renderWriting({ task, sec }) {
  const itemObj = { task, sec, it: task.items[0], ii: 0, fields: [], fb: h('div', { class: 'fb' }) };
  const ta = h('textarea', { class: 'ans essay', spellcheck: 'true', placeholder: 'Пишите эссе здесь…' });
  const counter = h('span');
  const chips = task.required_words.map((w) => ({ w, el: h('span', { class: 'chip' }, w) }));
  const upd = () => {
    const n = countWords(ta.value);
    const min = task.min_words, max = task.max_words;
    counter.textContent = `${n} слов` + (min || max ? ` (нужно ${min || '?'}–${max || '?'})` : '');
    counter.style.color = min && n < min ? 'var(--warn)' : max && n > max ? 'var(--bad)' : 'var(--ok)';
    const low = ta.value.toLowerCase();
    for (const c of chips) {
      const core = c.w.toLowerCase().replace(/^to\s+/, '').replace(/\s*\(.*?\)/g, '').trim();
      const stem = core.split(' ').map((x) => (x.length > 5 ? x.slice(0, x.length - 2) : x)).join(' ');
      c.el.classList.toggle('hit', low.includes(core) || low.includes(stem));
    }
  };
  ta.addEventListener('input', upd);
  const el = h('div', null, ta, h('div', { class: 'wc' }, counter, chips.length ? h('span', null, 'Обязательные слова:') : null, chips.map((c) => c.el)), itemObj.fb);
  itemObj.el = el;
  S.items.push(itemObj);
  addField({ kind: 'area', mode: 'writing', el: ta, itemObj, onRestore: upd });
  return el;
}

/* ---------- fields */
function addField(f) {
  f.key = `${f.itemObj.task._key}.${f.itemObj.ii}.${f.bi || 0}`;
  f.mode = f.mode || (f.kind === 'text' ? 'gap' : 'choice');
  f.status = null;
  f.itemObj.fields.push(f);
  S.fields.push(f);
  const onChange = () => {
    S.saved[f.key] = getVal(f);
    LS.set('ans:' + S.id, S.saved);
    updateProgress();
    if (f.itemObj.task._boxEl) markBoxUsage(f.itemObj.task);
  };
  f.el.addEventListener('input', onChange);
  f.el.addEventListener('change', onChange);
  if (f.kind === 'text') {
    f.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey) {
        e.preventDefault();
        const list = S.fields.filter((x) => x.kind === 'text' && !x.el.readOnly);
        const i = list.indexOf(f);
        if (list[i + 1]) list[i + 1].el.focus();
      }
    });
  }
}

function markBoxUsage(task) {
  const used = S.fields.filter((f) => f.itemObj.task === task).map((f) => norm(getVal(f)).toLowerCase());
  $$('.chip', task._boxEl).forEach((c) => c.classList.toggle('used', used.includes(c.textContent.toLowerCase())));
}

function getVal(f) {
  if (f.kind === 'radio') { const c = $('input:checked', f.el); return c ? c.value : ''; }
  return f.el.value;
}
function setVal(f, v) {
  if (f.kind === 'radio') $$('input', f.el).forEach((i) => { i.checked = i.value === v; });
  else f.el.value = v;
}
function lockField(f, locked) {
  if (f.kind === 'radio') $$('input', f.el).forEach((i) => { i.disabled = locked; });
  else if (f.kind === 'select') f.el.disabled = locked;
  else f.el.readOnly = locked;
}
const isGradable = (f) => f.mode === 'gap' || f.mode === 'choice' || f.mode === 'ec';
const isFilled = (f) => {
  const v = getVal(f).trim();
  return f.mode === 'ec' ? v && v !== f.initial : !!v;
};

/* ---------- bottom bar */
function renderBar() {
  const slot = $('#bar-slot');
  const prog = h('div', { class: 'progress' }, h('i', { id: 'prog-i' }));
  const progTxt = h('span', { class: 'small muted', id: 'prog-t' });
  let content;
  if (!S.checked) {
    content = [prog, progTxt,
      h('button', { class: 'btn', onclick: resetAll, title: 'Стереть все ответы' }, 'Сбросить'),
      h('button', { class: 'btn primary', onclick: checkAll }, '✓ Проверить', h('span', { class: 'small', style: 'opacity:.7' }, 'Ctrl+Enter'))];
  } else {
    const r = S.result;
    const hasMistakes = S.fields.some((f) => ['wrong', 'case', 'empty'].includes(f.status));
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
function startTimer() {
  stopTimer();
  S.startedAt = Date.now();
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
function gradeField(f) {
  const v = getVal(f);
  switch (f.mode) {
    case 'gap': return grade(v, f.variants, { sentenceStart: f.sentenceStart });
    case 'ec': {
      if (!v.trim() || norm(v) === norm(f.initial)) return { status: v.trim() ? 'wrong' : 'empty', note: 'предложение не исправлено' };
      return grade(v, f.variants, { sentenceStart: true });
    }
    case 'choice': return { status: !v ? 'empty' : v === f.answer ? 'correct' : 'wrong' };
    case 'open': {
      if (!v.trim()) return { status: 'skipped' };
      const g = f.variants.length ? grade(v, f.variants, { sentenceStart: true }) : { status: 'wrong' };
      if (g.status === 'correct' || g.status === 'case') return g;
      return { status: 'review' };
    }
    case 'writing': return { status: v.trim() ? 'review' : 'skipped' };
    default: return { status: 'skipped' };
  }
}

const STATUS_CLASSES = ['st-correct', 'st-wrong', 'st-case', 'st-empty', 'st-review'];

function checkAll() {
  const firstCheck = !S.attemptSaved;
  for (const f of S.fields) {
    if (f.status === 'correct' && f.locked) continue;
    Object.assign(f, { status: null, note: null, typo: false, expected: null }, gradeField(f));
    f.el.classList.remove(...STATUS_CLASSES);
    if (f.status !== 'skipped') f.el.classList.add('st-' + f.status);
    f.locked = true;
    lockField(f, true);
  }
  S.items.forEach(renderFeedback);
  S.checked = true;
  stopTimer();
  S.elapsed = Math.round((Date.now() - S.startedAt) / 1000);

  const gradable = S.fields.filter(isGradable);
  const correct = gradable.filter((f) => f.status === 'correct').length;
  const total = gradable.length;
  const pct = total ? Math.round((100 * correct) / total) : 100;
  const mistakes = S.fields.filter((f) => ['wrong', 'case', 'empty'].includes(f.status));
  const reviews = S.fields.filter((f) => f.status === 'review');
  S.result = { correct, total, pct, mistakes: mistakes.length, reviews: reviews.length, firstCheck };

  // per-task score
  for (const sec of S.test.sections) for (const task of sec.tasks) {
    const fs = S.fields.filter((f) => f.itemObj.task === task && isGradable(f));
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
      test_id: S.id, title: S.test.meta.title || '', round: S.test.meta.round || 1,
      correct, total, pct, seconds: S.elapsed, reviews: reviews.length,
      mistakes: mistakes.map(mistakeRecord),
    }).catch((e) => toast('Не удалось сохранить попытку: ' + e.message, true));
  }
  copiedP.then((copied) => { S.result.copied = copied; renderBar(); showResultModal(); });
}

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
        f.typo ? ' (похоже на опечатку)' : '', f.note ? ` — ${f.note}` : ''));
      if (f.kind === 'radio') $$('input', f.el).forEach((i) => i.nextElementSibling.classList.toggle('right-answer', i.value === f.answer));
    } else if (f.status === 'case') {
      anyBad = true;
      lines.push(h('div', { class: 'l-case' }, 'Аа ', pre, 'Ошибка регистра (заглавная/строчная буква). Правильно: ', h('b', null, f.expected || right)));
    } else if (f.status === 'review') {
      lines.push(h('div', { class: 'l-rev' }, f.mode === 'writing' ? '📝 Эссе уйдёт на проверку ИИ вместе с отчётом.' : '📝 Не совпало с ключом дословно — отправлено на проверку ИИ.'));
      if (it.model_answer) lines.push(h('div', { class: 'expl' }, 'Образец: ', h('i', null, it.model_answer)));
    } else if (f.status === 'correct' && f.note) {
      lines.push(h('div', { class: 'l-ok' }, '✓ ', pre, 'Засчитано, ', f.note));
    } else if (f.status === 'skipped' && f.mode === 'open' && it.model_answer) {
      lines.push(h('div', { class: 'expl' }, 'Образец: ', h('i', null, it.model_answer)));
    }
  }
  if (anyBad && it.explanation) lines.push(h('div', { class: 'expl' }, '💡 ', rich(it.explanation)));
  io.fb.append(...lines);
}

function correctText(f) {
  if (f.mode === 'choice') {
    if (f.labels) return f.labels[f.answer] || f.answer;
    if (f.letterOf) return `${f.letterOf(f.answer)}) ${f.answer}`;
    return f.answer || '(ключ отсутствует)';
  }
  const vs = (f.variants || []).map((v) => (f.sentenceStart ? capFirst(norm(v)) : norm(v)));
  return vs.length ? [...new Set(vs)].join(' / ') : '(ключ отсутствует)';
}

function retryMistakes() {
  closeModal();
  for (const f of S.fields) {
    if (['wrong', 'case', 'empty'].includes(f.status)) {
      f.locked = false;
      f.status = null;
      lockField(f, false);
      f.el.classList.remove(...STATUS_CLASSES);
      if (f.kind === 'radio') { $$('input', f.el).forEach((i) => { i.checked = false; i.nextElementSibling.classList.remove('right-answer'); }); }
      else if (f.mode === 'ec') f.el.value = f.initial;
      else f.el.value = '';
      if (f.kind === 'text') f.el.dispatchEvent(new Event('input'));
    }
  }
  S.items.forEach((io) => { if (io.fields.some((f) => f.status == null)) io.fb.replaceChildren(); });
  S.checked = false;
  renderBar();
  const first = S.fields.find((f) => !f.locked);
  if (first) { first.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first.kind !== 'radio') first.el.focus({ preventScroll: true }); }
  S.startedAt = Date.now() - S.elapsed * 1000;
  startTimerKeep();
}
function startTimerKeep() {
  const base = S.startedAt;
  startTimer();
  S.startedAt = base;
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
  const { task, it } = f.itemObj;
  switch (task.type) {
    case 'gap_fill': {
      let ctx = it.text;
      if (f.nBlanks > 1) {
        let k = 0;
        ctx = it._parts.map((p, i) => p + (i < it._parts.length - 1 ? `___(${++k})` : '')).join('');
      }
      return [it.prompt ? `Исходное: ${it.prompt}` : null, it.key ? `Ключевое слово: ${it.key}` : null, `Предложение: ${ctx}${f.nBlanks > 1 ? `  [пропуск ${f.bi + 1}]` : ''}`].filter(Boolean);
    }
    case 'multiple_choice':
      return [`Вопрос: ${it.question}`, `Варианты: ${it.options.map((o, i) => `${LETTERS[i]}) ${o}`).join('; ')}`];
    case 'true_false': return [`Утверждение: ${it.statement}`];
    case 'matching': return [`Элемент: ${it.left}`];
    case 'error_correction': return [`Предложение с ошибкой: ${it.text}`];
    case 'open': return [`Задание: ${it.text}`];
    default: return [];
  }
}
const TYPE_RU = { wrong: 'неверный ответ', case: 'ошибка регистра (заглавная/строчная буква)', empty: 'нет ответа' };

function userText(f) {
  const v = getVal(f).trim();
  if (!v) return '(пусто)';
  if (f.labels) return f.labels[v] || v;
  if (f.letterOf) return `${f.letterOf(v)}) ${v}`;
  return v;
}

function mistakeRecord(f) {
  const { task, sec } = f.itemObj;
  return {
    section: sec ? sec.title : '', task: `${task.id || ''} ${task.title || ''}`.trim(), task_type: task.type,
    instruction: task.instruction || '', context: itemContext(f).join(' | '),
    user: userText(f), correct: correctText(f), kind: f.status, typo: !!f.typo,
  };
}

function buildReport() {
  const t = S.test, meta = t.meta, r = S.result || {};
  const mistakes = S.fields.filter((f) => ['wrong', 'case', 'empty'].includes(f.status));
  const reviews = S.fields.filter((f) => f.status === 'review' && f.mode === 'open');
  const essays = S.fields.filter((f) => f.status === 'review' && f.mode === 'writing');
  const L = [];
  L.push('=== РЕЗУЛЬТАТ ТЕСТА ===');
  L.push(`Тест: ${meta.title || ''} | Раунд: ${meta.round || 1} | Уровень: ${meta.level || settings.level}`);
  if ((meta.grammar_topics || []).length) L.push(`Грамматика теста: ${meta.grammar_topics.join('; ')}`);
  L.push(`Результат: ${r.correct}/${r.total} (${r.pct}%) · ошибок: ${mistakes.length} · открытых ответов на проверку: ${reviews.length}${essays.length ? ' · эссе: 1' : ''} · время: ${Math.round((S.elapsed || 0) / 60)} мин`);
  L.push('');
  if (mistakes.length) {
    L.push(`=== МОИ ОШИБКИ (${mistakes.length}) ===`);
    let lastTask = null;
    mistakes.forEach((f, i) => {
      const { task } = f.itemObj;
      if (task !== lastTask) {
        L.push(`\n[${task.id ? task.id + '. ' : ''}${task.title || ''}] ${task.instruction || ''}`.trim());
        lastTask = task;
      }
      L.push(`${i + 1}) ${itemContext(f).join('\n   ')}`);
      L.push(`   Мой ответ: «${userText(f)}»`);
      L.push(`   Ключ: «${correctText(f)}»`);
      L.push(`   Тип: ${TYPE_RU[f.status]}${f.typo ? ' (возможно, опечатка)' : ''}`);
    });
    L.push('');
  }
  if (reviews.length) {
    L.push(`=== ОТКРЫТЫЕ ОТВЕТЫ НА ПРОВЕРКУ (${reviews.length}) ===`);
    let lastTask = null;
    reviews.forEach((f, i) => {
      const { task, it } = f.itemObj;
      if (task !== lastTask) { L.push(`\n[${task.id ? task.id + '. ' : ''}${task.title || ''}] ${task.instruction || ''}`.trim()); lastTask = task; }
      L.push(`${i + 1}) ${it.text}`);
      L.push(`   Мой ответ: «${getVal(f).trim()}»`);
      if (it.model_answer) L.push(`   Образец из теста: «${it.model_answer}»`);
    });
    L.push('');
  }
  for (const f of essays) {
    const { task } = f.itemObj;
    L.push('=== ЭССЕ НА ПРОВЕРКУ ===');
    L.push(`Задание: ${task.instruction || ''}`);
    if (task.required_words.length) L.push(`Обязательные слова: ${task.required_words.join(', ')}`);
    L.push(`Мой текст (${countWords(getVal(f))} слов):\n${getVal(f).trim()}`);
    L.push('');
  }
  if (!mistakes.length && !reviews.length && !essays.length) L.push('Ошибок нет! 🎉\n');
  L.push('=== ИНСТРУКЦИЯ ДЛЯ ИИ ===');
  L.push(reviewPrompt(meta.level || settings.level, (meta.round || 1) + 1));
  return L.join('\n');
}

function reviewPrompt(level, nextRound) {
  const schema = settings.includeSchema
    ? S.init?.prompts?.schema || ''
    : 'Используй ту же JSON-схему englishtest/v1, что и в первом сообщении этого чата (meta, review, vocabulary, grammar_notes, sections; типы заданий: gap_fill, multiple_choice, true_false, matching, error_correction, open, writing). Пропуск = ___, ответы — с правильным регистром, "answer" = точный текст варианта.';
  return fill(S.init?.prompts?.review || '', { LEVEL: level, NEXT_ROUND: nextRound, SCHEMA: schema });
}

function buildBankReport(bank) {
  const L = [`=== НАКОПЛЕННЫЕ ОШИБКИ ИЗ РАЗНЫХ ТЕСТОВ (${bank.length}) ===`];
  L.push('Это мои ошибки за последнее время. Найди в них закономерности и сделай тест на их проработку.');
  bank.forEach((m, i) => {
    L.push(`\n${i + 1}) [${m.task || ''}] ${m.instruction || ''}`);
    L.push(`   ${String(m.context || '').split(' | ').join('\n   ')}`);
    L.push(`   Мой ответ: «${m.user}» · Ключ: «${m.correct}» · Тип: ${TYPE_RU[m.kind] || m.kind}`);
  });
  L.push('\n=== ИНСТРУКЦИЯ ДЛЯ ИИ ===');
  L.push(reviewPrompt(settings.level, 1));
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
  const hasMistakes = r.mistakes > 0;
  const needsAI = r.mistakes + r.reviews > 0;
  let notice;
  if (!needsAI) notice = h('div', { class: 'notice' }, '🎉 Ни одной ошибки! Можно переходить к новому тексту или попросить ИИ усложнить тест.');
  else if (r.copied) notice = h('div', { class: 'notice' }, '✓ Отчёт с ошибками и инструкцией для ИИ уже в буфере обмена. Откройте чат с ИИ и нажмите Ctrl+V.');
  else notice = h('div', { class: 'notice info' }, 'Нажмите «Скопировать отчёт» и отправьте его ИИ.');

  modal(
    h('h2', null, r.firstCheck ? 'Результат' : 'Результат после исправления'),
    h('div', { class: 'result-grid' },
      h('div', { class: 'big-score pct ' + pctClass(r.pct) }, r.pct + '%'),
      h('div', { class: 'counts' },
        h('span', null, `Верно: ${r.correct} из ${r.total}`),
        h('span', null, `Ошибок: ${r.mistakes}`),
        r.reviews ? h('span', null, `Открытых ответов на проверку ИИ: ${r.reviews}`) : null,
        h('span', { class: 'muted' }, `Время: ${Math.floor(S.elapsed / 60)} мин ${S.elapsed % 60} с`))),
    notice,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: async () => { const ok = await copyText(S.firstReport || S.lastReport); toast(ok ? 'Скопировано' : 'Не удалось скопировать', !ok); } },
        r.firstCheck ? '📋 Скопировать отчёт' : '📋 Скопировать отчёт первой проверки'),
      h('button', { class: 'btn', onclick: () => { pre.hidden = !pre.hidden; } }, 'Показать отчёт'),
      hasMistakes ? h('button', { class: 'btn', onclick: retryMistakes }, '↻ Перерешать ошибки') : null,
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
  modal(
    h('h2', null, 'Настройки'),
    cb('strictCase', 'Строгая проверка заглавных букв', 'Ответ с неверным регистром (monday вместо Monday, The вместо the в середине предложения) считается ошибкой и попадает в отчёт. Если пропуск стоит в начале предложения — заглавная буква обязательна.'),
    cb('autoCopy', 'Автоматически копировать ошибки при проверке', 'После нажатия «Проверить» отчёт сразу попадает в буфер обмена.'),
    cb('includeSchema', 'Добавлять схему JSON в отчёт', 'Надёжнее (ИИ точно выдаст правильный формат, даже в новом чате), но отчёт длиннее. Выключите, если работаете в одном и том же чате.'),
    h('div', { class: 'row', style: 'margin-top:16px' }, h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: closeModal }, 'Готово')),
  );
}
