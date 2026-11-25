// Opstarten, navigatie, rendering en het doorgeven van klikken aan de juiste actie.
import { CONFIG } from './config.js';
import { token, checkAccess, ApiError, repoUrl } from './github.js';
import { store, init, refresh, flush, subscribe, pending, loadCommits, clearLocal, apply } from './store.js';
import { esc, ago } from './util.js';
import { icon, openDialog, toast } from './ui.js';
import { ui, actions as commonActions } from './views/common.js';
import { overviewView } from './views/overview.js';
import { todoView } from './views/todo.js';
import { mondayView } from './views/monday.js';
import { litView } from './views/literature.js';
import { feedView, newPaperCount } from './views/feed.js';

const VIEWS = {
  overzicht: { view: overviewView, icon: 'home', label: 'Overzicht' },
  todo: { view: todoView, icon: 'todo', label: 'To-do' },
  maandag: { view: mondayView, icon: 'cal', label: 'Maandag' },
  literatuur: { view: litView, icon: 'book', label: 'Literatuur' },
  feed: { view: feedView, icon: 'feed', label: 'Feed' },
};

const ACTIONS = { ...commonActions };
for (const { view } of Object.values(VIEWS)) Object.assign(ACTIONS, view.actions || {});

const $ = (s) => document.querySelector(s);
const viewEl = () => $('#view');
let current = null;

const route = () => {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  return VIEWS[r] ? r : 'overzicht';
};

// ---------- chrome (navigatie + kop)

function renderNav() {
  const r = route();
  const n = newPaperCount();
  const todayMonday = store.data.todo.tasks.filter((t) => t.monday && !t.done).length;
  $('#nav').innerHTML = `
    <div class="brand">${icon('todo')}<span>Scriptie</span></div>
    ${Object.entries(VIEWS)
      .map(([k, v]) => {
        const badge = k === 'feed' && n ? `<span class="badge">${n > 99 ? '99+' : n}</span>` : k === 'maandag' && todayMonday ? `<span class="badge soft">${todayMonday}</span>` : '';
        return `<a href="#/${k}" class="${k === r ? 'active' : ''}" ${k === r ? 'aria-current="page"' : ''}>${icon(v.icon)}<span>${v.label}</span>${badge}</a>`;
      })
      .join('')}`;
}

function renderSync() {
  const el = $('#sync');
  const n = pending();
  const map = {
    idle: ['', ''],
    loading: ['busy', 'Laden…'],
    saving: ['busy', n ? `Opslaan… (${n})` : 'Opslaan…'],
    saved: ['ok', store.lastSync ? `Opgeslagen · ${ago(store.lastSync)}` : 'Opgeslagen'],
    offline: ['warn', n ? `Offline · ${n} wachtend` : 'Offline'],
    error: ['err', 'Fout · tik voor info'],
    auth: ['err', 'Opnieuw inloggen'],
  };
  const [cls, text] = map[store.status] || map.idle;
  el.className = `sync ${cls}`;
  el.textContent = text;
  el.title = store.message || '';
}

// ---------- rendering

function render() {
  if (!token.get() || store.status === 'auth') return renderLogin();
  document.body.classList.remove('logged-out');
  const r = route();
  const { view, label } = VIEWS[r];
  if (current !== r) {
    VIEWS[current]?.view.leave?.();
    current = r;
    view.enter?.();
    window.scrollTo(0, 0);
  }
  $('#title').textContent = label;
  document.title = `${label} · Scriptie`;

  // Focus + ingetypte tekst bewaren over een re-render heen (bijv. als er data binnenkomt tijdens typen).
  const a = document.activeElement;
  const keep = a && viewEl().contains(a) && a.dataset.fk ? { fk: a.dataset.fk, value: a.value, s: a.selectionStart, e: a.selectionEnd } : null;

  viewEl().innerHTML = view.render();
  view.mount?.(viewEl(), render);

  const focusSel = ui.focusAfter || (keep && `[data-fk="${keep.fk}"]`);
  ui.focusAfter = null;
  if (focusSel) {
    const el = viewEl().querySelector(focusSel);
    if (el) {
      if (keep && el.dataset.fk === keep.fk) el.value = keep.value;
      el.focus({ preventScroll: true });
      try {
        if (keep && el.dataset.fk === keep.fk) el.setSelectionRange(keep.s, keep.e);
      } catch {
        /* type=search e.d. */
      }
    }
  }
  if (ui.scrollTo) {
    viewEl().querySelector(ui.scrollTo)?.scrollIntoView({ block: 'center' });
    ui.scrollTo = null;
  }
  renderNav();
  renderSync();
}

function renderLogin(err = '') {
  document.body.classList.add('logged-out');
  $('#nav').innerHTML = '';
  $('#title').textContent = 'Inloggen';
  const msg = err || (store.status === 'auth' ? store.message : '');
  viewEl().innerHTML = `
    <section class="card login">
      <h2>Scriptiedashboard</h2>
      <p>Deze pagina leest en schrijft rechtstreeks in de private repo <b>${esc(CONFIG.owner)}/${esc(CONFIG.repo)}</b> (branch <code>${esc(CONFIG.branch)}</code>). Daarvoor heb je een GitHub-token nodig met toegang tot die repo. Het token blijft alleen op dit apparaat.</p>
      <ol>
        <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">GitHub → nieuw fine-grained token</a>.</li>
        <li><b>Repository access</b>: <i>Only select repositories</i> → <code>${esc(CONFIG.repo)}</code>.</li>
        <li><b>Permissions → Contents</b>: <i>Read and write</i> (of <i>Read-only</i> als je alleen wilt kijken).</li>
        <li>Kies een vervaldatum ná je inleverdatum, genereer en kopieer het token.</li>
      </ol>
      <form data-form="login" class="login-form">
        <input type="password" name="token" placeholder="github_pat_…" autocomplete="off" required aria-label="GitHub-token">
        <button class="btn primary">Inloggen</button>
      </form>
      ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    </section>`;
  $('#sync').textContent = '';
}

// ---------- menu

function openMenu() {
  const todo = store.data.todo;
  const wd = todo.settings?.meetingWeekday ?? 1;
  const days = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  openDialog(
    `<h2>Instellingen</h2>
     <p class="dlg-sub">${store.lastSync ? `Laatst gesynchroniseerd ${esc(ago(store.lastSync))}` : 'Nog niet gesynchroniseerd'}${pending() ? ` · ${pending()} wijziging(en) wachten` : ''}${store.message ? `<br><span class="err">${esc(store.message)}</span>` : ''}</p>
     <label class="field">Meetingdag<select name="weekday">${days.map((d, i) => `<option value="${i}" ${i === wd ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
     <label class="field">Naam van de meeting<input name="label" value="${esc(todo.settings?.meetingLabel || 'Scriptiemeeting')}"></label>
     <p class="small"><a href="${repoUrl()}/tree/${encodeURIComponent(CONFIG.branch)}" target="_blank" rel="noopener noreferrer">Data op GitHub bekijken ${icon('ext')}</a></p>
     <div class="dlg-actions">
       <button class="btn danger" value="logout" formnovalidate>Uitloggen op dit apparaat</button>
       <span class="spacer"></span>
       <button class="btn" value="cancel" formnovalidate>Sluiten</button>
       <button class="btn primary" value="ok">Opslaan</button>
     </div>`,
    {
      onSubmit(fd, v) {
        if (v === 'logout') {
          if (pending() && !confirm(`Er wachten nog ${pending()} wijzigingen die niet zijn opgeslagen. Toch uitloggen?`)) return false;
          token.clear();
          clearLocal();
          location.reload();
          return;
        }
        const patch = { meetingWeekday: Number(fd.get('weekday')), meetingLabel: fd.get('label').trim() || 'Scriptiemeeting' };
        if (patch.meetingWeekday !== wd || patch.meetingLabel !== todo.settings?.meetingLabel) apply('todo', { type: 'settings.update', patch }, 'instellingen');
      },
    },
  );
}

// ---------- events

async function dispatch(name, el, e) {
  if (name === 'form:login') return login(el);
  const fn = ACTIONS[name];
  if (!fn) return console.warn('geen actie', name);
  try {
    const res = await fn(el, e);
    if (res === 'render') render();
  } catch (err) {
    console.error(err);
    toast(`Er ging iets mis: ${err.message}`);
  }
}

async function login(form) {
  const t = form.elements.token.value.trim();
  if (!t) return;
  token.set(t);
  try {
    await checkAccess();
    store.status = 'idle';
    render();
    await refresh();
    loadCommits(true);
  } catch (err) {
    token.clear();
    const msg =
      err instanceof ApiError && err.status === 401
        ? 'Dit token wordt niet geaccepteerd door GitHub.'
        : err instanceof ApiError && err.status === 404
          ? `Dit token heeft geen toegang tot ${CONFIG.owner}/${CONFIG.repo}.`
          : `Inloggen mislukt: ${err.message}`;
    renderLogin(msg);
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'checkbox')) return;
  if (el.tagName === 'A' && !el.getAttribute('href')?.startsWith('#')) return;
  e.preventDefault();
  dispatch(el.dataset.act, el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset?.act && (el.type === 'checkbox' || el.tagName === 'SELECT') && viewEl().contains(el)) dispatch(el.dataset.act, el, e);
});
document.addEventListener('input', (e) => {
  if (e.target.dataset?.input) dispatch(e.target.dataset.input, e.target, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  dispatch(`form:${f.dataset.form}`, f, e);
});

$('#refreshBtn').addEventListener('click', async () => {
  await refresh();
  loadCommits(true);
});
$('#menuBtn').addEventListener('click', () => (token.get() ? openMenu() : null));
$('#sync').addEventListener('click', () => store.message && toast(store.message));

window.addEventListener('hashchange', render);
window.addEventListener('online', () => flush());
document.addEventListener('visibilitychange', () => {
  if (!token.get()) return;
  if (document.visibilityState === 'hidden') {
    flush();
    if (current === 'feed') feedView.leave();
  } else {
    if (current === 'feed') feedView.enter();
    if (!store.lastSync || Date.now() - store.lastSync > 60_000) refresh();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (pending() && store.status !== 'offline') {
    flush();
    e.preventDefault();
  }
});
window.addEventListener('error', (e) => toast(`Fout: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => console.error(e.reason));

// Statusregel elke halve minuut verversen ("opgeslagen · 2 min geleden").
setInterval(() => token.get() && renderSync(), 30_000);

let raf = 0;
subscribe(() => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(render);
});

// Lokaal testen met dev/mock_api.py: open http://localhost:8765/?mock
if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('mock')) {
  localStorage.setItem('dash.api', `${location.origin}/gh`);
}

init();
render();
if (token.get()) {
  refresh();
  loadCommits();
}
