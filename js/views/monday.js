// Maandag: wat er af is sinds de vorige meeting, wat er voor deze meeting ligt, bespreekpunten, archief.
import { store, apply } from '../store.js';
import { esc, fmt, relDay, ymd, uid, localIso, parseLocal } from '../util.js';
import { icon, toast, openDialog, copyText } from '../ui.js';
import { nextMeeting, sinceRef, doneSince, chapterTitle, units } from '../model.js';
import { taskCard } from './common.js';

function doneItemText(d) {
  if (d.whole) return d.task.title;
  return `${d.task.title}: ${d.subs.map((s) => s.title).join('; ')}`;
}

function progressText(t) {
  const u = units(t);
  return t.subtasks?.length ? ` (${u.done}/${u.total})` : '';
}

function summary(todo) {
  const nm = nextMeeting(todo);
  const ref = sinceRef(todo);
  const done = doneSince(todo, ref.date);
  const agenda = todo.tasks.filter((t) => t.monday && !t.done && !t.discuss);
  const discuss = todo.tasks.filter((t) => t.discuss && !t.done);
  return { nm, ref, done, agenda, discuss };
}

function asText(todo) {
  const { nm, ref, done, agenda, discuss } = summary(todo);
  const lines = [`${todo.settings?.meetingLabel || 'Scriptiemeeting'} ${fmt.long(nm)}`, ''];
  lines.push(`Gedaan ${ref.meeting ? `sinds ${fmt.dm(parseLocal(ref.meeting.date))}` : ref.label}:`);
  lines.push(...(done.length ? done.map((d) => `- ${doneItemText(d)}`) : ['- (niets afgevinkt)']));
  lines.push('', 'Bezig met / voor deze meeting:');
  lines.push(...(agenda.length ? agenda.map((t) => `- ${t.title}${progressText(t)}`) : ['- (niets gemarkeerd)']));
  if (discuss.length) lines.push('', 'Bespreekpunten:', ...discuss.map((t) => `- ${t.title}${t.notes ? ` — ${t.notes.split('\n')[0]}` : ''}`));
  return lines.join('\n');
}

function closeMeetingDialog(todo) {
  const { done, agenda, discuss } = summary(todo);
  const today = ymd();
  openDialog(
    `<h2>Meeting afronden</h2>
     <p class="dlg-sub">Legt vast wat er gedaan was (${done.length}), wat er op de agenda stond (${agenda.length}) en de bespreekpunten (${discuss.length}). Afgevinkte maandag-taken gaan van de lijst; "gedaan sinds" begint opnieuw te tellen.</p>
     <label class="field">Datum<input type="date" name="date" value="${today}" required></label>
     <label class="field">Aantekeningen<textarea name="notes" rows="8" placeholder="Besproken:\n- …\n\nAfspraken / feedback:\n- …"></textarea></label>
     <div class="dlg-actions"><span class="spacer"></span>
       <button class="btn" value="cancel" formnovalidate>Annuleren</button>
       <button class="btn primary" value="ok">Afronden</button>
     </div>`,
    {
      onSubmit(fd) {
        const meeting = {
          id: uid(),
          date: fd.get('date'),
          closedAt: localIso(),
          notes: fd.get('notes'),
          done: done.map(doneItemText),
          agenda: agenda.map((t) => t.title + progressText(t)),
          discussed: discuss.map((t) => t.title),
        };
        apply('todo', { type: 'meeting.close', meeting }, `meeting ${meeting.date} afgerond`);
        toast('Meeting vastgelegd');
      },
    },
  );
}

function editMeetingDialog(m) {
  openDialog(
    `<h2>Meeting ${esc(fmt.long(parseLocal(m.date)))}</h2>
     <label class="field">Aantekeningen<textarea name="notes" rows="10">${esc(m.notes || '')}</textarea></label>
     <div class="dlg-actions">
       <button class="btn danger" value="delete" formnovalidate>${icon('trash')}Verwijder</button>
       <span class="spacer"></span>
       <button class="btn" value="cancel" formnovalidate>Annuleren</button>
       <button class="btn primary" value="ok">Opslaan</button>
     </div>`,
    {
      onSubmit(fd, v) {
        if (v === 'delete') {
          if (!confirm('Deze meeting uit het archief verwijderen?')) return false;
          apply('todo', { type: 'meeting.delete', id: m.id }, `meeting ${m.date} verwijderd`);
          return;
        }
        apply('todo', { type: 'meeting.update', id: m.id, patch: { notes: fd.get('notes') } }, `notities meeting ${m.date}`);
      },
    },
  );
}

export const mondayView = {
  title: 'Maandag',
  render() {
    const todo = store.data.todo;
    const { nm, ref, done, agenda, discuss } = summary(todo);
    const meetings = [...(todo.meetings || [])].sort((a, b) => b.date.localeCompare(a.date));
    const sinceLabel = ref.meeting ? `sinds ${fmt.dm(parseLocal(ref.meeting.date))}` : ref.label;

    return `
      <section class="meet-hero card">
        <div class="eyebrow">${icon('cal')}${esc(todo.settings?.meetingLabel || 'Scriptiemeeting')}</div>
        <div class="meet-date">${esc(fmt.long(nm))}</div>
        <div class="meet-rel">${esc(relDay(nm))}</div>
        <div class="meet-actions">
          <button class="btn" data-act="meeting-copy">${icon('copy')}Kopieer als tekst</button>
          <button class="btn primary" data-act="meeting-close">${icon('check')}Meeting afronden</button>
        </div>
      </section>

      <h2 class="sec">Gedaan ${esc(sinceLabel)} <span class="sec-count">${done.length}</span></h2>
      <section class="card list">
        ${
          done.length
            ? done
                .map(
                  (d) => `<div class="li">${icon('check', 'ok')}
                    <span class="li-main">${esc(d.task.title)}
                      ${!d.whole ? `<span class="li-subs">${d.subs.map((s) => esc(s.title)).join(' · ')}</span>` : ''}
                      <span class="li-from">${esc(chapterTitle(todo, d.task.chapter))}${!d.whole ? ` · ${d.subs.length} subta${d.subs.length === 1 ? 'ak' : 'ken'}` : ''}</span>
                    </span>
                    <span class="li-when">${esc(fmt.short(d.at))}</span></div>`,
                )
                .join('')
            : '<p class="empty">Nog niks afgevinkt sinds de vorige meeting.</p>'
        }
      </section>

      <h2 class="sec">Voor deze meeting <span class="sec-count">${agenda.length}</span></h2>
      ${agenda.map((t) => taskCard(t, { showChapter: true })).join('') || '<p class="empty small">Markeer taken met "Maandag" op de <a href="#/todo">to-do</a>.</p>'}

      <h2 class="sec">Bespreekpunten <span class="sec-count">${discuss.length}</span></h2>
      ${discuss.map((t) => taskCard(t, { showChapter: true })).join('')}
      <form class="card quick-add slim" data-form="task-add" data-discuss="1" data-monday="1">
        <input name="title" placeholder="Vraag of bespreekpunt toevoegen…" autocomplete="off" required data-fk="discuss-add" enterkeyhint="done">
        <input type="hidden" name="chapter" value="algemeen">
        <button class="btn iconbtn" aria-label="Toevoegen">${icon('plus')}</button>
      </form>

      ${
        meetings.length
          ? `<h2 class="sec">Eerdere meetings</h2>
             ${meetings
               .map(
                 (m) => `<details class="card meeting">
                   <summary><span>${esc(fmt.long(parseLocal(m.date)))}</span><span class="muted small">${m.done?.length || 0} gedaan</span></summary>
                   ${m.notes ? `<div class="notes">${esc(m.notes)}</div>` : '<p class="muted small">Geen aantekeningen.</p>'}
                   ${m.done?.length ? `<h4>Gedaan</h4><ul>${m.done.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
                   ${m.agenda?.length ? `<h4>Op de agenda</h4><ul>${m.agenda.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
                   ${m.discussed?.length ? `<h4>Bespreekpunten</h4><ul>${m.discussed.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
                   <button class="btn sm" data-act="meeting-edit" data-id="${m.id}">${icon('edit')}Aantekeningen bewerken</button>
                 </details>`,
               )
               .join('')}`
          : ''
      }`;
  },
  actions: {
    async 'meeting-copy'() {
      const ok = await copyText(asText(store.data.todo));
      toast(ok ? 'Gekopieerd, plak het in je mail of chat' : 'Kopiëren lukte niet');
    },
    'meeting-close'() {
      closeMeetingDialog(store.data.todo);
    },
    'meeting-edit'(el) {
      editMeetingDialog(store.data.todo.meetings.find((m) => m.id === el.dataset.id));
    },
  },
};
