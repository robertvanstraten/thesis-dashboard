// Afgeleide cijfers: voortgang, meetingdata, wat er gedaan is.
import { parseLocal, startOfDay, addDays, ymd } from './util.js';

export const STATUSES = ['niet begonnen', 'opzet', 'concept', 'feedback', 'klaar'];
export const LIT_STATUSES = ['ongelezen', 'abstract gelezen', 'gelezen'];
export const DEFAULT_LABELS = ['proposal', 'thesis', 'literatuurstudie'];

// Een taak met subtaken telt per subtaak; zonder subtaken telt de taak zelf als één.
export function units(t) {
  const n = t.subtasks?.length || 0;
  if (!n) return { total: 1, done: t.done ? 1 : 0 };
  return { total: n, done: t.subtasks.filter((s) => s.done).length };
}

export function overall(todo) {
  let total = 0;
  let done = 0;
  for (const t of todo.tasks) {
    const u = units(t);
    total += u.total;
    done += u.done;
  }
  return { total, done };
}

export function chapterStats(todo) {
  const m = new Map(todo.chapters.map((c) => [c.id, { total: 0, done: 0, open: 0, tasks: 0 }]));
  for (const t of todo.tasks) {
    if (!m.has(t.chapter)) m.set(t.chapter, { total: 0, done: 0, open: 0, tasks: 0 });
    const s = m.get(t.chapter);
    const u = units(t);
    s.total += u.total;
    s.done += u.done;
    s.tasks++;
    if (!t.done) s.open++;
  }
  return m;
}

export const chapterTitle = (todo, id) => todo.chapters.find((c) => c.id === id)?.title || 'Algemeen';

export function lastMeeting(todo) {
  const ms = [...(todo.meetings || [])].sort((a, b) => (a.closedAt || a.date).localeCompare(b.closedAt || b.date));
  return ms.at(-1) || null;
}

export function nextMeeting(todo, now = new Date()) {
  const wd = todo.settings?.meetingWeekday ?? 1;
  const today = startOfDay(now);
  const heldToday = (todo.meetings || []).some((m) => m.date === ymd(today));
  let delta = (wd - today.getDay() + 7) % 7;
  if (delta === 0 && heldToday) delta = 7;
  return addDays(today, delta);
}

// Referentiepunt voor "gedaan sinds": de vorige afgeronde meeting, anders de laatste 14 dagen.
export function sinceRef(todo, now = new Date()) {
  const lm = lastMeeting(todo);
  if (lm) return { date: parseLocal(lm.closedAt || lm.date), label: 'sinds de vorige meeting', meeting: lm };
  return { date: addDays(startOfDay(now), -14), label: 'in de afgelopen 14 dagen', meeting: null };
}

// [{ task, whole, subs, at }]: hele taken die af zijn, of losse subtaken die af zijn.
export function doneSince(todo, since) {
  const out = [];
  for (const t of todo.tasks) {
    const tAt = t.done && t.doneAt ? parseLocal(t.doneAt) : null;
    const subs = (t.subtasks || []).filter((s) => s.done && s.doneAt && parseLocal(s.doneAt) >= since);
    if (tAt && tAt >= since) out.push({ task: t, whole: true, subs, at: tAt });
    else if (subs.length) out.push({ task: t, whole: false, subs, at: new Date(Math.max(...subs.map((s) => parseLocal(s.doneAt)))) });
  }
  return out.sort((a, b) => b.at - a.at);
}

// Alle afvink-momenten (voor de activiteitenfeed).
export function doneEvents(todo) {
  const ev = [];
  for (const t of todo.tasks) {
    if (t.done && t.doneAt) ev.push({ kind: 'task', task: t, at: parseLocal(t.doneAt) });
    for (const s of t.subtasks || []) if (s.done && s.doneAt && !(t.done && t.doneAt === s.doneAt)) ev.push({ kind: 'sub', task: t, sub: s, at: parseLocal(s.doneAt) });
  }
  return ev;
}

export function nextUp(todo) {
  const open = todo.tasks.filter((t) => !t.done);
  const order = [...open.filter((t) => t.monday), ...open.filter((t) => !t.monday)];
  for (const t of order) {
    const sub = (t.subtasks || []).find((s) => !s.done);
    if (sub) return { task: t, sub };
    if (!t.subtasks?.length) return { task: t, sub: null };
  }
  return null;
}

export function allLabels(lit) {
  const set = new Set(DEFAULT_LABELS);
  for (const it of lit.items) for (const l of [...(it.labels_auto || []), ...(it.labels || [])]) set.add(l);
  return [...set];
}

export function allTopics(lit) {
  const set = new Set();
  for (const it of lit.items) for (const t of it.topics || []) set.add(t);
  return [...set].sort();
}
