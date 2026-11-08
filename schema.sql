-- =============================================================
-- SAD REACCS run tracker — database setup
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run once on a brand-new project.
-- =============================================================

-- 1) RUNS: one row per run anyone logs --------------------------
create table if not exists public.runs (
  id          bigint generated always as identity primary key,
  runner      text not null check (runner in ('Dee','Dils','Prav','Sachi')),
  run_date    date not null,
  km          numeric(5,2) not null check (km > 0 and km <= 60),
  created_at  timestamptz not null default now()
);
create index if not exists runs_runner_date on public.runs (runner, run_date);

-- 2) PLAN_WEEKS: the 16-week plan (editable from the admin page) -
create table if not exists public.plan_weeks (
  week      int primary key check (week between 1 and 16),
  phase     text not null,
  runs_min  int not null,
  runs_max  int not null,
  long_run  numeric(5,2) not null,   -- longest single run target (km)
  km_min    numeric(5,2) not null,   -- weekly target (km)
  km_max    numeric(5,2) not null,   -- weekly stretch (km)
  note      text
);

-- 3) REACCS: the 😢 a squadmate sends you when you've gone quiet --
create table if not exists public.reaccs (
  id           bigint generated always as identity primary key,
  from_runner  text not null check (from_runner in ('Dee','Dils','Prav','Sachi')),
  to_runner    text not null check (to_runner   in ('Dee','Dils','Prav','Sachi')),
  created_at   timestamptz not null default now(),
  check (from_runner <> to_runner)
);

-- Seed the plan (copied from the spreadsheet; typos fixed) --------
insert into public.plan_weeks (week, phase, runs_min, runs_max, long_run, km_min, km_max, note) values
 ( 1,'Learn',    1,2, 1, 1, 2,'Run 100m, walk 100m until you hit 1k'),
 ( 2,'Learn',    1,2, 1, 1, 2,'Run 200m, walk 100m until you hit 1k'),
 ( 3,'Learn',    1,1, 1, 1, 2,'Run 400m, walk 100m until you hit 1k'),
 ( 4,'Learn',    2,2, 1, 2, 2,'Run 1k for the first time'),
 ( 5,'Learn',    2,2, 2, 4, 6, null),
 ( 6,'Learn',    2,2, 3, 5, 7, null),
 ( 7,'Deload',   2,2, 2, 3, 5,'Your first deload week. You''ve built fatigue in your legs, time to ease off a bit'),
 ( 8,'Build',    2,3, 4, 8,11, null),
 ( 9,'Build',    2,3, 5, 9,13, null),
 (10,'Build',    2,3, 6,10,15, null),
 (11,'Deload',   2,2, 4, 5, 7,'Very important deload week, your next 3 weeks will be your hardest'),
 (12,'Peak',     3,4, 7,12,18, null),
 (13,'Peak',     3,4, 8,15,20, null),
 (14,'Peak',     3,4, 9,18,22, null),
 (15,'Taper',    2,2, 6,10,11,'You''ve done the work, now time to remove some fatigue so you''re fresh for race week'),
 (16,'Race week',2,2,10, 5, 5,'GOOD LUCK!!!')
on conflict (week) do nothing;

-- Access rules ----------------------------------------------------
-- There are no logins, so the app talks to the database with the
-- public "anon/publishable" key. Row Level Security (RLS) is switched
-- on and these policies say exactly what that public key may do.
-- Anyone with the app link can do these things — keep the link in
-- the group chat.
alter table public.runs       enable row level security;
alter table public.plan_weeks enable row level security;
alter table public.reaccs     enable row level security;

create policy "anyone reads runs"    on public.runs for select to anon using (true);
create policy "anyone logs runs"     on public.runs for insert to anon with check (true);
create policy "anyone deletes runs"  on public.runs for delete to anon using (true);

create policy "anyone reads plan"    on public.plan_weeks for select to anon using (true);
create policy "anyone edits plan"    on public.plan_weeks for update to anon using (true) with check (true);

create policy "anyone reads reaccs"  on public.reaccs for select to anon using (true);
create policy "anyone sends reaccs"  on public.reaccs for insert to anon with check (true);

grant select, insert, delete on public.runs       to anon;
grant select, update         on public.plan_weeks to anon;
grant select, insert         on public.reaccs     to anon;
grant usage, select on all sequences in schema public to anon;
