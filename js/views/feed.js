// Feed: het doomscroll-alternatief. Nieuwe papers, je eigen activiteit en micro-taken door elkaar.
import { store, apply, loadCommits } from '../store.js';
import { esc, safeUrl, authorsShort, parseLocal, ago, fmt, ymd, seeded, shuffle, localIso } from '../util.js';
import { icon, toast } from '../ui.js';
import { doneEvents } from '../model.js';
import { ui, checkbox } from './common.js';

const LS_SEEN = 'dash.feedSeen';
const PAGE = 25;
const feedUi = { filter: 'all', limit: PAGE, openAbs: new Set(), seenAtOpen: null, later: new Set(JSON.parse(sessionStorage.getItem('dash.later') || '[]')) };

const lastSeen = () => localStorage.getItem(LS_SEEN) || '';

function visiblePapers() {
  const hidden = new Set(store.data.feedState.hidden);
  const inLit = new Set(store.data.lit.items.map((x) => x.key));
  return store.data.papers.items.filter((p) => !hidden.has(p.id) && !inLit.has(`feed:${p.id}`));
}

export function newPaperCount() {
  const seen = lastSeen();
  return visiblePapers().filter((p) => (p.first_seen || '') > seen).length;
}

function microTasks() {
  const rnd = seeded(ymd());
  const lit = store.data.lit.items;
  const todo = store.data.todo;
  const out = [];
  const later = feedUi.later;
  shuffle(lit.filter((x) => x.summary && !x.reviewed && !later.has(`check:${x.key}`)), rnd)
    .slice(0, 4)
    .forEach((it) => out.push({ type: 'lit-check', it, id: `check:${it.key}` }));
  shuffle(lit.filter((x) => (x.status || 'ongelezen') === 'ongelezen' && x.abstract && !later.has(`read:${x.key}`)), rnd)
    .slice(0, 3)
    .forEach((it) => out.push({ type: 'lit-read', it, id: `read:${it.key}` }));
  shuffle(todo.tasks.filter((t) => !t.done && !(t.subtasks || []).length && !later.has(`split:${t.id}`)), rnd)
    .slice(0, 1)
    .forEach((t) => out.push({ type: 'split', t, id: `split:${t.id}` }));
  const openSubs = todo.tasks.filter((t) => !t.done).flatMap((t) => (t.subtasks || []).filter((s) => !s.done).map((s) => ({ t, s })));
  shuffle(openSubs.filter(({ s }) => !later.has(`sub:${s.id}`)), rnd)
    .slice(0, 2)
    .forEach(({ t, s }) => out.push({ type: 'quick-sub', t, s, id: `sub:${s.id}` }));
  if (!todo.tasks.some((t) => t.monday && !t.done)) out.unshift({ type: 'pick-monday', id: 'pick-monday' });
  return shuffle(out, rnd);
}

function buildItems() {
  const seen = feedUi.seenAtOpen ?? lastSeen();
  const papers = visiblePapers()
    .slice()
    .sort((a, b) => (b.first_seen || '').localeCompare(a.first_seen || '') || (b.date || '').localeCompare(a.date || ''))
    .map((p) => ({ kind: 'paper', p, at: parseLocal(`${p.first_seen || p.date}T06:00:00`), isNew: (p.first_seen || '') > seen }));
  const commits = (store.commits || []).map((c) => ({ kind: 'commit', c, at: c.date }));
  const cutoff = Date.now() - 60 * 864e5;
  const done = doneEvents(store.data.todo)
    .filter((e) => e.at > cutoff)
    .map((e) => ({ kind: 'done', e, at: e.at }));
  let items;
  if (feedUi.filter === 'papers') items = papers;
  else if (feedUi.filter === 'activity') items = [...commits, ...done];
  else if (feedUi.filter === 'micro') items = [];
  else items = [...papers, ...commits, ...done];
  items.sort((a, b) => b.at - a.at); // stabiel: papers van dezelfde dag houden hun volgorde
  const micro = microTasks().map((m) => ({ kind: 'micro', m }));
  if (feedUi.filter === 'micro') return micro;
  if (feedUi.filter !== 'all') return items;
  const out = [];
  let mi = 0;
  items.forEach((it, i) => {
    out.push(it);
    if (i % 5 === 3 && mi < micro.length) out.push(micro[mi++]);
  });
  while (mi < micro.length && out.length < 8) out.push(micro[mi++]);
  return out;
}

function paperCard({ p, isNew }) {
  const url = safeUrl(p.url);
  const open = feedUi.openAbs.has(p.id);
  return `<article class="card feed-item paper-card ${isNew ? 'is-new' : ''}">
    <div class="card-top">${isNew ? '<span class="new-badge">nieuw</span>' : ''}<span class="src">${esc(p.source)}</span><span class="why">${esc((p.why || []).join(' · '))}</span><span class="when">${esc(fmt.date(parseLocal(p.date)))}</span></div>
    <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a>` : esc(p.title)}</h3>
    <div class="p-meta">${esc(authorsShort(p.authors))}${p.venue ? ` · ${esc(p.venue)}` : ''}</div>
    ${p.abstract ? `<p class="abs ${open ? '' : 'clamp'}" data-act="feed-abs" data-id="${esc(p.id)}">${esc(p.abstract)}</p>` : ''}
    <div class="card-actions">
      <button class="btn sm" data-act="feed-save" data-id="${esc(p.id)}">${icon('save')}Bewaar</button>
      <button class="btn sm ghost" data-act="feed-hide" data-id="${esc(p.id)}">${icon('hide')}Niet relevant</button>
    </div>
  </article>`;
}

function activityCard(item) {
  if (item.kind === 'commit') {
    const url = safeUrl(item.c.url);
    return `<article class="feed-item act">${icon('commit', 'act-ic')}<div class="act-body"><div class="card-top">commit op main · ${esc(ago(item.at))}</div>
      ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.c.msg)}</a>` : esc(item.c.msg)}</div></article>`;
  }
  const e = item.e;
  return `<article class="feed-item act">${icon('check', 'act-ic ok')}<div class="act-body"><div class="card-top">afgevinkt · ${esc(ago(item.at))}</div>
    ${esc(e.kind === 'sub' ? e.sub.title : e.task.title)}${e.kind === 'sub' ? `<span class="li-from"> · ${esc(e.task.title)}</span>` : ''}</div></article>`;
}

function microCard({ m }) {
  const head = (t) => `<div class="card-top micro-top">${icon('spark')}Micro-taak · ${t}</div>`;
  const later = `<button class="btn sm ghost" data-act="micro-later" data-id="${esc(m.id)}">Later</button>`;
  if (m.type === 'lit-check') {
    return `<article class="card feed-item micro">${head('check een samenvatting')}
      <h3>${esc(m.it.title)}</h3>
      <p class="p-sum">${esc(m.it.summary)}</p>
      ${m.it.relevance ? `<p class="p-rel"><b>Voor jouw thesis:</b> ${esc(m.it.relevance)}</p>` : ''}
      <div class="card-actions"><button class="btn sm primary" data-act="lit-ok" data-key="${esc(m.it.key)}">${icon('check')}Klopt</button>
      <button class="btn sm" data-act="lit-edit" data-key="${esc(m.it.key)}">${icon('edit')}Aanpassen</button>${later}</div></article>`;
  }
  if (m.type === 'lit-read') {
    const open = feedUi.openAbs.has(m.id);
    return `<article class="card feed-item micro">${head('lees een abstract (2 min)')}
      <h3>${esc(m.it.title)}</h3><div class="p-meta">${esc(authorsShort(m.it.authors))} · ${m.it.year || ''}</div>
      <p class="abs ${open ? '' : 'clamp'}" data-act="feed-abs" data-id="${esc(m.id)}">${esc(m.it.abstract)}</p>
      <div class="card-actions"><button class="btn sm primary" data-act="micro-read" data-key="${esc(m.it.key)}">${icon('check')}Gelezen</button>${later}</div></article>`;
  }
  if (m.type === 'split') {
    return `<article class="card feed-item micro">${head('maak een taak kleiner')}
      <h3>${esc(m.t.title)}</h3><p class="muted small">Deze taak heeft nog geen subtaken. Wat is de eerste stap?</p>
      <div class="card-actions"><button class="btn sm primary" data-act="micro-open-task" data-id="${esc(m.t.id)}">${icon('plus')}Subtaken toevoegen</button>${later}</div></article>`;
  }
  if (m.type === 'quick-sub') {
    return `<article class="card feed-item micro">${head('lukt dit in 10 minuten?')}
      <div class="next-row">${checkbox(false, 'sub-done', `data-task="${m.t.id}" data-sub="${m.s.id}"`, `Afvinken: ${m.s.title}`)}
      <div><div class="next-title">${esc(m.s.title)}</div><div class="next-from">uit: ${esc(m.t.title)}</div></div></div>
      <div class="card-actions">${later}</div></article>`;
  }
  return `<article class="card feed-item micro">${head('plan je week')}
    <h3>Er staat nog niks klaar voor maandag</h3>
    <div class="card-actions"><a class="btn sm primary" href="#/todo">Kies taken</a></div></article>`;
}

export const feedView = {
  title: 'Feed',
  enter() {
    feedUi.seenAtOpen = lastSeen();
    feedUi.limit = PAGE;
    loadCommits();
  },
  leave() {
    localStorage.setItem(LS_SEEN, ymd());
    feedUi.seenAtOpen = null;
  },
  render() {
    const all = buildItems();
    const shown = all.slice(0, feedUi.limit);
    const papers = store.data.papers;
    const nNew = visiblePapers().filter((p) => (p.first_seen || '') > (feedUi.seenAtOpen ?? lastSeen())).length;
    const filters = [
      ['all', 'Alles'],
      ['papers', 'Papers'],
      ['activity', 'Activiteit'],
      ['micro', 'Micro-taken'],
    ];
    return `
      <div class="feed-head">
        <div class="chips" role="group" aria-label="Filter">${filters.map(([v, l]) => `<button class="chip-btn" data-act="feed-filter" data-v="${v}" aria-pressed="${feedUi.filter === v}">${l}</button>`).join('')}</div>
        <p class="result-count">${nNew ? `<b>${nNew} nieuw</b> · ` : ''}papers bijgewerkt ${esc(papers.updated ? ago(new Date(papers.updated)) : 'nog nooit')}</p>
      </div>
      ${shown
        .map((it) => {
          if (it.kind === 'paper') return paperCard(it);
          if (it.kind === 'micro') return microCard(it);
          return activityCard(it);
        })
        .join('')}
      ${
        shown.length < all.length
          ? '<div id="feed-more" class="feed-more">Meer laden…</div>'
          : `<div class="feed-end">${icon('check')}<div><b>Je bent helemaal bij.</b><br>Nieuwe papers komen elke ochtend binnen. Pak anders een <button class="linkbtn" data-act="feed-filter" data-v="micro">micro-taak</button>.</div></div>`
      }`;
  },
  mount(el, rerender) {
    const s = el.querySelector('#feed-more');
    if (!s) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        feedUi.limit += PAGE;
        rerender();
      }
    });
    io.observe(s);
  },
  actions: {
    'feed-filter'(el) {
      feedUi.filter = el.dataset.v;
      feedUi.limit = PAGE;
      return 'render';
    },
    'feed-abs'(el) {
      const id = el.dataset.id;
      if (feedUi.openAbs.has(id)) feedUi.openAbs.delete(id);
      else feedUi.openAbs.add(id);
      return 'render';
    },
    'feed-hide'(el) {
      const id = el.dataset.id;
      apply('feedState', { type: 'feed.hide', id }, 'feed: verborgen');
      toast('Verborgen', { label: 'Ongedaan maken', fn: () => apply('feedState', { type: 'feed.unhide', id }, 'feed: terug') });
    },
    'feed-save'(el) {
      const p = store.data.papers.items.find((x) => x.id === el.dataset.id);
      if (!p) return;
      const item = {
        key: `feed:${p.id}`,
        title: p.title,
        authors: p.authors || [],
        year: Number((p.date || '').slice(0, 4)) || null,
        venue: p.venue || '',
        doi: p.doi || null,
        url: p.url || null,
        arxiv: p.arxiv || null,
        abstract: p.abstract || '',
        abstract_source: p.source,
        labels: ['kandidaat'],
        labels_auto: [],
        topics: [],
        status: 'ongelezen',
        summary: '',
        relevance: '',
        notes: `Uit de feed (${(p.why || []).join(', ')}), bewaard ${fmt.date(new Date())}.`,
        reviewed: false,
        in_bib: false,
        added: localIso().slice(0, 10),
        cited_in: [],
      };
      apply('lit', { type: 'lit.add', item }, `literatuur + ${p.title}`);
      apply('feedState', { type: 'feed.save', id: p.id }, 'feed: bewaard');
      toast('Bewaard in Literatuur met label "kandidaat"');
    },
    'micro-read'(el) {
      const it = store.data.lit.items.find((x) => x.key === el.dataset.key);
      apply('lit', { type: 'lit.update', key: it.key, patch: { status: 'abstract gelezen' } }, `literatuur gelezen: ${it.title}`);
      toast('Abstract gelezen');
    },
    'micro-later'(el) {
      feedUi.later.add(el.dataset.id);
      sessionStorage.setItem('dash.later', JSON.stringify([...feedUi.later]));
      return 'render';
    },
    'micro-open-task'(el) {
      ui.expanded.add(el.dataset.id);
      ui.todoFilter = 'open';
      ui.todoChapter = '';
      ui.scrollTo = `#task-${el.dataset.id}`;
      ui.focusAfter = `[data-fk="sub-${el.dataset.id}"]`;
      location.hash = '#/todo';
    },
  },
};

