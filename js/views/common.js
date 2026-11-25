// Gedeelde stukken: taakkaarten, hoofdstukstatus, en de bijbehorende acties.
import { store, apply } from '../store.js';
import { esc, uid, localIso } from '../util.js';
import { icon, toast, openDialog } from '../ui.js';
import { units, chapterTitle, STATUSES } from '../model.js';

// UI-toestand die renders overleeft (niet opgeslagen in de repo).
export const ui = {
  expanded: new Set(),
  showDone: new Set(),
  focusAfter: null, // selector die na de render focus krijgt
};

export const todo = () => store.data.todo;
const findTask = (id) => todo().tasks.find((t) => t.id === id);

export function checkbox(checked, act, attrs, label) {
  return `<label class="chk"><input type="checkbox" ${checked ? 'checked' : ''} data-act="${act}" ${attrs} aria-label="${esc(label)}"><span class="box">${icon('check')}</span></label>`;
}

export function statusPill(status) {
  if (!status) return '';
  const slug = status.replace(/\s+/g, '-');
  return `<span class="status s-${slug}">${status === 'klaar' ? icon('check', 'st-ic') : '<span class="dot"></span>'}${esc(status)}</span>`;
}

export function meter(done, total, cls = '') {
  const pct = total ? Math.round((100 * done) / total) : 0;
  return `<span class="meter ${cls}" role="img" aria-label="${done} van ${total} af"><i style="width:${pct}%"></i></span>`;
}

export function taskCard(t, { showChapter = false } = {}) {
  const open = ui.expanded.has(t.id);
  const u = units(t);
  const hasSubs = (t.subtasks || []).length > 0;
  const tags = [
    t.monday ? `<span class="tag monday">${icon('cal')}maandag</span>` : '',
    t.discuss ? `<span class="tag discuss">${icon('chat')}bespreken</span>` : '',
    showChapter ? `<span class="tag">${esc(chapterTitle(todo(), t.chapter))}</span>` : '',
  ].join('');
  const body = open
    ? `<div class="task-body">
        ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
        ${hasSubs ? `<ul class="subs">${t.subtasks.map((s) => subRow(t, s)).join('')}</ul>` : ''}
        <form class="add-sub" data-form="sub-add" data-id="${t.id}">
          <input name="title" placeholder="Subtaak toevoegen…" autocomplete="off" data-fk="sub-${t.id}" enterkeyhint="done">
          <button class="btn sm iconbtn" aria-label="Subtaak toevoegen">${icon('plus')}</button>
        </form>
        <div class="task-foot">
          <button class="btn sm" data-act="task-flag" data-flag="monday" data-id="${t.id}" aria-pressed="${!!t.monday}">${icon('cal')}Maandag</button>
          <button class="btn sm" data-act="task-flag" data-flag="discuss" data-id="${t.id}" aria-pressed="${!!t.discuss}">${icon('chat')}Bespreken</button>
          <span class="spacer"></span>
          <button class="btn sm iconbtn ghost" data-act="task-move" data-dir="-1" data-id="${t.id}" aria-label="Omhoog">${icon('up')}</button>
          <button class="btn sm iconbtn ghost" data-act="task-move" data-dir="1" data-id="${t.id}" aria-label="Omlaag">${icon('down')}</button>
          <button class="btn sm" data-act="task-edit" data-id="${t.id}">${icon('edit')}Bewerk</button>
        </div>
      </div>`
    : '';
  return `<article class="task ${t.done ? 'done' : ''} ${open ? 'open' : ''}" id="task-${t.id}">
    <div class="task-row">
      ${checkbox(t.done, 'task-done', `data-id="${t.id}"`, `Afvinken: ${t.title}`)}
      <button class="task-title" data-act="task-expand" data-id="${t.id}" aria-expanded="${open}">
        <span class="tt">${esc(t.title)}</span>
        ${tags ? `<span class="tags">${tags}</span>` : ''}
      </button>
      ${hasSubs ? `<span class="count">${u.done}/${u.total}</span>` : ''}
      <span class="chev" aria-hidden="true">${icon(open ? 'up' : 'down')}</span>
    </div>
    ${hasSubs && !open ? `<div class="task-bar">${meter(u.done, u.total, 'thin')}</div>` : ''}
    ${body}
  </article>`;
}

function subRow(t, s) {
  return `<li class="sub ${s.done ? 'done' : ''}">
    ${checkbox(s.done, 'sub-done', `data-task="${t.id}" data-sub="${s.id}"`, `Afvinken: ${s.title}`)}
    <span class="st">${esc(s.title)}</span>
    <button class="btn sm iconbtn ghost" data-act="sub-menu" data-task="${t.id}" data-sub="${s.id}" aria-label="Subtaak bewerken">${icon('dots')}</button>
  </li>`;
}

export function chapterOptions(selected) {
  return todo()
    .chapters.map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.title)}</option>`)
    .join('');
}

function setDone(t, done) {
  const at = localIso();
  const before = (t.subtasks || []).map((s) => ({ ...s }));
  apply('todo', { type: 'task.done', id: t.id, done, at }, `${done ? '✓' : '↺'} ${t.title}`);
  if (done) {
    toast('Afgevinkt', {
      label: 'Ongedaan maken',
      fn: () => apply('todo', { type: 'task.update', id: t.id, patch: { done: false, doneAt: null, subtasks: before } }, `↺ ${t.title}`),
    });
  }
}

export function addTask({ title, chapter, monday = false, discuss = false }) {
  const task = { id: uid(), title, notes: '', chapter, created: localIso(), done: false, doneAt: null, monday, discuss, subtasks: [] };
  apply('todo', { type: 'task.add', task }, `+ ${title}`);
  return task;
}

export function editTaskDialog(t) {
  openDialog(
    `<h2>Taak bewerken</h2>
     <label class="field">Titel<input name="title" value="${esc(t.title)}" required></label>
     <label class="field">Hoofdstuk<select name="chapter">${chapterOptions(t.chapter)}</select></label>
     <label class="field">Notities<textarea name="notes" rows="6">${esc(t.notes || '')}</textarea></label>
     <div class="row-checks">
       <label class="inline"><input type="checkbox" name="monday" ${t.monday ? 'checked' : ''}> Voor maandag</label>
       <label class="inline"><input type="checkbox" name="discuss" ${t.discuss ? 'checked' : ''}> Bespreekpunt</label>
     </div>
     <div class="dlg-actions">
       <button class="btn danger" value="delete" formnovalidate>${icon('trash')}Verwijder</button>
       <span class="spacer"></span>
       <button class="btn" value="cancel" formnovalidate>Annuleren</button>
       <button class="btn primary" value="ok">Opslaan</button>
     </div>`,
    {
      onSubmit(fd, v) {
        if (v === 'delete') {
          if (!confirm(`"${t.title}" verwijderen?`)) return false;
          const copy = JSON.parse(JSON.stringify(t));
          apply('todo', { type: 'task.delete', id: t.id }, `− ${t.title}`);
          toast('Taak verwijderd', { label: 'Terugzetten', fn: () => apply('todo', { type: 'task.add', task: copy }, `+ ${copy.title}`) });
          return;
        }
        const patch = {
          title: fd.get('title').trim(),
          chapter: fd.get('chapter'),
          notes: fd.get('notes'),
          monday: fd.has('monday'),
          discuss: fd.has('discuss'),
        };
        apply('todo', { type: 'task.update', id: t.id, patch }, `✎ ${patch.title}`);
      },
    },
  );
}

function subDialog(t, s) {
  openDialog(
    `<h2>Subtaak</h2>
     <p class="dlg-sub">${esc(t.title)}</p>
     <label class="field">Titel<input name="title" value="${esc(s.title)}" required></label>
     <div class="dlg-actions">
       <button class="btn danger" value="delete" formnovalidate>${icon('trash')}Verwijder</button>
       <button class="btn iconbtn" value="up" formnovalidate aria-label="Omhoog">${icon('up')}</button>
       <button class="btn iconbtn" value="down" formnovalidate aria-label="Omlaag">${icon('down')}</button>
       <span class="spacer"></span>
       <button class="btn" value="cancel" formnovalidate>Annuleren</button>
       <button class="btn primary" value="ok">Opslaan</button>
     </div>`,
    {
      onSubmit(fd, v) {
        if (v === 'delete') {
          apply('todo', { type: 'sub.delete', taskId: t.id, subId: s.id }, `− ${s.title}`);
        } else if (v === 'up' || v === 'down') {
          apply('todo', { type: 'sub.move', taskId: t.id, subId: s.id, dir: v === 'up' ? -1 : 1 }, `↕ ${s.title}`);
          return false;
        } else {
          const title = fd.get('title').trim();
          if (title && title !== s.title) apply('todo', { type: 'sub.update', taskId: t.id, subId: s.id, patch: { title } }, `✎ ${title}`);
        }
      },
    },
  );
}

export function chapterDialog(c) {
  openDialog(
    `<h2>${esc(c.title)}</h2>
     <fieldset class="radios"><legend>Status</legend>
       ${STATUSES.map((s) => `<label class="radio"><input type="radio" name="status" value="${s}" ${c.status === s ? 'checked' : ''}>${statusPill(s)}</label>`).join('')}
     </fieldset>
     <label class="field">Notitie<textarea name="note" rows="3">${esc(c.note || '')}</textarea></label>
     <div class="dlg-actions"><span class="spacer"></span>
       <button class="btn" value="cancel" formnovalidate>Annuleren</button>
       <button class="btn primary" value="ok">Opslaan</button>
     </div>`,
    {
      onSubmit(fd) {
        const patch = { note: fd.get('note') };
        if (c.status !== null) patch.status = fd.get('status') || c.status;
        apply('todo', { type: 'chapter.update', id: c.id, patch }, `${c.title}: ${patch.status || 'notitie'}`);
      },
    },
  );
}

export const actions = {
  'task-done'(el) {
    const t = findTask(el.dataset.id);
    if (!t) return;
    const done = el.checked;
    const openSubs = (t.subtasks || []).filter((s) => !s.done).length;
    if (done && openSubs > 1 && !confirm(`Ook de ${openSubs} open subtaken afvinken?`)) {
      el.checked = false;
      return;
    }
    setDone(t, done);
  },
  'sub-done'(el) {
    const t = findTask(el.dataset.task);
    const s = t?.subtasks.find((x) => x.id === el.dataset.sub);
    if (!s) return;
    const done = el.checked;
    apply('todo', { type: 'sub.done', taskId: t.id, subId: s.id, done, at: localIso() }, `${done ? '✓' : '↺'} ${s.title}`);
    if (done) {
      const undo = { label: 'Ongedaan maken', fn: () => apply('todo', { type: 'sub.done', taskId: t.id, subId: s.id, done: false, at: localIso() }, `↺ ${s.title}`) };
      toast(t.done ? `Hele taak af: ${t.title}` : 'Afgevinkt', undo);
    }
  },
  'task-expand'(el) {
    const id = el.dataset.id;
    if (ui.expanded.has(id)) ui.expanded.delete(id);
    else ui.expanded.add(id);
    return 'render';
  },
  'task-flag'(el) {
    const t = findTask(el.dataset.id);
    const f = el.dataset.flag;
    apply('todo', { type: 'task.update', id: t.id, patch: { [f]: !t[f] } }, `${f === 'monday' ? 'maandag' : 'bespreken'} ${t[f] ? '−' : '+'} ${t.title}`);
  },
  'task-move'(el) {
    const t = findTask(el.dataset.id);
    apply('todo', { type: 'task.move', id: t.id, dir: Number(el.dataset.dir) }, `↕ ${t.title}`);
  },
  'task-edit'(el) {
    editTaskDialog(findTask(el.dataset.id));
  },
  'sub-menu'(el) {
    const t = findTask(el.dataset.task);
    subDialog(t, t.subtasks.find((s) => s.id === el.dataset.sub));
  },
  'chapter-edit'(el) {
    chapterDialog(todo().chapters.find((c) => c.id === el.dataset.id));
  },
  'form:sub-add'(form) {
    const input = form.elements.title;
    const title = input.value.trim();
    if (!title) return;
    const sub = { id: uid(), title, done: false, doneAt: null };
    input.value = '';
    ui.focusAfter = `[data-fk="sub-${form.dataset.id}"]`;
    apply('todo', { type: 'sub.add', taskId: form.dataset.id, sub }, `+ ${title}`);
  },
};
