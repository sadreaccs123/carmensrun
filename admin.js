// =============================================================
// Admin page: edit the 16-week plan targets.
// =============================================================
import { ADMIN_PIN } from './config.js';
import { store, weekStart, addDays, fmtDate } from './common.js';

const $ = (id) => document.getElementById(id);
let plan = [];
const dirty = new Set(); // weeks with unsaved edits

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Number fields shown for each week: [column, label, step]
const FIELDS = [
  ['km_min', 'Target km', 0.5], ['km_max', 'Stretch km', 0.5], ['long_run', 'Long run km', 0.5],
  ['runs_min', 'Runs min', 1], ['runs_max', 'Runs max', 1],
];

function render() {
  $('weeks').innerHTML = plan.map((p) => `
    <div class="admin-week" data-week="${p.week}">
      <h3>Week ${p.week} <span class="muted" style="font:400 12px var(--body)">${fmtDate(weekStart(p.week))} – ${fmtDate(addDays(weekStart(p.week), 6))}</span></h3>
      <div class="admin-grid">
        <label>Phase<input data-k="phase" value="${esc(p.phase)}"></label>
        ${FIELDS.map(([k, l, s]) => `<label>${l}<input data-k="${k}" type="number" inputmode="decimal" step="${s}" min="0" value="${p[k]}"></label>`).join('')}
      </div>
      <label class="admin-full">Note<textarea data-k="note" rows="2">${esc(p.note)}</textarea></label>
    </div>`).join('');
}

function readWeek(el) {
  const w = { week: Number(el.dataset.week) };
  el.querySelectorAll('[data-k]').forEach((i) => {
    const k = i.dataset.k;
    w[k] = k === 'phase' || k === 'note' ? (i.value.trim() || (k === 'note' ? null : '')) : Number(i.value);
  });
  return w;
}

function validate(w) {
  if (!w.phase) return `Week ${w.week}: phase can't be empty.`;
  for (const [k, l] of FIELDS) if (!(w[k] >= 0) || Number.isNaN(w[k])) return `Week ${w.week}: ${l} must be a number.`;
  if (w.km_max < w.km_min) return `Week ${w.week}: stretch km can't be below the weekly target.`;
  if (w.runs_max < w.runs_min) return `Week ${w.week}: runs max can't be below runs min.`;
  if (!Number.isInteger(w.runs_min) || !Number.isInteger(w.runs_max)) return `Week ${w.week}: runs must be whole numbers.`;
  return null;
}

$('pin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('pin').value !== ADMIN_PIN) { $('pin-err').textContent = "That code's not right."; return; }
  $('lock').hidden = true; $('editor').hidden = false;
  try { plan = await store.getPlan(); render(); }
  catch (err) { console.error(err); $('save-err').textContent = "Couldn't load the plan. Check your connection."; }
});
$('pin').addEventListener('input', () => { $('pin-err').textContent = ''; });

$('weeks').addEventListener('input', (e) => {
  const el = e.target.closest('.admin-week'); if (!el) return;
  dirty.add(Number(el.dataset.week)); el.classList.add('dirty'); $('save-err').textContent = '';
});

$('save').addEventListener('click', async () => {
  if (!dirty.size) { toast('Nothing to save'); return; }
  const changed = [...dirty].map((w) => readWeek(document.querySelector(`.admin-week[data-week="${w}"]`)));
  for (const w of changed) { const msg = validate(w); if (msg) { $('save-err').textContent = msg; return; } }
  const btn = $('save'); btn.disabled = true;
  try {
    for (const w of changed) { await store.updateWeek(w); dirty.delete(w.week); }
    document.querySelectorAll('.admin-week.dirty').forEach((el) => el.classList.remove('dirty'));
    toast(`Saved ${changed.length} week${changed.length === 1 ? '' : 's'}`);
    plan = await store.getPlan();
  } catch (err) {
    console.error(err);
    $('save-err').textContent = "Couldn't save. Some weeks may not have updated. Check your connection and try again.";
  } finally { btn.disabled = false; }
});
