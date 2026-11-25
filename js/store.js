// Data in het geheugen + cache in localStorage + wachtrij van wijzigingen die naar GitHub moeten.
import { CONFIG } from './config.js';
import { getFile, putFile, listCommits, ApiError, token } from './github.js';
import { reducers, DEFAULTS } from './ops.js';
import { uid } from './util.js';

const KEYS = Object.keys(CONFIG.files);
const LS_CACHE = (k) => `dash.cache.v1.${k}`;
const LS_QUEUE = 'dash.queue.v1';
const LS_COMMITS = 'dash.cache.v1.commits';

export const store = {
  data: {},
  sha: {},
  status: 'idle', // idle | loading | saving | saved | offline | error | auth
  message: '',
  queue: [], // [{ file, op, msg }]
  commits: null,
  lastSync: null,
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((f) => f());

function setStatus(s, msg = '') {
  store.status = s;
  store.message = msg;
  emit();
}

function saveCache(k) {
  try {
    localStorage.setItem(LS_CACHE(k), JSON.stringify({ data: store.data[k], sha: store.sha[k] }));
  } catch (e) {
    console.warn('cache niet opgeslagen', e);
  }
}
const saveQueue = () => localStorage.setItem(LS_QUEUE, JSON.stringify(store.queue));

function applyOp(data, op) {
  const r = reducers[op.type];
  if (r) r(data, op);
  else console.warn('onbekende operatie', op.type);
}

export function init() {
  for (const k of KEYS) {
    try {
      const c = JSON.parse(localStorage.getItem(LS_CACHE(k)) || 'null');
      if (c) {
        store.data[k] = c.data;
        store.sha[k] = c.sha;
      }
    } catch {
      /* kapotte cache: negeren */
    }
    if (!store.data[k]) store.data[k] = DEFAULTS[k]();
  }
  try {
    store.queue = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
  } catch {
    store.queue = [];
  }
  try {
    const c = JSON.parse(localStorage.getItem(LS_COMMITS) || 'null');
    if (c) store.commits = c.map((x) => ({ ...x, date: new Date(x.date) }));
  } catch {
    /* negeren */
  }
}

export const hasData = () => KEYS.some((k) => localStorage.getItem(LS_CACHE(k)));
export const pending = () => store.queue.length;

function handleError(e) {
  if (e instanceof ApiError) {
    if (e.status === 401) return setStatus('auth', 'Je token is ongeldig of verlopen. Plak een nieuw token.');
    if (e.status === 0) return setStatus('offline', 'Offline. Wijzigingen worden opgeslagen zodra je weer verbinding hebt.');
    if (e.status === 404) return setStatus('error', `Niet gevonden: heeft dit token toegang tot ${CONFIG.owner}/${CONFIG.repo}, en bestaat de branch "${CONFIG.branch}"?`);
    if (e.status === 403) return setStatus('error', /rate limit/i.test(e.message) ? 'GitHub-limiet bereikt, probeer het over een paar minuten opnieuw.' : `Geen schrijfrechten (${e.message}). Heeft je token "Contents: Read and write"?`);
  }
  console.error(e);
  setStatus('error', e.message || String(e));
}

export async function refresh() {
  if (!token.get()) return;
  setStatus('loading');
  try {
    const results = await Promise.all(KEYS.map((k) => getFile(CONFIG.files[k])));
    KEYS.forEach((k, i) => {
      const base = results[i].data || DEFAULTS[k]();
      for (const q of store.queue.filter((x) => x.file === k)) applyOp(base, q.op);
      store.data[k] = base;
      store.sha[k] = results[i].sha;
      saveCache(k);
    });
    store.lastSync = new Date();
    if (store.queue.length) {
      setStatus('saving');
      flush();
    } else setStatus('saved');
  } catch (e) {
    handleError(e);
  }
}

let flushTimer = null;
let retryTimer = null;
let flushing = false;

// Wijziging lokaal toepassen en in de wachtrij zetten; na ~1 s gaan alle wachtende wijzigingen in één commit.
export function apply(file, op, msg) {
  const o = { ...op, opId: uid() };
  applyOp(store.data[file], o);
  store.queue.push({ file, op: o, msg });
  saveQueue();
  saveCache(file);
  setStatus('saving');
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 1000);
}

export async function flush() {
  clearTimeout(flushTimer);
  if (flushing) {
    flushTimer = setTimeout(flush, 600);
    return;
  }
  if (!store.queue.length || !token.get()) return;
  flushing = true;
  clearTimeout(retryTimer);
  try {
    for (const k of KEYS) {
      let conflicts = 0;
      for (;;) {
        const batch = store.queue.filter((q) => q.file === k);
        if (!batch.length) break;
        const ids = new Set(batch.map((q) => q.op.opId));
        const msgs = batch.map((b) => b.msg);
        const msg = msgs.length === 1 ? msgs[0] : `${msgs.length} wijzigingen: ${msgs.slice(0, 3).join('; ')}${msgs.length > 3 ? '; …' : ''}`;
        try {
          store.sha[k] = await putFile(CONFIG.files[k], store.data[k], store.sha[k], `dashboard: ${msg}`);
          store.queue = store.queue.filter((q) => !ids.has(q.op.opId));
          saveQueue();
          saveCache(k);
        } catch (e) {
          if (e instanceof ApiError && (e.status === 409 || e.status === 422) && conflicts < 3) {
            // Iemand (of de Action, of je andere apparaat) schreef ertussen: nieuwste versie ophalen en onze wijzigingen opnieuw toepassen.
            conflicts++;
            const fresh = await getFile(CONFIG.files[k]);
            const base = fresh.data || DEFAULTS[k]();
            for (const q of store.queue.filter((x) => x.file === k)) applyOp(base, q.op);
            store.data[k] = base;
            store.sha[k] = fresh.sha;
            saveCache(k);
            emit();
            continue;
          }
          throw e;
        }
      }
    }
    store.lastSync = new Date();
    setStatus('saved');
  } catch (e) {
    handleError(e);
    if (store.status === 'offline' || store.status === 'error') retryTimer = setTimeout(flush, 20000);
  } finally {
    flushing = false;
  }
}

export async function loadCommits(force = false) {
  if (!token.get() || (store.commits && !force && store._commitsFresh)) return;
  try {
    const list = await listCommits(40);
    store.commits = list.map((c) => ({
      sha: c.sha,
      url: c.html_url,
      msg: (c.commit?.message || '').split('\n')[0],
      date: new Date(c.commit?.author?.date || c.commit?.committer?.date),
    }));
    store._commitsFresh = true;
    localStorage.setItem(LS_COMMITS, JSON.stringify(store.commits));
    emit();
  } catch (e) {
    console.warn('commits niet geladen', e);
  }
}

export function clearLocal() {
  for (const k of KEYS) localStorage.removeItem(LS_CACHE(k));
  localStorage.removeItem(LS_QUEUE);
  localStorage.removeItem(LS_COMMITS);
}
