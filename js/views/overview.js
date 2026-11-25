// Overzicht: totale voortgang, kerncijfers, volgende stap, voortgang per hoofdstuk.
import { store } from '../store.js';
import { esc, fmt, relDay, ago, plural } from '../util.js';
import { icon } from '../ui.js';
import { overall, chapterStats, nextMeeting, sinceRef, doneSince, nextUp, doneEvents } from '../model.js';
import { checkbox, statusPill, meter } from './common.js';
import { newPaperCount } from './feed.js';

function tile(label, value, sub, href) {
  return `<a class="tile" href="${href}">
    <span class="tile-label">${esc(label)}</span>
    <span class="tile-value">${esc(value)}</span>
    ${sub ? `<span class="tile-sub">${esc(sub)}</span>` : ''}
  </a>`;
}

export const overviewView = {
  title: 'Overzicht',
  render() {
    const todo = store.data.todo;
    const lit = store.data.lit;
    const o = overall(todo);
    const pct = o.total ? Math.round((100 * o.done) / o.total) : 0;
    const nm = nextMeeting(todo);
    const ref = sinceRef(todo);
    const doneList = doneSince(todo, ref.date);
    const mondayOpen = todo.tasks.filter((t) => t.monday && !t.done);
    const litChecked = lit.items.filter((x) => x.reviewed).length;
    const nx = nextUp(todo);
    const stats = chapterStats(todo);
    const recent = doneEvents(todo).sort((a, b) => b.at - a.at).slice(0, 5);

    const nextCard = nx
      ? `<section class="card next">
          <div class="eyebrow">${icon('spark')}Volgende stap${nx.task.monday ? ' · voor maandag' : ''}</div>
          <div class="next-row">
            ${nx.sub ? checkbox(false, 'sub-done', `data-task="${nx.task.id}" data-sub="${nx.sub.id}"`, `Afvinken: ${nx.sub.title}`) : checkbox(false, 'task-done', `data-id="${nx.task.id}"`, `Afvinken: ${nx.task.title}`)}
            <div><div class="next-title">${esc(nx.sub ? nx.sub.title : nx.task.title)}</div>
            ${nx.sub ? `<div class="next-from">uit: ${esc(nx.task.title)}</div>` : ''}</div>
          </div>
        </section>`
      : `<section class="card next"><div class="eyebrow">Volgende stap</div><p class="muted">Alles is af. Tijd voor iets nieuws op de <a href="#/todo">to-do</a>.</p></section>`;

    const rows = todo.chapters
      .filter((c) => c.status !== null || stats.get(c.id)?.tasks)
      .map((c) => {
        const s = stats.get(c.id) || { total: 0, done: 0 };
        return `<button class="ch-row" data-act="chapter-edit" data-id="${esc(c.id)}">
          <span class="ch-name">${esc(c.title)}</span>
          <span class="ch-status">${statusPill(c.status)}</span>
          <span class="ch-meter">${s.total ? meter(s.done, s.total) : '<span class="muted small">geen taken</span>'}</span>
          <span class="ch-num">${s.total ? `${s.done}/${s.total}` : ''}</span>
        </button>`;
      })
      .join('');

    return `
      <section class="hero">
        <div class="hero-label">Afgevinkt</div>
        <div class="hero-num">${pct}%</div>
        <div class="hero-sub">${o.done} van ${o.total} taken en subtaken</div>
        ${meter(o.done, o.total, 'big')}
      </section>

      <section class="tiles">
        ${tile('Volgende meeting', fmt.short(nm), relDay(nm), '#/maandag')}
        ${tile('Gedaan', String(doneList.length), ref.meeting ? 'sinds vorige meeting' : 'laatste 14 dagen', '#/maandag')}
        ${tile('Voor maandag', String(mondayOpen.length), plural(todo.tasks.filter((t) => t.discuss && !t.done).length, 'bespreekpunt', 'bespreekpunten'), '#/maandag')}
        ${tile('Lit. gecheckt', `${litChecked}/${lit.items.length}`, `${lit.items.filter((x) => x.status !== 'ongelezen').length} gelezen`, '#/literatuur')}
        ${tile('Nieuw in feed', String(newPaperCount()), 'papers', '#/feed')}
      </section>

      ${nextCard}

      <h2 class="sec">Per hoofdstuk <span class="sec-hint">tik om de status te wijzigen</span></h2>
      <section class="card ch-list">${rows}</section>

      <h2 class="sec">Recent afgevinkt <a class="sec-link" href="#/feed">alles</a></h2>
      <section class="card list">
        ${
          recent.length
            ? recent
                .map(
                  (e) => `<div class="li">${icon('check', 'ok')}<span class="li-main">${esc(e.kind === 'sub' ? e.sub.title : e.task.title)}${e.kind === 'sub' ? `<span class="li-from"> · ${esc(e.task.title)}</span>` : ''}</span><span class="li-when">${esc(ago(e.at))}</span></div>`,
                )
                .join('')
            : '<p class="empty">Nog niks afgevinkt.</p>'
        }
      </section>`;
  },
};

