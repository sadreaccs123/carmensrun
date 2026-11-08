// =============================================================
// Shared code: runners, dates, the data store and the plan maths.
// Used by both the main app (app.js) and the admin page (admin.js).
// =============================================================
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ---------- The squad ----------------------------------------
export const RUNNERS = [
  { name: 'Dee',   color: '#FF5A1F', tint: '#FFE3D6', ink: '#9A2E06' },
  { name: 'Dils',  color: '#17A37A', tint: '#D8EFE6', ink: '#0F5A44' },
  { name: 'Prav',  color: '#6C5CE0', tint: '#E7E2FA', ink: '#3F338F' },
  { name: 'Sachi', color: '#E0A21A', tint: '#FBEBC4', ink: '#7A5208' },
];
export const runnerByName = (n) => RUNNERS.find((r) => r.name === n);

// ---------- Key dates ----------------------------------------
export const PLAN_START = '2026-11-02'; // Monday of week 1
export const RACE_DATE  = '2027-02-21'; // Sunday of week 16
export const WEEKS = 16;

// Dates are handled as plain 'YYYY-MM-DD' strings in the runner's own
// timezone. Doing the maths in UTC avoids daylight-saving bugs
// (a "day" that's 23 hours long would otherwise break week counting).
const toUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (t) => new Date(t).toISOString().slice(0, 10);
export const addDays = (s, n) => fromUTC(toUTC(s) + n * 86400000);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000); // b - a
export function todayStr() {
  const d = new Date(); // device's local date, e.g. Melbourne
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Which plan week a date falls in: 0 = before the plan, 17 = after race week.
export function weekOf(dateStr) {
  const diff = daysBetween(PLAN_START, dateStr);
  if (diff < 0) return 0;
  return Math.min(WEEKS + 1, Math.floor(diff / 7) + 1);
}
export const weekStart = (w) => addDays(PLAN_START, (w - 1) * 7);
export function fmtDate(s, opts = { day: 'numeric', month: 'short' }) {
  return new Date(toUTC(s)).toLocaleDateString('en-AU', { ...opts, timeZone: 'UTC' });
}
export const fmtKm = (n) => (Math.round(n * 10) / 10).toString();

// ---------- Default plan (used in demo mode) -----------------
// Mirrors schema.sql. In live mode the plan comes from the database.
export const DEFAULT_PLAN = [
  [1,'Learn',1,2,1,1,2,'Run 100m, walk 100m until you hit 1k'],
  [2,'Learn',1,2,1,1,2,'Run 200m, walk 100m until you hit 1k'],
  [3,'Learn',1,1,1,1,2,'Run 400m, walk 100m until you hit 1k'],
  [4,'Learn',2,2,1,2,2,'Run 1k for the first time'],
  [5,'Learn',2,2,2,4,6,null],
  [6,'Learn',2,2,3,5,7,null],
  [7,'Deload',2,2,2,3,5,"Your first deload week. You've built fatigue in your legs, time to ease off a bit"],
  [8,'Build',2,3,4,8,11,null],
  [9,'Build',2,3,5,9,13,null],
  [10,'Build',2,3,6,10,15,null],
  [11,'Deload',2,2,4,5,7,'Very important deload week, your next 3 weeks will be your hardest'],
  [12,'Peak',3,4,7,12,18,null],
  [13,'Peak',3,4,8,15,20,null],
  [14,'Peak',3,4,9,18,22,null],
  [15,'Taper',2,2,6,10,11,"You've done the work, now time to remove some fatigue so you're fresh for race week"],
  [16,'Race week',2,2,10,5,5,'GOOD LUCK!!!'],
].map(([week, phase, runs_min, runs_max, long_run, km_min, km_max, note]) =>
  ({ week, phase, runs_min, runs_max, long_run, km_min, km_max, note }));

// ---------- Data store ---------------------------------------
// Same functions whether we're live (Supabase) or in demo mode
// (browser storage), so the rest of the app doesn't care which.
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_KEY;

async function supabaseStore() {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const num = (rows, keys) => rows.map((r) => { keys.forEach((k) => (r[k] = Number(r[k]))); return r; });
  return {
    async getPlan()  { return num(check(await sb.from('plan_weeks').select('*').order('week')), ['long_run','km_min','km_max','runs_min','runs_max']); },
    async getRuns()  { return num(check(await sb.from('runs').select('*').order('run_date')), ['km']); },
    async getReaccs(){ return check(await sb.from('reaccs').select('*').order('created_at')); },
    async addRun(r)  { check(await sb.from('runs').insert(r)); },
    async deleteRun(id) { check(await sb.from('runs').delete().eq('id', id)); },
    async addReacc(r){ check(await sb.from('reaccs').insert(r)); },
    async updateWeek(w) { const { week, ...rest } = w; check(await sb.from('plan_weeks').update(rest).eq('week', week)); },
  };
}

function localStore() {
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const nextId = () => Date.now() + Math.floor(Math.random() * 1000);
  return {
    async getPlan()  { return read('sr_demo_plan', DEFAULT_PLAN); },
    async getRuns()  { return read('sr_demo_runs', []).sort((a, b) => a.run_date.localeCompare(b.run_date)); },
    async getReaccs(){ return read('sr_demo_reaccs', []); },
    async addRun(r)  { write('sr_demo_runs', [...read('sr_demo_runs', []), { ...r, id: nextId(), created_at: new Date().toISOString() }]); },
    async deleteRun(id) { write('sr_demo_runs', read('sr_demo_runs', []).filter((r) => r.id !== id)); },
    async addReacc(r){ write('sr_demo_reaccs', [...read('sr_demo_reaccs', []), { ...r, id: nextId(), created_at: new Date().toISOString() }]); },
    async updateWeek(w) { write('sr_demo_plan', (await this.getPlan()).map((p) => (p.week === w.week ? w : p))); },
  };
}

export const store = IS_DEMO ? localStore() : await supabaseStore();

// ---------- Plan maths ---------------------------------------
// Same as the spreadsheet: weekly total = SUM, long run = MAX.
// One difference: "longest run" is the longest single run you logged,
// so two 1 km runs on the same day don't count as a 2 km long run.
export function weekStats(runs, runner, week) {
  const mine = runs.filter((r) => r.runner === runner && weekOf(r.run_date) === week);
  return {
    total: mine.reduce((s, r) => s + r.km, 0),
    longest: mine.reduce((m, r) => Math.max(m, r.km), 0),
    count: mine.length,
  };
}

const roundUpHalf = (x) => Math.ceil(x * 2 - 1e-9) / 2; // 2.1 → 2.5, 2.5 → 2.5

// What should this runner's next run be?
export function nextRun(plan, runs, runner, today) {
  const w = weekOf(today);
  if (w > WEEKS) return { kind: 'finished', title: 'Race done', km: null, sub: 'You ran a 10k. Legends.' };
  const week = Math.max(1, w);
  const p = plan.find((x) => x.week === week);
  const s = weekStats(runs, runner, week);
  const daysLeft = w === 0 ? 7 : 6 - (daysBetween(PLAN_START, today) % 7); // days after today in this week
  const base = { week, phase: p.phase, note: p.note, stats: s, plan: p, lastDay: w > 0 && daysLeft === 0 };

  // 1) Long run first — it's the run that matters most each week.
  if (s.longest < p.long_run) {
    const isRace = week === WEEKS;
    return { ...base, kind: 'long', km: p.long_run,
      title: isRace ? `Race day · ${fmtDate(RACE_DATE, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Long run' };
  }
  // 2) Long run done but weekly km short → spread what's left over the runs left.
  const remaining = p.km_min - s.total;
  if (remaining > 0.001) {
    const runsLeft = Math.max(1, p.runs_max - s.count);
    return { ...base, kind: 'easy', km: Math.max(0.5, roundUpHalf(remaining / runsLeft)), title: 'Easy run' };
  }
  // 3) Week done.
  const stretch = p.km_max - s.total;
  return { ...base, kind: 'done', km: null, title: 'Week done',
    sub: stretch > 0.001 ? `Rest up, or up to ${fmtKm(stretch)} km more if you feel good.` : 'Stretch target hit too. Rest up.' };
}

// Days since this runner last ran (counts from plan start if never).
export function daysSinceRun(runs, runner, today) {
  const mine = runs.filter((r) => r.runner === runner && r.run_date <= today);
  const last = mine.length ? mine[mine.length - 1].run_date : PLAN_START;
  return { days: Math.max(0, daysBetween(last, today)), last: mine.length ? last : null };
}
