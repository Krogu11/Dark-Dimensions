# Technical Architecture: Cloud Platform + Web Editor
*KRO-12 — CTO Architecture Document*

## Status: Draft v1

---

## 1. Goals

1. Make the **web editor** accessible online (not just locally via `editor.html`).
2. Enable **cloud saves** so players can persist progress across devices/browsers.
3. Keep the **game itself** on GitHub Pages — it already works well and is free.
4. Preserve the **no-build-step** constraint: vanilla JS, CDN-loaded libraries only.
5. Minimize operational cost and complexity.

---

## 2. Scope Boundaries

| In Scope | Out of Scope |
|---|---|
| Cloud save backend | Multiplayer |
| Online editor with auth | Native app |
| Admin-only editor access | Custom game server |
| Cross-device save sync | Paid hosting |

---

## 3. Recommended Stack

### 3.1 Hosting — GitHub Pages (keep)

The game at `index.html` stays on GitHub Pages.
No change to the deploy pipeline (`publish-runtime.bat` → push → Pages).

### 3.2 Backend — Supabase (add)

Supabase provides auth, database, and storage via a CDN-loadable JS client.
It works with vanilla JS and requires no build step.

**Why Supabase over alternatives:**

| | Supabase | Firebase | Cloudflare Workers |
|---|---|---|---|
| Vanilla JS CDN | Yes | Yes | Complex |
| Free tier | Generous | Generous | Generous |
| SQL database | Yes (Postgres) | No (NoSQL) | No |
| Row-level security | Yes | Limited | N/A |
| Self-hostable | Yes | No | No |
| Auth built-in | Yes | Yes | No |

### 3.3 Editor Hosting — Separate Subdomain or Path

Two options (pick one before implementation):

**Option A — Same repo, separate path:**
Deploy `editor.html` as part of the GitHub Pages site at `/editor`.
Auth guard in JS prevents use without login.
Simplest to maintain.

**Option B — Separate Supabase-hosted page or Cloudflare Pages:**
Host the editor on a separate origin.
Cleaner access control but adds a second deploy target.

**Recommendation: Option A.** Lowest friction. Editor already lives in the repo.

---

## 4. Data Architecture

### 4.1 Save Slots — Cloud-Backed

Replace raw `localStorage` saves with a hybrid model:

```
localStorage (fast, offline)
    ↕ sync on load/save
Supabase saves table (cloud, cross-device)
```

Each save slot becomes a row in a `save_slots` table:

```sql
create table save_slots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  slot_index  int not null check (slot_index between 0 and 2),
  data        jsonb not null,
  updated_at  timestamptz default now(),
  unique (user_id, slot_index)
);

alter table save_slots enable row level security;

create policy "Users own their saves"
  on save_slots for all
  using (auth.uid() = user_id);
```

**Offline fallback:** If Supabase is unreachable, fall back to `localStorage` silently.
On reconnect, push local changes if `updated_at` is newer.

### 4.2 Editor Content — Runtime Config in Supabase Storage

The editor currently exports `runtime-config.json` to local files.

In the cloud model:

1. Editor saves draft content to a `runtime_configs` table (versioned rows).
2. A "publish" action uploads the approved config to **Supabase Storage** as `runtime-config.json`.
3. The game continues to load from `assets/data/runtime-config.json` on GitHub Pages **or** optionally fetches from the Supabase storage URL.

This preserves the existing deploy path while adding an online authoring option.

### 4.3 Auth Model

| Role | Access |
|---|---|
| Anonymous / Guest | Play game, local saves only |
| Player (email login) | Play game + cloud saves |
| Admin | Editor + publish runtime |

Admin role is set via a `user_roles` table or Supabase custom claims.
The editor page checks for admin role on load; redirect to login if absent.

---

## 5. Editor Online Flow

```
Browser → editor.html (GitHub Pages /editor)
  → Supabase Auth check (admin?)
    ├─ No → redirect to /login
    └─ Yes → load current draft runtime config from Supabase
         → edit cards / enemies / world / story
         → "Save Draft" → upsert to runtime_configs table
         → "Publish" → upload to Supabase Storage
                      → trigger GitHub Actions to pull new config and push to Pages
                      (OR: game fetches directly from Supabase Storage URL)
```

**GitHub Actions integration (optional):**
A Supabase webhook on storage upload triggers a GitHub Actions workflow that:
1. Downloads the new runtime config from storage.
2. Runs `publish-runtime.ps1 -SkipGit` equivalent to regenerate derived files.
3. Commits and pushes to `main`.
4. GitHub Pages redeploys.

This keeps the current single-file deploy model while enabling online publishing.

---

## 6. Game Cloud Save Flow

```
Player loads index.html
  → Supabase Auth (optional, skip if not logged in)
  → On save slot select: fetch save from Supabase (if logged in)
                         fall back to localStorage (if offline or guest)
  → On save: write localStorage first (fast)
             then async upsert to Supabase
```

JS module: `js/core/cloud-save.js`

Public API:
```js
CloudSave.login(email, password)
CloudSave.logout()
CloudSave.loadSlot(index)      // returns merged cloud+local save
CloudSave.saveSlot(index, data)// writes local + queues cloud sync
CloudSave.syncAll()            // push all local slots to cloud
```

The existing `js/core/save-manager.js` calls these functions when available.
Guest mode (no login) keeps current behavior exactly — zero regression risk.

---

## 7. Implementation Phases

### Phase 1 — Supabase Setup (no code changes)
- Create Supabase project.
- Set up `save_slots` table + RLS.
- Create admin user and `user_roles` table.
- Configure Supabase Auth (email/password, no OAuth needed initially).

### Phase 2 — Cloud Save Module
- Add `js/core/cloud-save.js` (Supabase client, slot sync).
- Add login/logout UI to main menu (optional panel, hidden for guests).
- Wire `save-manager.js` to call `CloudSave` methods.
- Test: guest save unchanged, logged-in save syncs.

### Phase 3 — Editor Auth Guard
- Add Supabase auth check at top of `editor.html`.
- Add login screen that redirects back to editor on success.
- Admin check via `user_roles`.

### Phase 4 — Runtime Config in Supabase
- Add `runtime_configs` table (versioned drafts).
- Editor "Save Draft" writes to table instead of only localStorage.
- Editor "Publish" uploads to Supabase Storage.
- Wire GitHub Actions webhook (optional, can stay manual initially).

---

## 8. Non-Goals / Constraints

- No Node.js server, no Docker, no build pipeline.
- No breaking changes to `localStorage['dd_custom']` format.
- No changes to GitHub Pages deploy for the game.
- Supabase CDN client loaded via `<script>` tag, no npm.
- Editor must still work locally without Supabase (local-only fallback).

---

## 9. Cost Estimate

| Service | Tier | Cost |
|---|---|---|
| GitHub Pages | Free | $0 |
| Supabase | Free tier (500 MB DB, 1 GB storage, 50k MAU) | $0 |
| Total | | **$0** |

Upgrade path: Supabase Pro at $25/mo if the project scales beyond free limits.

---

## 10. Open Decisions

| # | Decision | Options | Owner |
|---|---|---|---|
| 1 | Editor hosting: same Pages site vs separate? | Option A (same) recommended | Product |
| 2 | GitHub Actions webhook for auto-publish? | Yes / No (manual first) | Dev |
| 3 | Social login (Google/GitHub OAuth)? | Not in Phase 1 | Product |
| 4 | Game fetches runtime from Supabase Storage vs GitHub Pages files? | Pages files safer initially | CTO |

---

*Last updated: 2026-04-19 — CTO agent (eb11eff4)*
