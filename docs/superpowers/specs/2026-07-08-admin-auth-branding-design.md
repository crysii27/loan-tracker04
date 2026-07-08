# Admin Authentication, Public Reports View & Branding — Design

**Date:** 2026-07-08
**Status:** Approved by user (pending written-spec review)
**Approach chosen:** Server-enforced auth (Approach A) — a single admin password, session tokens, backend middleware guarding every mutating route. UI hiding is a convenience layer, never the security boundary.

## Context

`loan-tracker04` is an internal HPE Aruba showroom tool: Express backend (`backend/server.js`, JSON-file persistence) + React CRA frontend (`frontend/src/App.js`). Today it has **no authentication**: anyone on the LAN at `http://172.24.100.115` can create, edit, and delete loans. A prior hardening round (2026-07-08 plan) closed path traversal, CORS, credential, and validation gaps but explicitly deferred auth. This design adds it.

## Goals

1. A single **admin** (one shared password) is the only one who can modify anything.
2. Anonymous visitors see **only the Reports view**, complete (stats, filters, detail table, PDF/Excel export).
3. Admin can customize **branding** from the UI: page title and company logo, visible to all visitors (web page + browser tab only; PDF exports and report emails unchanged).
4. Admin can **change the password** from the UI.
5. Document **downloads are admin-only** (user explicitly chose the extra work over leaving them public).

## Non-goals (out of scope, recorded for the future)

- Multiple user accounts / roles / audit trail of who did what.
- HTTPS. The app runs over HTTP on the LAN, so the password transits the internal network unencrypted at login. Accepted risk for a showroom; HTTPS is the named future improvement.
- Branding in PDF exports or report emails.
- Refactoring the existing `App.js` internals (still deferred; only *new* UI ships as separate files).

---

## 1. Authentication

### Password storage & bootstrap

- New file `backend/authConfig.json` (gitignored): `{ "passwordHash": "<hex>", "salt": "<hex>" }`.
- Hashing: Node's built-in `crypto.scryptSync(password, salt, 64)` — no new dependencies. Constant-time comparison via `crypto.timingSafeEqual`.
- **Bootstrap:** on server start, if `authConfig.json` does not exist, create it from `ADMIN_PASSWORD` in `credenciales.env`. If neither exists, log a clear warning and reject all logins with a "not configured" error (the app still serves the public view).
- After bootstrap, `ADMIN_PASSWORD` in the env file is only a fallback seed; the UI's change-password flow rewrites `authConfig.json` and the env value is never read again unless `authConfig.json` is deleted.

### Sessions

- `POST /auth/login { password }` → verifies hash → returns `{ token }`, a `crypto.randomBytes(32).toString('hex')`.
- Sessions live **in memory** (a `Map<token, { expiresAt }>`): a backend restart logs everyone out. Accepted trade-off (simpler and safer than persisting sessions) for an internal tool.
- Expiry: **8 hours**, fixed from login.
- Brute-force guard: after **5 failed attempts** (global counter — single-admin tool), login is locked for **1 minute**; further attempts return 429 with a clear message.
- `POST /auth/logout` (authenticated) → deletes the token.
- `GET /auth/verify` (authenticated) → 200 if the token is valid; the frontend calls it on page load to restore an admin session.
- `POST /auth/change-password { currentPassword, newPassword }` (authenticated) → verifies current, re-hashes with a fresh salt, rewrites `authConfig.json`, and **invalidates every session except the caller's**. Minimum new-password length: 8 characters.

### Middleware

- `requireAdmin(req, res, next)`: reads `Authorization: Bearer <token>`; missing/unknown/expired token → `401 { error: 'No autorizado' }`.

## 2. Route protection matrix

| Route | Method | Access |
|---|---|---|
| `/loans` | GET | Public (reports view computes from it) |
| `/loans`, `/loans/:id` | POST / PUT / DELETE | **Admin** |
| `/upload` | POST | **Admin** |
| `/download/:filename` | GET | **Admin** (changed from public — see §3) |
| `/delete-file/:filename` | DELETE | **Admin** |
| `/send-report`, `/schedule-report`, `/stop-report` | POST | **Admin** |
| `/report-config` | GET | **Admin** (exposes an email address; only the admin UI uses it) |
| `/auth/login` | POST | Public (rate-limited) |
| `/auth/logout`, `/auth/verify`, `/auth/change-password` | POST/GET | **Admin** |
| `/branding` | GET | Public (everyone sees the same logo/title) |
| `/branding` | PUT | **Admin** (title) |
| `/branding/logo` | GET | Public (streams current logo image) |
| `/branding/logo` | POST / DELETE | **Admin** (upload / remove) |
| `/uploads` static mount | GET | **Removed** — it bypassed the download route entirely; with downloads now admin-only it must go. The logo is served by its own route, not this mount. |

## 3. Protected downloads — mechanism

`window.open(url)` cannot carry an `Authorization` header, so the frontend switches to: `fetch(url, { headers: { Authorization } })` → response → `blob()` → `URL.createObjectURL` → programmatic `<a download="original-name">` click → revoke the object URL. Same UX (browser saves the file), but the request is authenticated. Since only admins ever see loan documents (the public view is reports-only and shows none), nothing visible changes for visitors.

## 4. Branding

- New file `backend/brandingConfig.json` (committed default): `{ "title": "Control de Préstamos", "logoFile": null }`.
- Logo files live in a dedicated `backend/branding/` directory (gitignored), never mixed with client documents in `uploads/`.
- `GET /branding` → `{ title, hasLogo, logoVersion }` (`logoVersion` = file mtime, used as a cache-busting query param).
- `POST /branding/logo` (admin): multer with an **image-only filter (PNG, JPEG, WebP)** and a **2 MB size limit**; stores as `branding/logo.<ext>`; replacing deletes the previous file. SVG is deliberately rejected (script-injection surface).
- `DELETE /branding/logo` (admin): removes the file, sets `logoFile: null`.
- `PUT /branding { title }` (admin): non-empty string, max 80 chars.
- Frontend: header renders the logo (when present) beside the title; `document.title` follows the configured title. With no config, everything looks exactly as today.

## 5. Frontend experience

**Anonymous visitor** — header (logo + title) and the Reports view exactly as it exists today: stat tiles, filters, detail table, and the PDF/Excel export buttons. No Activos/Archivo tabs, no "Nuevo Préstamo", no "Configurar Reportes". A discreet "Acceso administrador" link sits in the page footer.

**Admin** — clicking that link opens a password modal. On success: the full current UI (all tabs and actions) plus a new **Administración** panel containing: page-title field, logo upload with preview + remove button, change-password form, and "Cerrar sesión". The token is kept in `localStorage`; on page load the app calls `/auth/verify` to restore the session (valid up to 8 h). Any API response of 401 mid-session clears the token and drops the UI back to the anonymous view with a "Tu sesión expiró" notice.

## 6. Code organization

New units, each with one responsibility (existing `App.js` code is *not* refactored):

| File | Responsibility |
|---|---|
| `frontend/src/api.js` | Tiny fetch wrapper: base URL, attaches `Authorization` when a token exists, central 401 handling, blob-download helper |
| `frontend/src/LoginModal.js` | Password modal (submit, error display, lockout message) |
| `frontend/src/AdminPanel.js` | Branding form, change-password form, logout |
| `backend/server.js` | Gains: auth section (bootstrap, sessions, middleware, rate limit), branding routes, `requireAdmin` applied per the matrix |

Visual language follows the existing design system (UI constants, status-LED palette, Sora/Inter/IBM Plex Mono).

## 7. Error handling

- Wrong password → 401 `{ error: 'Contraseña incorrecta' }`; 5th failure → 429 with lockout message.
- Expired/absent token on any admin route → 401; frontend clears session and returns to public view.
- Logo upload rejections (type/size) → 400 with a specific message shown in the panel.
- Auth not configured (no `authConfig.json`, no `ADMIN_PASSWORD`) → login returns 503 `{ error: 'Autenticación no configurada en el servidor' }`.

## 8. Verification (manual — repo has no test framework)

1. Anonymous `curl -X POST /loans` (and every admin route) → 401.
2. `curl /loans` and `/branding` without token → 200.
3. Login with wrong password ×5 → 429 lockout; correct password after 1 min → token.
4. With token: create/edit/delete loan → 200; after logout the same token → 401.
5. Change password → old sessions die, old password rejected, new one works.
6. Upload logo (PNG < 2 MB) → appears for an anonymous visitor in another browser; 3 MB file and SVG → 400.
7. Document download as admin → file saves; the same URL via plain `curl` (no token) → 401; `/uploads/<file>` static path → 404.
8. Browser reload as admin within 8 h → still admin; after backend restart → back to public view.
