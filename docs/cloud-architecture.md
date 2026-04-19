# Technical Architecture: Cloud Platform + Web Editor
*KRO-12 — CTO Architecture Document*

## Status: Implemented ✓

---

## 1. Goals

1. Make the **web editor** accessible online (not just locally via `editor.html`).
2. Enable **cloud saves** so players can persist progress across devices/browsers.
3. Keep the **game itself** on GitHub Pages — it already works well and is free.
4. Preserve the **no-build-step** constraint: vanilla JS, no SDK, pure `fetch`.
5. Minimize operational cost and complexity.

---

## 2. Live Infrastructure

| Resource | Value |
|---|---|
| Game hosting | GitHub Pages — `https://krogu11.github.io/Dark-Dimensions` |
| Cloud backend | Neon Postgres (serverless) |
| Neon project | `Dark Dimensions` — ID: `proud-tree-83940290` |
| Region | `us-east-1` (AWS) |
| Neon Auth URL | `https://ep-soft-surf-amvxla93.auth.c-5.us-east-1.aws.neon.tech` |
| Neon Data API URL | `https://ep-soft-surf-amvxla93.apirest.c-5.us-east-1.aws.neon.tech/neondb/rest/v1` |
| Trusted origins | `https://krogu11.github.io`, `localhost` |

**Cost: $0** — Neon free tier (500 MB DB, 50k monthly auth users).

---

## 3. Stack

| Layer | Technology | Why |
|---|---|---|
| Auth | Neon Auth (Better Auth) | Built into Neon, email+password + Google OAuth, JWT |
| Database | Neon Postgres | Serverless, same project as auth, RLS |
| API | Neon Data API (PostgREST) | HTTP REST from browser, JWT-gated, no SDK needed |
| Game hosting | GitHub Pages | Free, zero-config, existing pipeline unchanged |
| Client | Vanilla JS + `fetch` | No build step, no CDN SDK required |

---

## 4. Database Schema

All tables are in the `public` schema with Row Level Security enabled.
The `neon_auth` schema (users, sessions, accounts) is managed by Neon Auth automatically.

### `save_slots`
One row per player per slot (1–3). RLS: users access only their own rows.

```sql
user_id    text  -- Neon Auth user ID (JWT sub)
slot_index int   -- 1 | 2 | 3
data       jsonb -- full serialized slot object
updated_at timestamptz
```

### `user_roles`
Admin designation. RLS: users can read their own role, only DB-level writes grant admin.

```sql
user_id text  -- primary key
role    text  -- 'player' | 'admin'
```

### `runtime_drafts`
Versioned editor content snapshots. RLS: admin-only read/write.

```sql
user_id    text
label      text
data       jsonb  -- full runtime-config payload
published  boolean
created_at timestamptz
```

### RPC Functions

| Function | Auth | Purpose |
|---|---|---|
| `is_admin()` | authenticated | Used by RLS on runtime_drafts |
| `bootstrap_first_admin(user_id)` | authenticated | Self-promotes first user to admin; no-op once any admin exists |
| `admin_exists()` | authenticated | Checks if any admin row exists |

---

## 5. Auth Flow

### Player (cloud saves)
```
index.html loads → CloudSave.init() → restore session cookie
  → if session: sync save slots (cloud wins if newer)
  → if no session: local-only mode (zero regression)
Player can optionally log in from main menu for cross-device saves.
```

### Admin (editor)
```
editor.html loads → EditorAuth checks session via CloudSave
  → if admin session: grant access immediately
  → if no session: show login overlay
    → user submits email + password
    → CloudSave.login() → Neon Auth /api/auth/sign-in/email
    → check isAdmin()
      → if admin: grant access
      → if not admin AND no admin exists: bootstrap_first_admin() → grant access
      → if not admin AND admin exists: deny access
```

---

## 6. Cloud Save Sync

```
On save (saveCurrentSlot):
  1. Write to localStorage immediately (fast, offline-safe)
  2. CloudSave.afterSave() → async push to Neon Data API (upsert)

On load (game boot with session):
  For each slot 1-3:
    - Fetch cloud row
    - Compare updated_at timestamps
    - Cloud newer → overwrite localStorage
    - Local newer → push to cloud
    - Equal → no-op
```

---

## 7. Editor Cloud Actions

| Button | Action |
|---|---|
| ☁ Entwurf | `CloudEditor.saveDraft()` → insert into `runtime_drafts` (published=false) |
| 🚀 Publish | `CloudEditor.publish()` → insert into `runtime_drafts` (published=true) |
| 🌐 Runtime-Export | Local file download (unchanged) |
| ✓ Im Spiel speichern | Local `localStorage` write (unchanged) |

---

## 8. First-Run Setup

1. Open `editor.html` (locally or at `https://krogu11.github.io/Dark-Dimensions/editor.html`)
2. Enter any email + password in the login overlay and click **Anmelden**
3. Neon Auth creates the account (sign-up is enabled)
4. `bootstrap_first_admin()` auto-promotes the first user to admin
5. Editor access is granted — the second user to register will need manual admin grant

**To grant admin to additional users (run in Neon console):**
```sql
insert into public.user_roles (user_id, role)
values ('<neon-auth-user-id>', 'admin')
on conflict (user_id) do update set role = 'admin';
```

---

## 9. Key Files

| File | Purpose |
|---|---|
| `js/core/cloud-config.js` | Neon Auth + Data API URLs (committed, safe to expose) |
| `js/core/cloud-save.js` | CloudSave module: auth, slot sync, admin check, bootstrap |
| `js/editor/editor-auth.js` | Editor login overlay + admin guard |
| `js/editor/cloud-editor.js` | Draft save + publish to runtime_drafts |
| `docs/neon-schema.sql` | Schema SQL for re-creating tables on a new branch |

---

## 10. Open Items

- [ ] Consider enabling Google OAuth in Neon Auth for player login convenience
- [ ] Consider a "Load from Cloud" button in the editor to restore latest published draft
- [ ] Game main menu could show a cloud-sync status indicator when logged in

---

*Last updated: 2026-04-19 — fully implemented on `dev` branch*
