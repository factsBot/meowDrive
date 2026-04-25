-- meowDrive cloud schema
-- Run this in the Supabase SQL editor for your project.
-- Single-user-per-account: each row is owned by auth.uid() and only the owner can read/write.

create extension if not exists "pgcrypto";

create table if not exists public.project_combos (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  vision_project text not null,
  vision_scope text,
  vision_phase text,
  vision_labor_code text not null,
  is_favorite boolean not null default false,
  last_used_at timestamptz,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_combos_owner_updated
  on public.project_combos (owner_id, updated_at);

create table if not exists public.time_entries (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  combo_id uuid not null references public.project_combos(id),
  work_date date not null,
  hours numeric not null,
  note text,
  source text not null,
  source_ref_id text,
  copied_to_vision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_entries_owner_workdate
  on public.time_entries (owner_id, work_date);
create index if not exists idx_entries_owner_updated
  on public.time_entries (owner_id, updated_at);

create table if not exists public.audit_events (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  timestamp timestamptz not null default now(),
  action text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  reason text
);

create index if not exists idx_audit_owner_entity
  on public.audit_events (owner_id, entity_id);

-- Row-level security: each user can only touch their own rows.
alter table public.project_combos enable row level security;
alter table public.time_entries enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "combos_owner" on public.project_combos;
create policy "combos_owner" on public.project_combos
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "entries_owner" on public.time_entries;
create policy "entries_owner" on public.time_entries
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "audit_owner" on public.audit_events;
create policy "audit_owner" on public.audit_events
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
