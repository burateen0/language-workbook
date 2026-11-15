'use strict';
/* Локальное хранилище вместо Python-сервера.
   Тесты, попытки и банк ошибок живут в localStorage этого браузера.
   Если localStorage недоступен (приватный режим, запрет cookies) — работаем в памяти до закрытия вкладки. */

const DB_PREFIX = 'ewb:db:';
const DB = (() => {
  let mem = null;
  try {
    const k = DB_PREFIX + '__probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
  } catch {
    mem = new Map();
  }
  return {
    persistent: !mem,
    read(key, def) {
      try {
        const v = mem ? mem.get(key) : localStorage.getItem(DB_PREFIX + key);
        return v == null ? def : JSON.parse(v);
      } catch { return def; }
    },
    write(key, val) {
      const s = JSON.stringify(val);
      if (mem) { mem.set(key, s); return; }
      try { localStorage.setItem(DB_PREFIX + key, s); } catch {
        throw new Error('Хранилище браузера переполнено. Скачайте резервную копию и удалите старые тесты.');
      }
    },
    remove(key) {
      if (mem) mem.delete(key);
      else try { localStorage.removeItem(DB_PREFIX + key); } catch { /* ignore */ }
    },
  };
})();

function newTestId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const rnd = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rnd}`;
}
const nowIso = () => new Date().toISOString().slice(0, 19);

const store = {
  ids: () => DB.read('tests', []),
  get: (id) => DB.read('test:' + id, null),
  attempts: () => DB.read('attempts', []),
  bank: () => DB.read('bank', []),

  saveTest(test, parentId) {
    const id = newTestId();
    let rootId = id;
    const parent = parentId ? store.get(parentId) : null;
    if (parent) rootId = parent.root_id || parent.id;
    const rec = { id, created: nowIso(), parent_id: parent ? parentId : null, root_id: rootId, test };
    DB.write('test:' + id, rec);
    DB.write('tests', [...store.ids(), id]);
    return id;
  },

  deleteTest(id) {
    if (!store.get(id)) return false;
    DB.remove('test:' + id);
    DB.write('tests', store.ids().filter((x) => x !== id));
    DB.write('attempts', store.attempts().filter((a) => a.test_id !== id));
    return true;
  },

  addAttempt(a) {
    a.date = nowIso();
    DB.write('attempts', [...store.attempts(), a]);
    if (a.mistakes && a.mistakes.length) {
      const bank = store.bank();
      for (const m of a.mistakes) bank.push({ ...m, date: a.date, test_id: a.test_id, test_title: a.title });
      DB.write('bank', bank.slice(-500));
    }
  },

  listTests() {
    const byTest = {};
    for (const a of store.attempts()) (byTest[a.test_id] = byTest[a.test_id] || []).push(a);
    return store.ids().map(store.get).filter(Boolean).map((rec) => {
      const meta = (rec.test && rec.test.meta) || {};
      const pcts = (byTest[rec.id] || []).map((t) => t.pct || 0);
      return {
        id: rec.id, created: rec.created, parent_id: rec.parent_id, root_id: rec.root_id || rec.id,
        title: meta.title || 'Без названия', level: meta.level || '', round: meta.round || 1,
        grammar_topics: meta.grammar_topics || [],
        attempts: pcts.length, best_pct: pcts.length ? Math.max(...pcts) : null, last_pct: pcts.length ? pcts.at(-1) : null,
      };
    });
  },

  init() {
    const tests = store.listTests();
    const done = [];
    for (const t of [...tests].sort((a, b) => (b.created || '').localeCompare(a.created || ''))) {
      for (const g of t.grammar_topics) if (!done.includes(g)) done.push(g);
    }
    const attempts = store.attempts();
    return {
      prompts: window.PROMPTS,
      tests,
      done_topics: done.slice(0, 15),
      bank_count: store.bank().length,
      stats: {
        attempts: attempts.length,
        avg_pct: attempts.length ? Math.round(attempts.reduce((s, a) => s + (a.pct || 0), 0) / attempts.length) : null,
        minutes: Math.round(attempts.reduce((s, a) => s + (a.seconds || 0), 0) / 60),
      },
    };
  },

  exportAll() {
    return {
      format: 'english-workbook-backup', version: 1, exported: nowIso(),
      tests: store.ids().map(store.get).filter(Boolean),
      attempts: store.attempts(),
      bank: store.bank(),
    };
  },

  importAll(data) {
    if (!data || data.format !== 'english-workbook-backup') throw new Error('Это не файл резервной копии English Workbook.');
    const ids = store.ids();
    let added = 0;
    for (const rec of data.tests || []) {
      if (!rec || !rec.id || ids.includes(rec.id)) continue;
      DB.write('test:' + rec.id, rec);
      ids.push(rec.id);
      added++;
    }
    DB.write('tests', ids);
    const key = (a) => `${a.test_id}|${a.date}`;
    const have = new Set(store.attempts().map(key));
    DB.write('attempts', [...store.attempts(), ...(data.attempts || []).filter((a) => !have.has(key(a)))]);
    const bkey = (m) => `${m.test_id}|${m.date}|${m.context}|${m.user}`;
    const hb = new Set(store.bank().map(bkey));
    DB.write('bank', [...store.bank(), ...(data.bank || []).filter((m) => !hb.has(bkey(m)))].slice(-500));
    return added;
  },

  wipe() {
    for (const id of store.ids()) DB.remove('test:' + id);
    ['tests', 'attempts', 'bank'].forEach(DB.remove);
  },
};

/** Тот же интерфейс, что был у Python-сервера: api('/api/...', body?) */
async function localApi(path, body) {
  const url = new URL(path, location.href);
  const p = url.pathname.replace(/^.*\/api\//, '/api/');
  switch (p) {
    case '/api/init': return store.init();
    case '/api/test':
      if (body === undefined) {
        const rec = store.get(url.searchParams.get('id') || '');
        if (!rec) throw new Error('Тест не найден в этом браузере. Возможно, он был создан на другом устройстве — перенесите его через резервную копию.');
        return rec;
      }
      if (!body.test || typeof body.test !== 'object') throw new Error('test must be an object');
      return { id: store.saveTest(body.test, body.parent_id) };
    case '/api/test/delete': return { ok: store.deleteTest(body.id) };
    case '/api/attempt': store.addAttempt(body); return { ok: true };
    case '/api/bank': return store.bank();
    case '/api/bank/clear': DB.write('bank', []); return { ok: true };
    default: throw new Error('unknown endpoint ' + p);
  }
}

/** Карточка на главной: демо, резервная копия, очистка. Вызывается из renderHome (app.js). */
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
    const a = h('a', { href: URL.createObjectURL(blob), download: `english-workbook-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
  };
  return h('div', { class: 'card' },
    h('h2', null, 'Данные'),
    h('p', { class: 'sub' }, DB.persistent
      ? 'Тесты и результаты сохраняются только в этом браузере на этом устройстве. Для переноса на другое устройство используйте резервную копию.'
      : '⚠ Браузер запретил сохранение (приватный режим?) — данные пропадут после закрытия вкладки.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => {
        const { id } = await api('/api/test', { test: window.DEMO_TEST });
        location.hash = '#test=' + id;
      } }, '▶ Демо-тест'),
      h('button', { class: 'btn', onclick: download }, '⬇ Резервная копия'),
      h('button', { class: 'btn', onclick: () => fileInp.click() }, '⬆ Восстановить'), fileInp,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm danger', onclick: () => {
        if (!confirm('Удалить ВСЕ тесты, попытки и банк ошибок из этого браузера?')) return;
        store.wipe(); renderHome();
      } }, 'Удалить всё')));
}
