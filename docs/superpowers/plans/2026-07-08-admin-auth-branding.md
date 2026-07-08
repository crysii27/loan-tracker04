# Admin Auth, Public Reports View & Branding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-enforced single-admin authentication, restrict anonymous visitors to the Reports view, and give the admin a UI panel to customize the page title/logo and change the password — per the approved spec at `docs/superpowers/specs/2026-07-08-admin-auth-branding-design.md`.

**Architecture:** Session-token auth lives in `backend/server.js` (scrypt hash in `authConfig.json`, in-memory session Map, `requireAdmin` middleware). Branding config in `backend/brandingConfig.json` + `backend/branding/` for the logo file. Frontend gains three new files (`src/api.js`, `src/LoginModal.js`, `src/AdminPanel.js`) and targeted edits to `App.js` for view gating. **Task order keeps the app fully working at every step:** endpoints first (nothing protected yet), then frontend auth plumbing, and only last the protection flip on all mutating routes.

**Tech Stack:** Node/Express + Multer (already present), Node built-in `crypto` (scrypt — **no new dependencies**), React CRA, existing Tailwind design system (UI constants in App.js).

## Global Constraints

- **No new npm dependencies** on either side. Auth uses Node's built-in `crypto`.
- No automated test framework exists in this repo; verification is manual (`curl`, browser, `react-scripts build`). Do not add a test framework.
- All user-facing text in **Spanish**, matching the existing UI voice.
- New frontend UI must use the existing design-system classes (the `UI` constants object and color tokens `circuit`, `ink`, `paper`, `line`, `signal-*` defined in `frontend/tailwind.config.js`).
- Do NOT read, print, or reveal the existing secret values in `backend/credenciales.env` (EMAIL_USER/EMAIL_PASS). Appending a new line is allowed.
- Do not restructure existing `App.js` internals beyond the edits each task specifies.
- Wrong-current-password on change-password returns **403** (not 401) so the frontend's global 401 handler doesn't kill the session — deliberate deviation from the spec's §7, noted here.
- The spec's route matrix (§2) is the authority for which routes end up protected.

---

### Task 1: Backend auth core (endpoints only — no routes protected yet)

**Files:**
- Modify: `backend/server.js` (add crypto import; add auth section after the CORS/json middleware block, before `// Configuración del transporte de correo`)
- Modify: `.gitignore` (add `backend/authConfig.json` and `backend/branding/`)
- Modify: `backend/credenciales.env` (append `ADMIN_PASSWORD=ShowroomAdmin2026!` — append only, do not read the file)

**Interfaces:**
- Consumes: `process.env.ADMIN_PASSWORD` (bootstrap seed), existing `fs`/`path` imports.
- Produces: `requireAdmin(req, res, next)` middleware (used by Tasks 2 and 5); routes `POST /auth/login` → `{ token }`, `POST /auth/logout`, `GET /auth/verify` → `{ valid: true }`, `POST /auth/change-password { currentPassword, newPassword }`. Sessions: in-memory Map, 8 h TTL. Lockout: 5 fails → 60 s of 429.

- [ ] **Step 1: Add the crypto import**

In `backend/server.js`, after line 5 (`const fs = require('fs');`) add:

```js
const crypto = require('crypto');
```

- [ ] **Step 2: Add the auth section**

Insert the following block immediately after the CORS middleware block (after the `app.use(cors({ ... }));` lines and `app.use(express.json());` / `app.use('/uploads', ...)` middleware section) and before the `// Configuración del transporte de correo` comment:

```js
// ========== AUTENTICACIÓN ==========
const AUTH_CONFIG_FILE = path.join(__dirname, 'authConfig.json');

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, passwordHash };
};

const verifyPassword = (password, salt, passwordHash) => {
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(passwordHash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
};

const readAuthConfig = () => {
  try {
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error leyendo authConfig:', error);
  }
  return null;
};

const saveAuthConfig = (config) => {
  fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(config, null, 2));
};

// Primera vez: sembrar la contraseña desde ADMIN_PASSWORD (credenciales.env)
if (!readAuthConfig()) {
  if (process.env.ADMIN_PASSWORD) {
    saveAuthConfig(hashPassword(process.env.ADMIN_PASSWORD));
    console.log('authConfig.json creado a partir de ADMIN_PASSWORD.');
  } else {
    console.warn('Sin authConfig.json ni ADMIN_PASSWORD: el login de administrador queda deshabilitado hasta configurarlo.');
  }
}

// Sesiones en memoria: reiniciar el servidor cierra todas las sesiones (aceptado en el diseño)
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// Bloqueo por fuerza bruta (contador global: herramienta de un solo admin)
let failedLoginCount = 0;
let loginLockedUntil = 0;

const requireAdmin = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.authToken = token;
  next();
};

app.post('/auth/login', (req, res) => {
  if (Date.now() < loginLockedUntil) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera un minuto e intenta de nuevo.' });
  }
  const config = readAuthConfig();
  if (!config) {
    return res.status(503).json({ error: 'Autenticación no configurada en el servidor' });
  }
  const { password } = req.body || {};
  if (typeof password !== 'string' || !verifyPassword(password, config.salt, config.passwordHash)) {
    failedLoginCount += 1;
    if (failedLoginCount >= 5) {
      loginLockedUntil = Date.now() + 60 * 1000;
      failedLoginCount = 0;
    }
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  failedLoginCount = 0;
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  res.json({ token });
});

app.post('/auth/logout', requireAdmin, (req, res) => {
  sessions.delete(req.authToken);
  res.json({ success: true });
});

app.get('/auth/verify', requireAdmin, (req, res) => {
  res.json({ valid: true });
});

app.post('/auth/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const config = readAuthConfig();
  if (!config || typeof currentPassword !== 'string' || !verifyPassword(currentPassword, config.salt, config.passwordHash)) {
    return res.status(403).json({ error: 'La contraseña actual no es correcta' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  saveAuthConfig(hashPassword(newPassword));
  // Cerrar todas las demás sesiones; la del solicitante sigue viva
  for (const token of sessions.keys()) {
    if (token !== req.authToken) sessions.delete(token);
  }
  res.json({ success: true });
});
```

- [ ] **Step 3: Gitignore the new secret/asset files**

Append to `.gitignore`:

```
backend/authConfig.json
backend/branding/
```

- [ ] **Step 4: Seed the initial admin password**

Append this exact line to `backend/credenciales.env` (append blindly — do not read/print the file's existing contents):

```
ADMIN_PASSWORD=ShowroomAdmin2026!
```

- [ ] **Step 5: Verify with curl**

Start the server (`cd backend && node server.js`), confirm the log line `authConfig.json creado a partir de ADMIN_PASSWORD.`, then:

```bash
# login incorrecto → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"password":"mala"}'
# login correcto → 200 con token
TOKEN=$(curl -s -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"password":"ShowroomAdmin2026!"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
echo "token: ${TOKEN:0:8}..."
# verify con token → 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/auth/verify -H "Authorization: Bearer $TOKEN"
# verify sin token → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/auth/verify
# 5 intentos fallidos → el sexto responde 429
for i in 1 2 3 4 5; do curl -s -o /dev/null -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"password":"mala"}'; done
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"password":"mala"}'
# logout → 200, y el token queda muerto → 401
# (nota: espera el desbloqueo de 60 s o reinicia el servidor y vuelve a hacer login antes de esta parte)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/auth/logout -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/auth/verify -H "Authorization: Bearer $TOKEN"
```

Expected: `401`, token impreso, `200`, `401`, `429`, `200`, `401`. Also test change-password: login fresh, POST `/auth/change-password` with wrong current → 403, with short new password → 400, with valid pair → 200 and the old password stops working (401 on login) while the new one works. **Finally restore:** change the password back to `ShowroomAdmin2026!` so later tasks' scripts still work, and kill the server.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js .gitignore
git commit -m "feat: admin auth core - scrypt password, session tokens, login lockout"
```

---

### Task 2: Backend branding endpoints

**Files:**
- Modify: `backend/server.js` (add branding section immediately after the auth section from Task 1)
- Create: `backend/brandingConfig.json` (committed default)

**Interfaces:**
- Consumes: `requireAdmin` from Task 1, existing `multer`/`fs`/`path`.
- Produces: `GET /branding` → `{ title, hasLogo, logoVersion }` (public); `PUT /branding { title }` (admin); `GET /branding/logo` (public, streams image); `POST /branding/logo` (admin, multipart field `logo`, PNG/JPEG/WebP ≤ 2 MB); `DELETE /branding/logo` (admin).

- [ ] **Step 1: Create the default config**

Create `backend/brandingConfig.json`:

```json
{
  "title": "Control de Préstamos",
  "logoFile": null
}
```

- [ ] **Step 2: Add the branding section to server.js**

Insert immediately after the auth section (after the `/auth/change-password` route):

```js
// ========== MARCA (BRANDING) ==========
const BRANDING_CONFIG_FILE = path.join(__dirname, 'brandingConfig.json');
const BRANDING_DIR = path.join(__dirname, 'branding');

const readBrandingConfig = () => {
  try {
    if (fs.existsSync(BRANDING_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(BRANDING_CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error leyendo brandingConfig:', error);
  }
  return { title: 'Control de Préstamos', logoFile: null };
};

const saveBrandingConfig = (config) => {
  fs.writeFileSync(BRANDING_CONFIG_FILE, JSON.stringify(config, null, 2));
};

const LOGO_MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(BRANDING_DIR)) fs.mkdirSync(BRANDING_DIR, { recursive: true });
    cb(null, BRANDING_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `logo${LOGO_MIME_EXT[file.mimetype]}`);
  }
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (LOGO_MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error('Formato no permitido. Usa PNG, JPG o WebP.'));
  }
});

app.get('/branding', (req, res) => {
  const config = readBrandingConfig();
  let logoVersion = null;
  if (config.logoFile) {
    const logoPath = path.join(BRANDING_DIR, config.logoFile);
    if (fs.existsSync(logoPath)) logoVersion = fs.statSync(logoPath).mtimeMs;
  }
  res.json({ title: config.title, hasLogo: logoVersion !== null, logoVersion });
});

app.get('/branding/logo', (req, res) => {
  const config = readBrandingConfig();
  const logoPath = config.logoFile && path.join(BRANDING_DIR, config.logoFile);
  if (logoPath && fs.existsSync(logoPath)) {
    res.sendFile(logoPath);
  } else {
    res.status(404).json({ error: 'No hay logo configurado' });
  }
});

app.put('/branding', requireAdmin, (req, res) => {
  const { title } = req.body || {};
  if (typeof title !== 'string' || title.trim() === '' || title.trim().length > 80) {
    return res.status(400).json({ error: 'El título es obligatorio y debe tener máximo 80 caracteres' });
  }
  const config = readBrandingConfig();
  config.title = title.trim();
  saveBrandingConfig(config);
  res.json(config);
});

app.post('/branding/logo', requireAdmin, (req, res) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'El logo no puede superar 2 MB' : err.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }
    const config = readBrandingConfig();
    if (config.logoFile && config.logoFile !== req.file.filename) {
      const oldPath = path.join(BRANDING_DIR, config.logoFile);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    config.logoFile = req.file.filename;
    saveBrandingConfig(config);
    res.json({ success: true });
  });
});

app.delete('/branding/logo', requireAdmin, (req, res) => {
  const config = readBrandingConfig();
  if (config.logoFile) {
    const logoPath = path.join(BRANDING_DIR, config.logoFile);
    if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    config.logoFile = null;
    saveBrandingConfig(config);
  }
  res.json({ success: true });
});
```

- [ ] **Step 3: Verify with curl**

Start the server, login to get `$TOKEN` (as in Task 1 Step 5), then:

```bash
# branding público → 200 con título por defecto
curl -s http://localhost:5000/branding
# cambiar título sin token → 401; con token → 200
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:5000/branding -H "Content-Type: application/json" -d '{"title":"HPE Showroom"}'
curl -s -X PUT http://localhost:5000/branding -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"HPE Showroom"}'
# subir un logo PNG de prueba (genera uno de 1x1)
node -e "require('fs').writeFileSync('/tmp/logo-test.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'))"
curl -s -X POST http://localhost:5000/branding/logo -H "Authorization: Bearer $TOKEN" -F "logo=@/tmp/logo-test.png"
# ahora hasLogo=true y el logo se sirve públicamente → 200
curl -s http://localhost:5000/branding
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/branding/logo
# un .txt debe rechazarse → 400
echo "no soy imagen" > /tmp/fake.txt
curl -s -X POST http://localhost:5000/branding/logo -H "Authorization: Bearer $TOKEN" -F "logo=@/tmp/fake.txt"
# quitar logo → success y 404 al pedirlo
curl -s -X DELETE http://localhost:5000/branding/logo -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/branding/logo
# restaurar el título por defecto para no dejar estado de prueba
curl -s -X PUT http://localhost:5000/branding -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Control de Préstamos"}'
```

Kill the server when done.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js backend/brandingConfig.json
git commit -m "feat: branding endpoints - title config and logo upload/serve/remove"
```

---

### Task 3: Frontend api client, LoginModal, AdminPanel (new files)

**Files:**
- Create: `frontend/src/api.js`
- Create: `frontend/src/LoginModal.js`
- Create: `frontend/src/AdminPanel.js`

**Interfaces:**
- Consumes: nothing from App.js (these are leaf modules; App.js wires them in Task 4).
- Produces:
  - `api.js`: `API_URL`, `getToken()`, `setToken(t)`, `clearToken()`, `setSessionExpiredHandler(fn)`, `apiFetch(path, options)` (adds `Authorization` when a token exists; on 401 **with** a stored token clears it and fires the handler), `downloadFile(path, filename)` (authenticated blob download).
  - `LoginModal.js`: default export `LoginModal({ onSuccess, onClose })`; calls `onSuccess()` after storing the token.
  - `AdminPanel.js`: default export `AdminPanel({ branding, onBrandingChange, onLogout, onClose })`.

- [ ] **Step 1: Create `frontend/src/api.js`**

```js
// Cliente de API: agrega el token de administrador cuando existe y
// centraliza el manejo de sesión expirada.
export const API_URL = process.env.REACT_APP_API_URL || 'http://172.24.100.115:5000';

const TOKEN_KEY = 'adminToken';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

let onSessionExpired = null;
export const setSessionExpiredHandler = (fn) => { onSessionExpired = fn; };

export const apiFetch = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && token && onSessionExpired) {
    clearToken();
    onSessionExpired();
  }
  return response;
};

// Descarga autenticada: pide el archivo con token y dispara la descarga del navegador.
export const downloadFile = async (path, filename) => {
  const response = await apiFetch(path);
  if (!response.ok) throw new Error('No se pudo descargar el archivo');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 2: Create `frontend/src/LoginModal.js`**

```jsx
import React, { useState } from 'react';
import { FiLock, FiX } from 'react-icons/fi';
import { apiFetch, setToken } from './api';

const LoginModal = ({ onSuccess, onClose }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (response.ok) {
        setToken(data.token);
        onSuccess();
      } else {
        setError(data.error || 'No se pudo iniciar sesión');
      }
    } catch {
      setError('No hay conexión con el servidor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(18,22,28,0.55)' }}>
      <div className="bg-surface rounded-xl border border-line shadow-card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2">
            <FiLock className="text-circuit" /> Acceso administrador
          </h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" title="Cerrar">
            <FiX className="text-xl" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-circuit focus:border-circuit"
              autoFocus
              required
            />
          </div>
          {error && (
            <p className="text-sm font-medium text-signal-red bg-signal-red-soft border border-signal-red-line rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-circuit text-white transition-colors duration-150 hover:bg-circuit-dark focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2 disabled:opacity-50"
          >
            {busy ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
```

- [ ] **Step 3: Create `frontend/src/AdminPanel.js`**

```jsx
import React, { useState } from 'react';
import { FiImage, FiTrash2, FiLogOut, FiKey } from 'react-icons/fi';
import { API_URL, apiFetch } from './api';

const inputCls = 'w-full px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-circuit focus:border-circuit';
const labelCls = 'block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5';
const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-circuit text-white transition-colors duration-150 hover:bg-circuit-dark focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2 disabled:opacity-50';
const btnSecondary = 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-surface text-ink border border-line transition-colors duration-150 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2';
const btnDangerOutline = 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-surface text-signal-red border border-signal-red-line transition-colors duration-150 hover:bg-signal-red hover:text-white hover:border-signal-red focus:outline-none focus:ring-2 focus:ring-signal-red focus:ring-offset-2';

const AdminPanel = ({ branding, onBrandingChange, onLogout, onClose }) => {
  const [title, setTitle] = useState(branding.title);
  const [brandMsg, setBrandMsg] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passMsg, setPassMsg] = useState('');

  const saveTitle = async () => {
    setBrandMsg('');
    const response = await apiFetch('/branding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await response.json();
    if (response.ok) {
      setBrandMsg('Título guardado');
      onBrandingChange();
    } else {
      setBrandMsg(data.error || 'No se pudo guardar el título');
    }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBrandMsg('');
    const form = new FormData();
    form.append('logo', file);
    const response = await apiFetch('/branding/logo', { method: 'POST', body: form });
    const data = await response.json();
    if (response.ok) {
      setBrandMsg('Logo actualizado');
      onBrandingChange();
    } else {
      setBrandMsg(data.error || 'No se pudo subir el logo');
    }
    e.target.value = '';
  };

  const removeLogo = async () => {
    setBrandMsg('');
    const response = await apiFetch('/branding/logo', { method: 'DELETE' });
    if (response.ok) {
      setBrandMsg('Logo eliminado');
      onBrandingChange();
    } else {
      setBrandMsg('No se pudo eliminar el logo');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPassMsg('');
    if (newPassword !== confirmPassword) {
      setPassMsg('La confirmación no coincide con la nueva contraseña');
      return;
    }
    const response = await apiFetch('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    if (response.ok) {
      setPassMsg('Contraseña actualizada. Las demás sesiones se cerraron.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPassMsg(data.error || 'No se pudo cambiar la contraseña');
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-line shadow-card p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-xl font-bold text-ink">Administración</h2>
        <div className="flex gap-3">
          <button onClick={onClose} className={btnSecondary}>Cerrar</button>
          <button onClick={onLogout} className={btnDangerOutline}>
            <FiLogOut className="text-base" /> Cerrar sesión
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section>
          <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4 flex items-center gap-2">
            <FiImage className="text-circuit" /> Marca de la página
          </h3>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Título de la página</label>
              <div className="flex gap-3">
                <input type="text" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
                <button onClick={saveTitle} className={btnPrimary}>Guardar</button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Logo (PNG, JPG o WebP, máx. 2 MB)</label>
              {branding.hasLogo && (
                <div className="flex items-center gap-4 mb-3">
                  <img
                    src={`${API_URL}/branding/logo?v=${branding.logoVersion}`}
                    alt="Logo actual"
                    className="h-12 w-auto rounded border border-line bg-paper p-1"
                  />
                  <button onClick={removeLogo} className={btnDangerOutline}>
                    <FiTrash2 className="text-base" /> Quitar logo
                  </button>
                </div>
              )}
              <label className={`${btnSecondary} cursor-pointer`}>
                <FiImage className="text-base" /> {branding.hasLogo ? 'Reemplazar logo' : 'Subir logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} className="hidden" />
              </label>
            </div>
            {brandMsg && <p className="text-sm font-medium text-ink-muted">{brandMsg}</p>}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4 flex items-center gap-2">
            <FiKey className="text-circuit" /> Cambiar contraseña
          </h3>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className={labelCls}>Contraseña actual</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Nueva contraseña (mínimo 8 caracteres)</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} minLength={8} required />
            </div>
            <div>
              <label className={labelCls}>Confirmar nueva contraseña</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} minLength={8} required />
            </div>
            <button type="submit" className={btnPrimary}>Actualizar contraseña</button>
            {passMsg && <p className="text-sm font-medium text-ink-muted">{passMsg}</p>}
          </form>
        </section>
      </div>
    </div>
  );
};

export default AdminPanel;
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && node_modules/.bin/react-scripts build 2>&1 | tail -15`
Expected: build succeeds. The new files are not yet imported by App.js, so CRA may warn about unused files — that's fine; Task 4 wires them.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.js frontend/src/LoginModal.js frontend/src/AdminPanel.js
git commit -m "feat: api client with auth token handling, LoginModal, AdminPanel components"
```

---

### Task 4: App.js integration — auth state, view gating, branding header

**Files:**
- Modify: `frontend/src/App.js`

**Interfaces:**
- Consumes: everything Task 3 produces (`api.js` exports, `LoginModal`, `AdminPanel`).
- Produces: the final UX — anonymous visitors see branding header + Reports view + footer "Acceso administrador" link; admins see the full UI + Administración panel. All mutating calls go through `apiFetch` (so they carry the token once Task 5 protects the routes).

Apply these edits in order. Every "before" anchor below exists verbatim in the current file.

- [ ] **Step 1: Imports and API_URL**

Replace:

```js
import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiPaperclip, FiSearch, FiFileText, FiArchive, FiDownload, FiMail, FiSettings, FiChevronDown, FiChevronUp } from 'react-icons/fi';

// URL del servidor - configurable vía REACT_APP_API_URL en frontend/.env
const API_URL = process.env.REACT_APP_API_URL || 'http://172.24.100.115:5000';
```

with:

```js
import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiPaperclip, FiSearch, FiFileText, FiArchive, FiDownload, FiMail, FiSettings, FiChevronDown, FiChevronUp, FiLock, FiSliders } from 'react-icons/fi';
import { API_URL, apiFetch, getToken, clearToken, setSessionExpiredHandler, downloadFile } from './api';
import LoginModal from './LoginModal';
import AdminPanel from './AdminPanel';
```

- [ ] **Step 2: New state**

After the line `const [sortBy, setSortBy] = useState('creation');` add:

```js
  // Autenticación y marca
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [branding, setBranding] = useState({ title: 'Control de Préstamos', hasLogo: false, logoVersion: null });

  const loadBranding = async () => {
    try {
      const response = await apiFetch('/branding');
      if (response.ok) setBranding(await response.json());
    } catch (error) {
      console.error('Error cargando la marca:', error);
    }
  };

  const handleLogout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch { /* sin conexión: igual cerramos localmente */ }
    clearToken();
    setIsAdmin(false);
    setShowAdminPanel(false);
    setShowForm(false);
    setShowReportConfig(false);
  };
```

- [ ] **Step 3: Session restore + branding effects**

After the existing `useEffect(() => { fetchLoans(); }, []);` block add:

```js
  // Restaurar sesión de admin (si hay token válido) y luego instalar el manejador de expiración
  useEffect(() => {
    const restoreSession = async () => {
      const token = getToken();
      if (token) {
        try {
          const response = await fetch(`${API_URL}/auth/verify`, { headers: { Authorization: `Bearer ${token}` } });
          if (response.ok) setIsAdmin(true);
          else clearToken();
        } catch { /* backend inalcanzable: se queda como visitante */ }
      }
      setSessionExpiredHandler(() => {
        clearToken();
        setIsAdmin(false);
        setShowAdminPanel(false);
        setShowForm(false);
        setShowReportConfig(false);
        alert('Tu sesión expiró. Vuelve a iniciar sesión.');
      });
    };
    restoreSession();
    loadBranding();
  }, []);

  // El título configurado también nombra la pestaña del navegador
  useEffect(() => {
    document.title = branding.title;
  }, [branding.title]);
```

- [ ] **Step 4: Gate the report-config fetch to admins**

Replace the existing report-config effect (the `useEffect` whose body defines `fetchReportConfig` and ends with `}, []);`) so it only runs for admins:

```js
  // Cargar configuración de reportes (solo admin: la ruta queda protegida)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchReportConfig = async () => {
      try {
        const response = await apiFetch('/report-config');
        if (!response.ok) return;
        const config = await response.json();
        if (config && config.isScheduled) {
          setReportConfig({
            email: config.email,
            frequency: config.frequency,
            isScheduled: config.isScheduled
          });
        }
      } catch (error) {
        console.error('Error cargando configuración de reportes:', error);
      }
    };
    fetchReportConfig();
  }, [isAdmin]);
```

- [ ] **Step 5: Gate the status-updater to admins**

The `updateLoanStatuses` effect PUTs status changes; anonymous browsers must not attempt them. Replace:

```js
  useEffect(() => {
    if (loans.length > 0) {
      updateLoanStatuses();
      const interval = setInterval(updateLoanStatuses, 60000);
      return () => clearInterval(interval);
    }
  }, [loans]);
```

with:

```js
  useEffect(() => {
    if (isAdmin && loans.length > 0) {
      updateLoanStatuses();
      const interval = setInterval(updateLoanStatuses, 60000);
      return () => clearInterval(interval);
    }
  }, [loans, isAdmin]);
```

- [ ] **Step 6: Route every mutating call through `apiFetch`**

Make these mechanical replacements throughout the file (same options object, only the function and URL form change):

| Current call | New call |
|---|---|
| `fetch(\`${API_URL}/loans/${loan.id}\`, {` (inside `updateLoanStatuses`) | `apiFetch(\`/loans/${loan.id}\`, {` |
| `fetch(\`${API_URL}/upload\`, {` | `apiFetch('/upload', {` |
| `fetch(\`${API_URL}/loans/${editingId}\`, {` | `apiFetch(\`/loans/${editingId}\`, {` |
| `fetch(\`${API_URL}/loans\`, { method: 'POST',` | `apiFetch('/loans', { method: 'POST',` |
| `fetch(\`${API_URL}/loans/${id}\`, {` (in `handleStatusChange` and `handleDeleteLoan`) | `apiFetch(\`/loans/${id}\`, {` |
| `fetch(\`${API_URL}/delete-file/${documentName}\`, {` | `apiFetch(\`/delete-file/${documentName}\`, {` |
| `fetch(\`${API_URL}/loans/${loanId}\`, {` (in `handleDeleteDocument`) | `apiFetch(\`/loans/${loanId}\`, {` |
| `fetch(\`${API_URL}/send-report\`, {` | `apiFetch('/send-report', {` |
| `fetch(\`${API_URL}/schedule-report\`, {` | `apiFetch('/schedule-report', {` |
| `fetch(\`${API_URL}/stop-report\`, {` | `apiFetch('/stop-report', {` |

Leave `fetchLoans`'s `fetch(\`${API_URL}/loans\`)` GET as is or switch to `apiFetch('/loans')` — either works (route stays public); prefer `apiFetch` for consistency.

- [ ] **Step 7: Authenticated downloads**

Replace:

```js
  const handleDownloadDocument = (documentName) => {
    window.open(`${API_URL}/download/${documentName}`, '_blank');
  };
```

with:

```js
  const handleDownloadDocument = async (documentName) => {
    try {
      await downloadFile(`/download/${encodeURIComponent(documentName)}`, documentName);
    } catch (error) {
      console.error('Error descargando documento:', error);
      alert('No se pudo descargar el documento');
    }
  };
```

- [ ] **Step 8: Branded header + admin-gated action buttons**

Replace the header block (from `<div className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 gap-6">` through its matching closing `</div>` that sits just before `{showForm && (`) with:

```jsx
        <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 gap-6">
          <div className="flex items-center gap-4">
            {branding.hasLogo && (
              <img
                src={`${API_URL}/branding/logo?v=${branding.logoVersion}`}
                alt={branding.title}
                className="h-14 w-auto"
              />
            )}
            <div>
              <p className="font-mono text-xs font-medium text-ink-muted uppercase tracking-widest mb-2">Showroom · Gestión de Activos</p>
              <h1 className="font-display text-3xl font-bold text-ink tracking-tight">{branding.title}</h1>
              <p className="text-sm text-ink-muted mt-1">
                {isAdmin ? 'Gestiona y controla todos los préstamos de equipos en un solo lugar' : 'Reporte de préstamos de equipos del showroom'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setEditingId(null);
                  setFormData({
                    client: '',
                    partner: '',
                    responsible: '',
                    loanDate: '',
                    returnDate: '',
                    comments: '',
                    document: null,
                    devices: [{ equipmentName: '', equipmentSerial: '' }],
                  });
                  setShowForm(true);
                }}
                className={UI.btnPrimary}
              >
                <FiPlus className="text-base" /> Nuevo Préstamo
              </button>
              <button
                onClick={() => setShowReportConfig(true)}
                className={UI.btnSecondary}
              >
                <FiSettings className="text-base" /> Configurar Reportes
              </button>
              <button
                onClick={() => setShowAdminPanel(true)}
                className={UI.btnSecondary}
              >
                <FiSliders className="text-base" /> Administración
              </button>
            </div>
          )}
        </div>

        {showAdminPanel && (
          <AdminPanel
            branding={branding}
            onBrandingChange={loadBranding}
            onLogout={handleLogout}
            onClose={() => setShowAdminPanel(false)}
          />
        )}
```

- [ ] **Step 9: Gate search/sort and tabs to admins**

Wrap the search/sort block: change `<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">` ... `</div>` (the block containing the FiSearch input and the "Ordenar por" select) into `{isAdmin && ( ...that block... )}`.

Wrap the tabs row the same way: `{isAdmin && ( <div className="flex gap-6 border-b border-line mb-6"> ... </div> )}`.

- [ ] **Step 10: Content conditions for anonymous vs admin**

Change `{activeTab === 'reportes' && (` to `{(!isAdmin || activeTab === 'reportes') && (` — anonymous visitors always see the reports content.

Change `{activeTab !== 'reportes' && (` to `{isAdmin && activeTab !== 'reportes' && (` — the loan list is admin-only.

Wrap the bottom stat-tiles grid (`<div className="grid grid-cols-2 md:grid-cols-4 gap-4">` ... `</div>`, the last block before the container closes) in `{isAdmin && ( ... )}` — the public reports view already has its own stat tiles.

- [ ] **Step 11: Footer login link + login modal**

Immediately after the (now admin-gated) bottom stat-tiles block, before the two closing `</div>`s of the page container, add:

```jsx
        {!isAdmin && (
          <footer className="mt-10 flex justify-center">
            <button
              onClick={() => setShowLogin(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors duration-150 hover:text-circuit"
            >
              <FiLock className="text-xs" /> Acceso administrador
            </button>
          </footer>
        )}

        {showLogin && (
          <LoginModal
            onSuccess={() => { setShowLogin(false); setIsAdmin(true); }}
            onClose={() => setShowLogin(false)}
          />
        )}
```

- [ ] **Step 12: Verify in browser**

`cd frontend && node_modules/.bin/react-scripts build 2>&1 | tail -15` → compiles. Then with backend + `npm start` running:
1. Anonymous (no token in localStorage): only header + reports view + footer link visible. No tabs, no action buttons, no bottom tiles.
2. Click "Acceso administrador" → wrong password shows "Contraseña incorrecta"; right password (`ShowroomAdmin2026!`) reveals the full UI.
3. "Administración" opens the panel: change the title → header and browser tab update for you AND for an incognito (anonymous) window; upload a PNG logo → appears in both; remove it.
4. Reload as admin → still admin. "Cerrar sesión" → back to anonymous view.
5. Download a loan document as admin → file saves normally.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/App.js
git commit -m "feat: role-gated UI - public reports view, admin login, branding header, admin panel"
```

---

### Task 5: Protection flip — apply `requireAdmin` per the route matrix

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `requireAdmin` (Task 1). Frontend already sends tokens (Tasks 3–4), so nothing breaks.
- Produces: the spec §2 matrix enforced server-side.

- [ ] **Step 1: Remove the static uploads mount**

Delete this line (it would bypass the protected download route entirely):

```js
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
```

- [ ] **Step 2: Add `requireAdmin` to every mutating/sensitive route**

Change each route signature (handler bodies untouched):

```js
app.post('/loans', requireAdmin, (req, res) => {
app.put('/loans/:id', requireAdmin, (req, res) => {
app.delete('/loans/:id', requireAdmin, (req, res) => {
app.post('/upload', requireAdmin, upload.single('file'), (req, res) => {
app.get('/download/:filename', requireAdmin, (req, res) => {
app.delete('/delete-file/:filename', requireAdmin, (req, res) => {
app.post('/send-report', requireAdmin, async (req, res) => {
app.get('/report-config', requireAdmin, (req, res) => {
app.post('/schedule-report', requireAdmin, (req, res) => {
app.post('/stop-report', requireAdmin, (req, res) => {
```

`GET /loans`, `GET /branding`, `GET /branding/logo`, `POST /auth/login`, and `GET /` stay public. The branding admin routes already carry `requireAdmin` from Task 2.

- [ ] **Step 3: Verify the full matrix with curl**

Server running:

```bash
B=http://localhost:5000
# Público → 200
for r in "/loans" "/branding" "/"; do curl -s -o /dev/null -w "GET $r %{http_code}\n" $B$r; done
# Sin token → 401 en todo lo protegido
curl -s -o /dev/null -w "POST /loans %{http_code}\n" -X POST $B/loans -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "PUT /loans/1 %{http_code}\n" -X PUT $B/loans/1 -H "Content-Type: application/json" -d '{"status":"activo"}'
curl -s -o /dev/null -w "DELETE /loans/999 %{http_code}\n" -X DELETE $B/loans/999
curl -s -o /dev/null -w "POST /upload %{http_code}\n" -X POST $B/upload
curl -s -o /dev/null -w "GET /download/x %{http_code}\n" $B/download/x
curl -s -o /dev/null -w "DELETE /delete-file/x %{http_code}\n" -X DELETE $B/delete-file/x
curl -s -o /dev/null -w "GET /report-config %{http_code}\n" $B/report-config
curl -s -o /dev/null -w "POST /send-report %{http_code}\n" -X POST $B/send-report -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "POST /schedule-report %{http_code}\n" -X POST $B/schedule-report -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "POST /stop-report %{http_code}\n" -X POST $B/stop-report
# La ruta estática /uploads ya no existe → 404
curl -s -o /dev/null -w "GET /uploads/anything %{http_code}\n" $B/uploads/anything
# Con token → operaciones normales funcionan
TOKEN=$(curl -s -X POST $B/auth/login -H "Content-Type: application/json" -d '{"password":"ShowroomAdmin2026!"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
curl -s -o /dev/null -w "GET /report-config (token) %{http_code}\n" $B/report-config -H "Authorization: Bearer $TOKEN"
# Descarga real con token de un archivo existente en uploads/ → 200
FILE=$(ls backend/uploads | head -1)
curl -s -o /dev/null -w "GET /download (token) %{http_code}\n" "$B/download/$(python3 - <<EOF
import urllib.parse; print(urllib.parse.quote("""$FILE"""))
EOF
)" -H "Authorization: Bearer $TOKEN"
```

Expected: three 200s, then eleven 401s/404 as labeled, then 200 and 200. Also do one full end-to-end pass in the browser as admin (create a test loan and delete it) to confirm the UI still works against the now-protected backend.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat: enforce admin auth on all mutating routes, remove open uploads mount"
```

---

## Self-Review Notes

- **Spec coverage:** §1 auth → Task 1; §2 matrix + static-mount removal → Task 5 (branding admin routes carry middleware from Task 2); §3 protected downloads → Task 4 Step 7 + api.js `downloadFile`; §4 branding → Tasks 2–4; §5 experience → Task 4; §6 code organization → Task 3; §7 error handling → distributed (403 deviation documented in Global Constraints); §8 verification → Task 1 Step 5, Task 2 Step 3, Task 4 Step 12, Task 5 Step 3.
- **Working app at every step:** protection lands last (Task 5), after the frontend already sends tokens — no intermediate broken state.
- **Type consistency check:** `branding` shape `{ title, hasLogo, logoVersion }` consistent across Task 2 (endpoint), Task 3 (AdminPanel props), Task 4 (state + header). Token key `adminToken`, header `Authorization: Bearer`, consistent everywhere.
- **Post-completion user action:** the seeded password `ShowroomAdmin2026!` must be changed by the user from the Administración panel on first login.
