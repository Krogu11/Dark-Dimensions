-- Dark Dimensions — Supabase schema (KRO-12)
-- Run this once in the Supabase SQL editor for your project.

-- Save slots table
create table if not exists public.save_slots (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users on delete cascade,
  slot_index  int         not null check (slot_index between 1 and 3),
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, slot_index)
);

alter table public.save_slots enable row level security;

-- Users can only read/write their own saves
create policy "Users own their saves"
  on public.save_slots
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin role table (used by editor auth guard)
create table if not exists public.user_roles (
  user_id  uuid  primary key references auth.users on delete cascade,
  role     text  not null default 'player' check (role in ('player', 'admin'))
);

alter table public.user_roles enable row level security;

-- Users can read their own role; only admins write roles
create policy "Users read own role"
  on public.user_roles
  for select
  using (auth.uid() = user_id);

-- Helper function: check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- Grant a user admin access (run manually for each admin):
-- insert into public.user_roles (user_id, role) values ('<user-uuid>', 'admin');
