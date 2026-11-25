// Literatuur: samenvattingen, labels (proposal/thesis/literatuurstudie/…), leesstatus.
import { store, apply } from '../store.js';
import { esc, safeUrl, authorsShort } from '../util.js';
import { icon, toast, openDialog } from '../ui.js';
import { LIT_STATUSES, allLabels, allTopics } from '../model.js';

export const litUi = { q: '', label: '', topic: '', status: '', unchecked: false, expanded: new Set() };

const shortVenue = (v) => (v && v.length > 64 ? `${v.slice(0, 62)}…` : v || '');

function haystack(it) {
  return [it.title, it.key, (it.authors || []).join(' '), it.summary, it.relevance, it.notes, it.abstract, it.venue, ...(it.labels || []), ...(it.topics || [])]
    .join(' ')
    .toLowerCase();
}

function paperCard(it) {
  const open = litUi.expanded.has(it.key);
  const url = safeUrl(it.url);
  const auto = (it.labels_auto || []).map((l) => `<span class="tag auto" title="Automatisch: geciteerd in ${esc(l)}">${esc(l)}</span>`);
  const manual = (it.labels || []).filter((l) => !(it.labels_auto || []).includes(l)).map((l) => `<span class="tag label">${esc(l)}</span>`);
  const topics = (it.topics || []).map((t) => `<span class="tag topic">${esc(t)}</span>`);
  const status = it.status && it.status !== 'ongelezen' ? `<span class="tag read">${icon('check')}${esc(it.status)}</span>` : '';
  const flag =
    it.summary && !it.reviewed
      ? `<div class="p-flag"><span>${it.summary_by === 'claude' ? 'Concept van Claude' : 'Nog niet gecheckt'}${it.summary_basis === 'kennis' ? ' · geen abstract gevonden, extra checken' : ''}</span>
          <button class="btn sm" data-act="lit-ok" data-key="${esc(it.key)}">${icon('check')}Klopt</button></div>`
      : '';
  const cited = (it.cited_in || []).filter((c) => c.text);
  const details = open
    ? `<div class="p-details">
        ${it.notes ? `<h4>Notities</h4><div class="notes">${esc(it.notes)}</div>` : ''}
        ${
          cited.length
            ? `<h4>Zo citeer je het</h4>${cited
                .map((c) => `<blockquote><span class="q-src">${esc(c.file)}${c.section ? ` · ${esc(c.section)}` : ''}</span>${esc(c.text)}</blockquote>`)
                .join('')}`
            : ''
        }
        ${it.abstract ? `<h4>Abstract <span class="muted small">(${esc(it.abstract_source || '')})</span></h4><p class="abs">${esc(it.abstract)}</p>` : '<p class="muted small">Geen abstract beschikbaar.</p>'}
        <p class="muted small">Bibkey: <code>${esc(it.key)}</code>${it.cited_by != null ? ` · ${it.cited_by}× geciteerd (OpenAlex)` : ''}</p>
      </div>`
    : '';
  return `<article class="card paper" id="lit-${esc(it.key)}">
    <h3 class="p-title">${esc(it.title)}</h3>
    <div class="p-meta">${esc(authorsShort(it.authors))}${it.year ? ` · ${it.year}` : ''}${it.venue ? ` · ${esc(shortVenue(it.venue))}` : ''}</div>
    <div class="tags">${[...auto, ...manual, status, ...topics].join('')}</div>
    ${it.summary ? `<p class="p-sum">${esc(it.summary)}</p>` : '<p class="p-sum muted">Nog geen samenvatting.</p>'}
    ${it.relevance ? `<p class="p-rel"><b>Voor jouw thesis:</b> ${esc(it.relevance)}</p>` : ''}
    ${flag}
    ${details}
    <div class="p-actions">
      <button class="btn sm" data-act="lit-expand" data-key="${esc(it.key)}" aria-expanded="${open}">${icon(open ? 'up' : 'down')}${open ? 'Minder' : 'Meer'}</button>
      <button class="btn sm" data-act="lit-edit" data-key="${esc(it.key)}">${icon('edit')}Bewerk</button>
      ${url ? `<a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('ext')}Open</a>` : ''}
    </div>
  </article>`;
}

export function editLitDialog(it) {
  const lit = store.data.lit;
  const labels = allLabels(lit);
  const autoSet = new Set(it.labels_auto || []);
  openDialog(
    `<h2>${esc(it.title)}</h2>
     <label class="field">Samenvatting<textarea name="summary" rows="5">${esc(it.summary || '')}</textarea></label>
     <label class="field">Voor jouw thesis<textarea name="relevance" rows="3">${esc(it.relevance || '')}</textarea></label>
     <label class="field">Notities<textarea name="notes" rows="3">${esc(it.notes || '')}</textarea></label>
     <fieldset class="checks"><legend>Labels</legend>
       ${labels
         .map((l) =>
           autoSet.has(l)
             ? `<label class="inline"><input type="checkbox" checked disabled> ${esc(l)} <span class="muted small">(auto)</span></label>`
             : `<label class="inline"><input type="checkbox" name="label" value="${esc(l)}" ${(it.labels || []).includes(l) ? 'checked' : ''}> ${esc(l)}</label>`,
         )
         .join('')}
       <input name="newLabel" placeholder="Nieuw label (bv. intro, methode, kandidaat)" autocomplete="off">
     </fieldset>
     <label class="field">Onderwerpen <span class="muted small">(komma-gescheiden)</span><input name="topics" value="${esc((it.topics || []).join(', '))}"></label>
     <div class="row-checks">
       <label class="field">Leesstatus<select name="status">${LIT_STATUSES.map((s) => `<option ${it.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
       <label class="inline"><input type="checkbox" name="reviewed" ${it.reviewed ? 'checked' : ''}> Samenvatting gecheckt</label>
     </div>
     <div class="dlg-actions">
       ${!it.in_bib ? `<button class="btn danger" value="delete" formnovalidate>${icon('trash')}Verwijder</button>` : ''}
       <span class="spacer"></span>
       <button class="btn" value="cancel" formnovalidate>Annuleren</button>
       <button class="btn primary" value="ok">Opslaan</button>
     </div>`,
    {
      onSubmit(fd, v) {
        if (v === 'delete') {
          apply('lit', { type: 'lit.delete', key: it.key }, `literatuur − ${it.title}`);
          return;
        }
        const newLabels = String(fd.get('newLabel') || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const patch = {
          summary: fd.get('summary'),
          relevance: fd.get('relevance'),
          notes: fd.get('notes'),
          labels: [...new Set([...fd.getAll('label'), ...newLabels])],
          topics: String(fd.get('topics') || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          status: fd.get('status'),
          reviewed: fd.has('reviewed'),
        };
        if (patch.summary !== it.summary && it.summary_by === 'claude') patch.summary_by = 'eigen';
        apply('lit', { type: 'lit.update', key: it.key, patch }, `literatuur ✎ ${it.title}`);
      },
    },
  );
}

export const litView = {
  title: 'Literatuur',
  render() {
    const lit = store.data.lit;
    const q = litUi.q.trim().toLowerCase();
    const items = lit.items.filter(
      (it) =>
        (!q || q.split(/\s+/).every((w) => haystack(it).includes(w))) &&
        (!litUi.label || [...(it.labels_auto || []), ...(it.labels || [])].includes(litUi.label)) &&
        (!litUi.topic || (it.topics || []).includes(litUi.topic)) &&
        (!litUi.status || (it.status || 'ongelezen') === litUi.status) &&
        (!litUi.unchecked || (it.summary && !it.reviewed)),
    );
    const labels = allLabels(lit);
    const count = (l) => lit.items.filter((it) => [...(it.labels_auto || []), ...(it.labels || [])].includes(l)).length;
    const checked = lit.items.filter((x) => x.reviewed).length;
    return `
      <div class="lit-tools">
        <label class="search">${icon('search')}<input type="search" placeholder="Zoek in titels, samenvattingen, notities…" value="${esc(litUi.q)}" data-input="lit-q" data-fk="lit-q" autocomplete="off"></label>
        <div class="chips" role="group" aria-label="Label">
          <button class="chip-btn" data-act="lit-label" data-v="" aria-pressed="${!litUi.label}">Alle <span class="n">${lit.items.length}</span></button>
          ${labels.map((l) => `<button class="chip-btn" data-act="lit-label" data-v="${esc(l)}" aria-pressed="${litUi.label === l}">${esc(l)} <span class="n">${count(l)}</span></button>`).join('')}
        </div>
        <div class="lit-row">
          <select data-act="lit-topic" aria-label="Onderwerp"><option value="">Alle onderwerpen</option>${allTopics(lit).map((t) => `<option ${litUi.topic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <select data-act="lit-status" aria-label="Leesstatus"><option value="">Elke leesstatus</option>${LIT_STATUSES.map((s) => `<option ${litUi.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="chip-btn" data-act="lit-unchecked" aria-pressed="${litUi.unchecked}">Nog checken <span class="n">${lit.items.length - checked}</span></button>
        </div>
      </div>
      <p class="result-count">${items.length} van ${lit.items.length} papers${lit.updated ? ` · bib gesynchroniseerd ${esc(lit.updated)}` : ''}</p>
      ${items.map(paperCard).join('') || '<p class="empty">Geen papers in deze selectie.</p>'}`;
  },
  actions: {
    'lit-q'(el) {
      litUi.q = el.value;
      return 'render';
    },
    'lit-label'(el) {
      litUi.label = el.dataset.v;
      return 'render';
    },
    'lit-topic'(el) {
      litUi.topic = el.value;
      return 'render';
    },
    'lit-status'(el) {
      litUi.status = el.value;
      return 'render';
    },
    'lit-unchecked'() {
      litUi.unchecked = !litUi.unchecked;
      return 'render';
    },
    'lit-expand'(el) {
      const k = el.dataset.key;
      if (litUi.expanded.has(k)) litUi.expanded.delete(k);
      else litUi.expanded.add(k);
      return 'render';
    },
    'lit-edit'(el) {
      editLitDialog(store.data.lit.items.find((x) => x.key === el.dataset.key));
    },
    'lit-ok'(el) {
      const it = store.data.lit.items.find((x) => x.key === el.dataset.key);
      apply('lit', { type: 'lit.update', key: it.key, patch: { reviewed: true } }, `literatuur ✓ ${it.title}`);
      toast('Gemarkeerd als gecheckt', { label: 'Ongedaan maken', fn: () => apply('lit', { type: 'lit.update', key: it.key, patch: { reviewed: false } }, `literatuur ↺ ${it.title}`) });
    },
  },
};
