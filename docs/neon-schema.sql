-- Dark Dimensions — Neon schema (KRO-12)
-- Project: Dark Dimensions (proud-tree-83940290) | Region: us-east-1
--
-- This schema is already applied to the live Neon database.
-- Re-run only when setting up a new branch or environment.
--
-- Neon Auth (neon_auth schema) is provisioned separately via the
-- Neon MCP / console — do not manage those tables manually.

-- ── Save slots ──────────────────────────────────────────────
create table if not exists public.save_slots (
  id         uuid        primary key default gen_random_uuid(),
  user_id    text        not null,   -- Neon Auth user ID (JWT sub)
  slot_index int         not null check (slot_index between 1 and 3),
  data       jsonb       not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, slot_index)
);

alter table public.save_slots enable row level security;

create policy "users own saves"
  on public.save_slots for all
  using  (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
  with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ── User roles ───────────────────────────────────────────────
create table if not exists public.user_roles (
  user_id text primary key,
  role    text not null default 'player' check (role in ('player', 'admin'))
);

alter table public.user_roles enable row level security;

create policy "users read own role"
  on public.user_roles for select
  using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- Admin helper (used by RLS on runtime_drafts)
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    and role = 'admin'
  );
$$;

-- Grant admin: run manually in Neon console SQL editor:
-- insert into public.user_roles (user_id, role) values ('<neon-auth-user-id>', 'admin');

-- ── Runtime drafts ───────────────────────────────────────────
create table if not exists public.runtime_drafts (
  id         uuid        primary key default gen_random_uuid(),
  user_id    text        not null,
  label      text        not null default '',
  data       jsonb       not null,
  published  boolean     not null default false,
  created_at timestamptz not null default now()
);

alter table public.runtime_drafts enable row level security;

create policy "admins manage drafts"
  on public.runtime_drafts for all
  using  (public.is_admin())
  with check (public.is_admin());
