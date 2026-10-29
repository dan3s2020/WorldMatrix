// Verbatim requirements checklist (Settings). Data: docs/REQUIREMENTS_CHECKLIST.json
import { t, onLang, esc } from './i18n.js';

export async function createChecklist(dialog, { navigate }) {
  const res = await fetch('docs/REQUIREMENTS_CHECKLIST.json');
  const data = await res.json();
  const list = dialog.querySelector('[data-cl-list]');
  const search = dialog.querySelector('[data-cl-search]');
  const filter = dialog.querySelector('[data-cl-filter]');
  const summary = dialog.querySelector('[data-cl-summary]');

  function render() {
    const q = search.value.trim().toLowerCase();
    const f = filter.value;
    const reqs = data.requirements.filter(r => (f === 'all' || r.status === f) && (!q || `${r.id} ${r.title} ${r.requirement} ${r.evidence}`.toLowerCase().includes(q)));
    const counts = data.requirements.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
    summary.innerHTML = `<b>${data.requirements.length}</b> · <span class="ok">${counts.verified || 0} ${esc(t('status_verified'))}</span> · <span class="part">${counts.partial || 0} ${esc(t('status_partial'))}</span> · <span class="miss">${counts.missing || 0} ${esc(t('status_missing'))}</span>`;
    list.innerHTML = reqs.map(r => `<li class="req ${r.status}">
      <div class="req-top"><span class="box" aria-hidden="true">${r.status === 'verified' ? '✓' : r.status === 'partial' ? '◐' : '○'}</span><strong>${esc(r.id)} · ${esc(r.title)}</strong><span class="chip">${esc(t('status_' + r.status))}</span></div>
      <p class="req-text">${esc(r.requirement)}</p>
      <p class="req-ev">${esc(r.evidence)} <small>(${esc(data.sources[r.source] || r.source)})</small></p>
      ${r.target && r.status !== 'missing' ? `<button type="button" class="btn ghost small" data-target="${esc(r.target)}">${esc(t('show_me'))} →</button>` : ''}
    </li>`).join('');
  }
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-target]');
    if (!b) return;
    dialog.close();
    navigate(b.dataset.target);
  });
  search.addEventListener('input', render);
  filter.addEventListener('change', render);
  onLang(render);
  render();
  return { open() { render(); dialog.showModal(); } };
}
