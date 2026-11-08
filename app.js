// =============================================================
// Main app: reads runs + plan, works out progress, draws the page.
// =============================================================
import {
  RUNNERS, runnerByName, RACE_DATE, PLAN_START, WEEKS, IS_DEMO, store,
  todayStr, weekOf, weekStart, addDays, daysBetween, fmtDate, fmtKm,
  weekStats, nextRun, daysSinceRun,
} from './common.js';

const $ = (id) => document.getElementById(id);
const PHASE_COLORS = { Learn: '#F2B9A1', Deload: '#CFC8BA', Build: '#FF8A5C', Peak: '#FF5A1F', Taper: '#9C958A', 'Race week': '#1B1A17' };
const phaseColor = (p) => PHASE_COLORS[p] || (/race/i.test(p) ? '#1B1A17' : '#CFC8BA');

// ---- App state ----
let plan = [], runs = [], reaccs = [];
let me = null;                 // which runner this phone belongs to
let metric = 'total';          // chart toggle: 'total' or 'longest'
let selectedWeek = null;       // plan strip selection
let chart = null;

try { me = localStorage.getItem('sr_me'); } catch {}
if (!runnerByName(me)) me = null;

// ---- Small helpers ----
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
const localDateOf = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const pct = (a, b) => (b > 0 ? Math.min(100, (a / b) * 100) : 100);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lastRanText = (d, last) => (!last ? 'No runs yet' : d === 0 ? 'Ran today' : d === 1 ? 'Last ran yesterday' : `Last ran ${d} days ago`);

// ---- Load data from the store ----
async function load() {
  try {
    [plan, runs, reaccs] = await Promise.all([store.getPlan(), store.getRuns(), store.getReaccs()]);
    render();
  } catch (e) {
    console.error(e);
    toast("Couldn't reach the database. Check your connection.");
  }
}

// ---- Render everything ----
function render() {
  const today = todayStr();
  const curWeek = Math.min(WEEKS, Math.max(1, weekOf(today)));
  if (selectedWeek == null) selectedWeek = curWeek;

  // Header countdown
  const d = daysBetween(today, RACE_DATE);
  $('countdown').textContent = d > 1 ? `${d} days to race` : d === 1 ? 'Race tomorrow' : d === 0 ? 'RACE DAY' : 'Race done';
  $('demo-banner').hidden = !IS_DEMO;

  renderWho();
  $('picker').hidden = !!me;
  $('me-section').hidden = !me;
  $('history-card').hidden = !me;
  if (me) { renderMe(today); renderHistory(); }
  renderSquad(today, curWeek);
  renderChart(curWeek);
  renderStrip(curWeek);
  $('foot-me').textContent = me ? `This phone: ${me}` : '';
}

function renderWho() {
  $('who').innerHTML = RUNNERS.map((r) =>
    `<button type="button" class="chip-btn ${r.name === me ? 'on' : ''}" data-name="${r.name}"
      style="${r.name === me ? `background:${r.color}` : ''}">${r.name}</button>`).join('');
  $('picker-grid').innerHTML = RUNNERS.map((r) =>
    `<button type="button" data-name="${r.name}" style="background:${r.color}">${r.name.toUpperCase()}</button>`).join('');
}

function renderMe(today) {
  const n = nextRun(plan, runs, me, today);
  const runner = runnerByName(me);

  // Next run (the bib)
  $('next-title').textContent = n.title;
  if (n.kind === 'finished') {
    $('next-week').textContent = '';
    $('next-km').className = 'big word'; $('next-km').textContent = '10K DONE';
    $('next-note').textContent = n.sub;
  } else {
    $('next-week').textContent = weekOf(today) === 0
      ? `Starts ${fmtDate(PLAN_START, { weekday: 'short', day: 'numeric', month: 'short' })}`
      : `Wk ${n.week} · ${n.phase}`;
    if (n.km != null) { $('next-km').className = 'big'; $('next-km').innerHTML = `${fmtKm(n.km)}<small>km</small>`; }
    else { $('next-km').className = 'big word'; $('next-km').textContent = 'DONE'; }
    const note = n.kind === 'done' ? n.sub : (n.note || (n.kind === 'easy' ? 'Long run is in the bag. Easy pace to finish the week.' : ''));
    $('next-note').innerHTML = esc(note) + (n.lastDay && n.kind !== 'done' ? '<br><span class="lastday">Last day of the week</span>' : '');
  }

  // This week
  if (n.stats) {
    const { stats: s, plan: p } = n;
    $('wk-total').textContent = `${fmtKm(s.total)} / ${fmtKm(p.km_min)} km`;
    $('wk-total-bar').style.width = pct(s.total, p.km_min) + '%';
    $('wk-total-bar').style.background = runner.color;
    $('wk-long').textContent = `${fmtKm(s.longest)} / ${fmtKm(p.long_run)} km`;
    $('wk-long-bar').style.width = pct(s.longest, p.long_run) + '%';
    const rr = p.runs_min === p.runs_max ? `${p.runs_min}` : `${p.runs_min}–${p.runs_max}`;
    $('wk-runs').textContent = `Runs: ${s.count} of ${rr} · Stretch target ${fmtKm(p.km_max)} km`;
  }

  // Reacc banner: reaccs sent to me since the last run I logged
  const myRuns = runs.filter((r) => r.runner === me);
  const lastLogged = myRuns.reduce((m, r) => (r.created_at > m ? r.created_at : m), '');
  const fresh = reaccs.filter((x) => x.to_runner === me && x.created_at > lastLogged);
  const senders = [...new Set(fresh.map((x) => x.from_runner))];
  const banner = $('reacc-banner');
  banner.hidden = senders.length === 0;
  if (senders.length) {
    const names = senders.length === 1 ? senders[0] : senders.slice(0, -1).join(', ') + ' and ' + senders.at(-1);
    banner.innerHTML = `😢 <b>${esc(names)}</b> sad-reacc'd you. Log a run to make it stop.`;
  }

  // Log form date limits
  const dateInput = $('log-date');
  dateInput.max = today;
  dateInput.min = addDays(PLAN_START, -7);
  if (!dateInput.value || dateInput.value > today) dateInput.value = today;
}

function renderSquad(today, curWeek) {
  const p = plan.find((x) => x.week === curWeek);
  $('squad-week').textContent = `Wk ${curWeek} of ${WEEKS}`;
  const weekAgo = Date.now() - 7 * 86400000;
  $('squad').innerHTML = RUNNERS.map((r) => {
    const s = weekStats(runs, r.name, curWeek);
    const { days, last } = daysSinceRun(runs, r.name, today);
    const hitKm = s.total >= p.km_min - 0.001, hitLong = s.longest >= p.long_run - 0.001;
    let pill;
    if (hitKm && hitLong) pill = `<span class="pill" style="background:var(--ok-tint);color:var(--ok)">Done</span>`;
    else if (s.count === 0) pill = `<span class="pill" style="background:var(--track);color:var(--ink-2)">Not started</span>`;
    else if (hitKm) pill = `<span class="pill" style="background:${r.tint};color:${r.ink}">Long run to go</span>`;
    else pill = `<span class="pill" style="background:${r.tint};color:${r.ink}">${fmtKm(p.km_min - s.total)} km to go</span>`;

    const received = reaccs.filter((x) => x.to_runner === r.name && new Date(x.created_at).getTime() > weekAgo).length;
    const sentToday = reaccs.some((x) => x.from_runner === me && x.to_runner === r.name && localDateOf(x.created_at) === today);
    const quiet = days >= 3 && today >= PLAN_START;
    const btn = me && r.name !== me && quiet
      ? `<button type="button" class="reacc-btn" data-reacc="${r.name}" ${sentToday ? 'disabled' : ''}>${sentToday ? 'Reacc sent' : '😢 Sad reacc'}</button>`
      : received ? `<span class="reacc-count">${'😢'.repeat(Math.min(received, 5))}</span>` : '';

    return `<div class="sq">
      <div class="sq-top"><span class="dot" style="background:${r.color}"></span>
        <span class="sq-name">${r.name}</span>${r.name === me ? '<span class="sq-you">you</span>' : ''}${pill}</div>
      <div class="bar"><i style="width:${pct(s.total, p.km_min)}%;background:${r.color}"></i></div>
      <div class="sq-meta"><span>${fmtKm(s.total)} km · ${s.count} run${s.count === 1 ? '' : 's'} · ${lastRanText(days, last)}</span>${btn}</div>
    </div>`;
  }).join('');
}

function renderChart(curWeek) {
  // Show weeks so far plus the next 4 (min 6), so early 1 km weeks aren't
  // squashed flat by the 22 km peak weeks. Widens to the full plan over time.
  const viewTo = Math.min(WEEKS, Math.max(6, curWeek + 4));
  drawChart(curWeek, plan.filter((p) => p.week <= viewTo));
}

function drawChart(curWeek, weeks) {
  const labels = weeks.map((p) => `W${p.week}`);
  const shownWeeks = Math.max(1, weekOf(todayStr()));
  const targetKey = metric === 'total' ? 'km_min' : 'long_run';
  const datasets = [{
    label: 'Target', data: weeks.map((p) => p[targetKey]), borderColor: '#1B1A17', borderWidth: 1.5,
    borderDash: [5, 4], pointRadius: 0, stepped: 'middle', fill: false, order: 10,
  }];
  if (metric === 'total') datasets.push({
    label: 'Stretch', data: weeks.map((p) => p.km_max), borderColor: 'transparent', backgroundColor: 'rgba(27,26,23,0.06)',
    pointRadius: 0, stepped: 'middle', fill: '-1', order: 11,
  });
  RUNNERS.forEach((r) => datasets.push({
    label: r.name,
    data: weeks.map((p) => (p.week <= shownWeeks ? Math.round(weekStats(runs, r.name, p.week)[metric] * 10) / 10 : null)),
    borderColor: r.color, backgroundColor: r.color, borderWidth: r.name === me ? 3.5 : 2.2,
    pointRadius: (ctx) => (ctx.dataIndex === curWeek - 1 ? 4 : 2.5), cubicInterpolationMode: 'monotone', spanGaps: false,
  }));

  const ctx = $('chart');
  if (!window.Chart) return;
  Chart.defaults.font.family = 'Inter, sans-serif';
  Chart.defaults.color = '#6B655B';
  const options = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1B1A17', titleColor: '#F4EFE6', bodyColor: '#F4EFE6', padding: 10, boxPadding: 4,
        filter: (i) => i.raw != null && i.dataset.label !== 'Stretch',
        callbacks: { label: (i) => ` ${i.dataset.label}: ${i.raw} km` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 4,
        color: (c) => (c.index === curWeek - 1 ? '#1B1A17' : '#6B655B') } },
      y: { beginAtZero: true, grid: { color: 'rgba(27,26,23,0.07)' }, border: { display: false },
        ticks: { font: { size: 10 }, callback: (v) => `${v}` } },
    },
  };
  if (chart) { chart.data.labels = labels; chart.data.datasets = datasets; chart.options = options; chart.update(); }
  else chart = new Chart(ctx, { type: 'line', data: { labels, datasets }, options });

  $('legend').innerHTML = `<span><i class="dash"></i>Target</span>` +
    RUNNERS.map((r) => `<span><i style="background:${r.color}"></i>${r.name}</span>`).join('');
}

function renderStrip(curWeek) {
  $('strip').innerHTML = plan.map((p) => {
    const c = phaseColor(p.phase), dark = ['Peak', 'Race week', 'Taper'].includes(p.phase) || /race/i.test(p.phase);
    return `<button type="button" data-week="${p.week}" class="${dark ? 'dark' : ''} ${p.week === curWeek ? 'now' : ''} ${p.week === selectedWeek ? 'sel' : ''}"
      style="background:${c}" aria-label="Week ${p.week}">${p.week}</button>`;
  }).join('');
  const p = plan.find((x) => x.week === selectedWeek);
  if (!p) return;
  const start = weekStart(p.week), end = addDays(start, 6);
  const rr = p.runs_min === p.runs_max ? `${p.runs_min}` : `${p.runs_min}–${p.runs_max}`;
  $('week-detail').innerHTML = `
    <div class="row"><b>Week ${p.week} · ${esc(p.phase)}</b><span class="muted">${fmtDate(start)} – ${fmtDate(end)}</span></div>
    <div class="wd-grid">
      <div><b>${fmtKm(p.km_min)}${p.km_max > p.km_min ? `–${fmtKm(p.km_max)}` : ''}</b><span>km for the week</span></div>
      <div><b>${fmtKm(p.long_run)}</b><span>km long run</span></div>
      <div><b>${rr}</b><span>runs</span></div>
    </div>
    ${p.note ? `<div class="wd-note">${esc(p.note)}</div>` : ''}`;
}

function renderHistory() {
  const mine = runs.filter((r) => r.runner === me).sort((a, b) => b.run_date.localeCompare(a.run_date) || String(b.created_at).localeCompare(String(a.created_at)));
  $('history-title').textContent = `Your runs (${mine.length})`;
  $('history').innerHTML = mine.length
    ? mine.map((r) => `<li><span class="km">${fmtKm(r.km)} km</span>
        <span class="d">${fmtDate(r.run_date, { weekday: 'short', day: 'numeric', month: 'short' })} · Wk ${weekOf(r.run_date) || '–'}</span>
        <button type="button" class="del" data-del="${r.id}">Delete</button></li>`).join('')
    : `<li class="empty">No runs yet. Your first one goes above.</li>`;
}

// ---- Events ----
function setMe(name) {
  me = name;
  try { localStorage.setItem('sr_me', name); } catch {}
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.name) return setMe(t.dataset.name);
  if (t.dataset.metric) {
    metric = t.dataset.metric;
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b === t));
    return renderChart(Math.min(WEEKS, Math.max(1, weekOf(todayStr()))));
  }
  if (t.dataset.week) { selectedWeek = Number(t.dataset.week); return renderStrip(Math.min(WEEKS, Math.max(1, weekOf(todayStr())))); }
  if (t.dataset.del) {
    // Two taps to delete: first tap arms the button, second within 3 s deletes.
    if (!t.classList.contains('confirm')) {
      t.classList.add('confirm'); t.textContent = 'Sure?';
      setTimeout(() => { t.classList.remove('confirm'); t.textContent = 'Delete'; }, 3000);
      return;
    }
    t.disabled = true;
    try { await store.deleteRun(Number(t.dataset.del)); toast('Run deleted'); await load(); }
    catch (err) { console.error(err); toast("Couldn't delete. Try again."); t.disabled = false; }
    return;
  }
  if (t.dataset.reacc) {
    t.disabled = true;
    try { await store.addReacc({ from_runner: me, to_runner: t.dataset.reacc }); toast(`😢 sent to ${t.dataset.reacc}`); await load(); }
    catch (err) { console.error(err); toast("Couldn't send. Try again."); t.disabled = false; }
  }
});

$('log-km').addEventListener('input', () => { $('log-err').textContent = ''; });
$('log-date').addEventListener('input', () => { $('log-err').textContent = ''; });

$('log-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = $('log-km').value.replace(',', '.');
  const km = Math.round(parseFloat(raw) * 100) / 100;
  const date = $('log-date').value;
  const today = todayStr();
  if (!raw || !(km > 0)) return ($('log-err').textContent = 'Enter how far you ran, in km.');
  if (km > 60) return ($('log-err').textContent = "That's further than 60 km. Check the number.");
  if (!date) return ($('log-err').textContent = 'Pick the date you ran.');
  if (date > today) return ($('log-err').textContent = "That date's in the future.");

  const btn = $('log-btn'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
  try {
    await store.addRun({ runner: me, run_date: date, km });
    $('log-km').value = ''; $('log-km').blur();
    toast(`Logged ${fmtKm(km)} km. Nice.`);
    await load();
  } catch (err) {
    console.error(err);
    $('log-err').textContent = "Couldn't save that run. Check your connection and try again.";
  } finally { btn.removeAttribute('aria-busy'); btn.disabled = false; }
});

// Refresh when the app comes back to the foreground (e.g. reopening from the home screen)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });

load();
