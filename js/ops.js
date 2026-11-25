// Alle wijzigingen zijn kleine, herhaalbare operaties. Ze worden lokaal direct toegepast,
// in een wachtrij bewaard (ook als je offline bent of de tab sluit) en bij een conflict
// opnieuw toegepast op de nieuwste versie van het bestand.

const findTask = (d, id) => d.tasks.find((t) => t.id === id);
const findSub = (t, id) => t?.subtasks?.find((s) => s.id === id);

function syncParent(t, at) {
  if (!t.subtasks?.length) return;
  const all = t.subtasks.every((s) => s.done);
  if (all && !t.done) {
    t.done = true;
    t.doneAt = at;
  } else if (!all && t.done) {
    t.done = false;
    t.doneAt = null;
  }
}

export const reducers = {
  // ---- todo.json
  'task.add': (d, o) => {
    if (!findTask(d, o.task.id)) d.tasks.push(o.task);
  },
  'task.update': (d, o) => {
    const t = findTask(d, o.id);
    if (t) Object.assign(t, o.patch);
  },
  'task.done': (d, o) => {
    const t = findTask(d, o.id);
    if (!t) return;
    t.done = o.done;
    t.doneAt = o.done ? o.at : null;
    if (o.done) for (const s of t.subtasks || []) if (!s.done) Object.assign(s, { done: true, doneAt: o.at });
  },
  'task.delete': (d, o) => {
    d.tasks = d.tasks.filter((t) => t.id !== o.id);
  },
  'task.move': (d, o) => {
    const i = d.tasks.findIndex((t) => t.id === o.id);
    if (i < 0) return;
    const ch = d.tasks[i].chapter;
    let j = i + o.dir;
    while (j >= 0 && j < d.tasks.length && d.tasks[j].chapter !== ch) j += o.dir;
    if (j < 0 || j >= d.tasks.length) return;
    [d.tasks[i], d.tasks[j]] = [d.tasks[j], d.tasks[i]];
  },
  'sub.add': (d, o) => {
    const t = findTask(d, o.taskId);
    if (!t || findSub(t, o.sub.id)) return;
    (t.subtasks ||= []).push(o.sub);
    if (t.done) Object.assign(t, { done: false, doneAt: null });
  },
  'sub.done': (d, o) => {
    const t = findTask(d, o.taskId);
    const s = findSub(t, o.subId);
    if (!s) return;
    s.done = o.done;
    s.doneAt = o.done ? o.at : null;
    syncParent(t, o.at);
  },
  'sub.update': (d, o) => {
    const s = findSub(findTask(d, o.taskId), o.subId);
    if (s) Object.assign(s, o.patch);
  },
  'sub.delete': (d, o) => {
    const t = findTask(d, o.taskId);
    if (!t) return;
    t.subtasks = t.subtasks.filter((s) => s.id !== o.subId);
  },
  'sub.move': (d, o) => {
    const t = findTask(d, o.taskId);
    if (!t) return;
    const i = t.subtasks.findIndex((s) => s.id === o.subId);
    const j = i + o.dir;
    if (i < 0 || j < 0 || j >= t.subtasks.length) return;
    [t.subtasks[i], t.subtasks[j]] = [t.subtasks[j], t.subtasks[i]];
  },
  'chapter.update': (d, o) => {
    const c = d.chapters.find((x) => x.id === o.id);
    if (c) Object.assign(c, o.patch);
  },
  'settings.update': (d, o) => {
    d.settings = { ...(d.settings || {}), ...o.patch };
  },
  'meeting.close': (d, o) => {
    d.meetings ||= [];
    if (d.meetings.some((m) => m.id === o.meeting.id)) return;
    d.meetings.push(o.meeting);
    for (const t of d.tasks) if (t.monday && t.done) t.monday = false;
  },
  'meeting.update': (d, o) => {
    const m = (d.meetings || []).find((x) => x.id === o.id);
    if (m) Object.assign(m, o.patch);
  },
  'meeting.delete': (d, o) => {
    d.meetings = (d.meetings || []).filter((x) => x.id !== o.id);
  },

  // ---- literature.json
  'lit.update': (d, o) => {
    const it = d.items.find((x) => x.key === o.key);
    if (it) Object.assign(it, o.patch);
  },
  'lit.add': (d, o) => {
    if (!d.items.some((x) => x.key === o.item.key)) d.items.unshift(o.item);
  },
  'lit.delete': (d, o) => {
    d.items = d.items.filter((x) => x.key !== o.key || x.in_bib);
  },

  // ---- feed/state.json
  'feed.hide': (d, o) => {
    if (!d.hidden.includes(o.id)) d.hidden.push(o.id);
  },
  'feed.unhide': (d, o) => {
    d.hidden = d.hidden.filter((x) => x !== o.id);
  },
  'feed.save': (d, o) => {
    if (!d.saved.includes(o.id)) d.saved.push(o.id);
  },
};

export const DEFAULTS = {
  todo: () => ({ version: 1, settings: { meetingWeekday: 1 }, chapters: [], tasks: [], meetings: [] }),
  lit: () => ({ items: [] }),
  papers: () => ({ items: [] }),
  feedState: () => ({ hidden: [], saved: [] }),
};
