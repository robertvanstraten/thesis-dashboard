// To-do: taken met subtaken, gegroepeerd per hoofdstuk.
import { store } from '../store.js';
import { esc, parseLocal } from '../util.js';
import { icon } from '../ui.js';
import { ui, taskCard, chapterOptions, addTask } from './common.js';

const FILTERS = [
  ['open', 'Open'],
  ['monday', 'Voor maandag'],
  ['discuss', 'Bespreken'],
  ['all', 'Alles'],
  ['done', 'Gedaan'],
];
const match = {
  open: (t) => !t.done,
  monday: (t) => t.monday && !t.done,
  discuss: (t) => t.discuss && !t.done,
  all: () => true,
  done: (t) => t.done,
};

const lastChapter = () => localStorage.getItem('dash.lastChapter') || 'algemeen';

export const todoView = {
  title: 'To-do',
  render() {
    const todo = store.data.todo;
    const f = ui.todoFilter || 'open';
    const chf = ui.todoChapter || '';
    const groups = [...todo.chapters.map((c) => c.id), ...new Set(todo.tasks.map((t) => t.chapter))].filter((v, i, a) => a.indexOf(v) === i);

    const sections = groups
      .filter((g) => !chf || g === chf)
      .map((g) => {
        const all = todo.tasks.filter((t) => t.chapter === g);
        let shown = all.filter(match[f]);
        if (f === 'done') shown = shown.sort((a, b) => (parseLocal(b.doneAt) || 0) - (parseLocal(a.doneAt) || 0));
        if (f === 'all') shown = [...shown.filter((t) => !t.done), ...shown.filter((t) => t.done)];
        const doneHidden = f === 'open' ? all.filter((t) => t.done) : [];
        if (!shown.length && !doneHidden.length) return '';
        const title = todo.chapters.find((c) => c.id === g)?.title || g;
        const showDone = ui.showDone.has(g);
        return `<section class="group">
          <h2 class="sec">${esc(title)} <span class="sec-count">${shown.length}</span></h2>
          ${shown.map((t) => taskCard(t)).join('')}
          ${
            doneHidden.length
              ? `<button class="linkbtn" data-act="todo-showdone" data-g="${esc(g)}">${icon(showDone ? 'up' : 'down')}${doneHidden.length} gedaan</button>
                 ${showDone ? doneHidden.map((t) => taskCard(t)).join('') : ''}`
              : ''
          }
        </section>`;
      })
      .join('');

    return `
      <form class="card quick-add" data-form="task-add">
        <input name="title" placeholder="Nieuwe taak…" autocomplete="off" required data-fk="quick-add" enterkeyhint="done">
        <div class="qa-row">
          <select name="chapter" aria-label="Hoofdstuk">${chapterOptions(lastChapter())}</select>
          <label class="inline"><input type="checkbox" name="monday"> Maandag</label>
          <button class="btn primary">${icon('plus')}Toevoegen</button>
        </div>
      </form>
      <div class="filters">
        <div class="chips" role="group" aria-label="Filter">
          ${FILTERS.map(([v, l]) => `<button class="chip-btn" data-act="todo-filter" data-v="${v}" aria-pressed="${f === v}">${l}</button>`).join('')}
        </div>
        <select class="chapter-filter" data-act="todo-chapter" aria-label="Hoofdstuk filteren">
          <option value="">Alle hoofdstukken</option>${todo.chapters.map((c) => `<option value="${esc(c.id)}" ${chf === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}
        </select>
      </div>
      ${sections || '<p class="empty">Niets in deze selectie.</p>'}`;
  },
  actions: {
    'todo-filter'(el) {
      ui.todoFilter = el.dataset.v;
      return 'render';
    },
    'todo-chapter'(el) {
      ui.todoChapter = el.value;
      return 'render';
    },
    'todo-showdone'(el) {
      const g = el.dataset.g;
      if (ui.showDone.has(g)) ui.showDone.delete(g);
      else ui.showDone.add(g);
      return 'render';
    },
    'form:task-add'(form) {
      const title = form.elements.title.value.trim();
      if (!title) return;
      const chapter = form.elements.chapter?.value || 'algemeen';
      if (form.elements.chapter?.tagName === 'SELECT') localStorage.setItem('dash.lastChapter', chapter);
      const monday = form.elements.monday?.checked || form.dataset.monday === '1';
      const discuss = form.dataset.discuss === '1';
      form.elements.title.value = '';
      ui.focusAfter = `[data-fk="${form.elements.title.dataset.fk}"]`;
      addTask({ title, chapter, monday, discuss });
    },
  },
};
