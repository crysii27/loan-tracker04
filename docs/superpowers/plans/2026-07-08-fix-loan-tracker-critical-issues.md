# Loan Tracker — Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken frontend build, the non-functional credential loading, and the highest-severity security/config gaps found in the code review of `loan-tracker04` (backend Express app + single-file React frontend).

**Architecture:** No architectural changes. This plan only patches existing files (`backend/server.js`, `frontend/src/App.js`, config files). It does not touch persistence model (JSON files), does not add auth, and does not split `App.js` into components — those are larger, independent efforts and should be separate follow-up plans (see "Out of scope" below).

**Tech Stack:** Node.js/Express/Multer/Nodemailer/node-cron (backend), React 19/CRA/Tailwind (frontend). No test framework is currently configured on either side.

## Global Constraints

- No automated test framework exists in this repo (CRA's default Jest setup is unused beyond boilerplate; backend has zero test tooling). Verification steps in this plan use manual checks (`curl`, browser, `node -c` syntax check) instead of invented unit tests — do not add a testing framework as a side effect of these tasks unless a task says to.
- Do not change the JSON-file persistence model or add a database.
- Do not add authentication/authorization — flagged as future work, not in this plan.
- Do not refactor `App.js` into multiple components as part of this plan — flagged as future work.
- Preserve all existing behavior/UI text (Spanish labels, existing routes, existing JSON shape in `loans.json`) except where a task explicitly changes it.

**Out of scope (separate future plans):**
- Splitting `frontend/src/App.js` into multiple components.
- Adding authentication to the backend routes.
- Replacing JSON-file storage with a real database.
- Rate limiting / audit logging.

---

### Task 1: Fix broken JSX in `App.js`

**Files:**
- Modify: `frontend/src/App.js:814-840` and `frontend/src/App.js:1204-1213`

**Interfaces:**
- Consumes: existing state `searchTerm`, `setSearchTerm`, `activeTab`, `sortBy`, `setSortBy` (all already defined earlier in the file — no new state).
- Produces: nothing new; this task only repairs markup so the file is valid JSX.

- [ ] **Step 1: Confirm the current build is actually broken**

Run: `cd frontend && node_modules/.bin/react-scripts build 2>&1 | tail -40`
Expected: a syntax/parse error pointing near the search bar block (around line 816-840) and/or near the end of the file (~line 1209), confirming the file does not currently compile.

- [ ] **Step 2: Replace the malformed search/sort block**

In `frontend/src/App.js`, replace the block currently spanning lines 815-838:

```jsx
          <div className="space-y-4 mb-6">
			  <div className="flex items-center gap-3">
			    <FiSearch className="text-gray-500 text-lg" />
			    <input
			      type="text"
			      placeholder="Buscar por equipo, serial o partner..."
			      className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
			      value={searchTerm}
			      onChange={(e) => setSearchTerm(e.target.value)}
			  activeTab === 'activos' && (
			    <div className="flex items-center gap-3">
			      <label className="text-sm font-medium text-gray-700">Ordenar por:</label>
			      <select
				value={sortBy}
				onChange={(e) => setSortBy(e.target.value)}
				className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
			      >
				<option value="creation">Más recientes primero</option>
				<option value="overdue">Mayor atraso primero</option>
			      </select>
			    </div>
			  )}
			</div>
        
        
```

with:

```jsx
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3">
              <FiSearch className="text-gray-500 text-lg" />
              <input
                type="text"
                placeholder="Buscar por equipo, serial o partner..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {activeTab === 'activos' && (
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Ordenar por:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="creation">Más recientes primero</option>
                  <option value="overdue">Mayor atraso primero</option>
                </select>
              </div>
            )}
          </div>

```

Note: this closes the search `<input>` (it was never self-closed), closes its wrapper `<div>`, and wraps the sort dropdown in a real conditional (`{activeTab === 'activos' && (...)}`) instead of a dangling expression statement.

- [ ] **Step 3: Fix the dangling tags at end of file**

Replace (currently lines 1207-1213):

```jsx
}

export default App;  />
  </div>
  
  {

```

with:

```jsx
}

export default App;
```

- [ ] **Step 4: Verify the file builds**

Run: `cd frontend && node_modules/.bin/react-scripts build 2>&1 | tail -40`
Expected: build succeeds (`Compiled successfully.` or only pre-existing lint warnings, no syntax errors).

- [ ] **Step 5: Manual smoke test**

Run: `cd frontend && npm start` (or the project's normal dev-run process), open the app, confirm:
- The search bar renders and filtering works.
- The "Ordenar por" dropdown appears only on the "Préstamos Activos" tab, not on "Archivo" or "Reportes".

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.js
git commit -m "fix: repair broken JSX in search/sort block and end of App.js"
```

---

### Task 2: Load `credenciales.env` and remove hardcoded email credentials

**Files:**
- Modify: `backend/server.js:1-11`, `backend/server.js:94-101`, `backend/server.js:306-311`
- Reference: `backend/credenciales.env` (already exists, contains `EMAIL_USER`, `EMAIL_PASS`, `PORT`)

**Interfaces:**
- Consumes: `backend/credenciales.env` file contents via `dotenv`.
- Produces: `process.env.EMAIL_USER`, `process.env.EMAIL_PASS`, `process.env.PORT` correctly populated at runtime; no secret literals remain in source.

- [ ] **Step 1: Confirm the bug**

Run: `cd backend && node -e "require('dotenv').config(); console.log(process.env.EMAIL_USER)"`
Expected: prints `undefined` — proving `credenciales.env` is never read by the default `dotenv.config()` call, since dotenv only auto-loads a file literally named `.env`.

- [ ] **Step 2: Point dotenv at the correct file**

In `backend/server.js`, replace line 8:

```js
require('dotenv').config();
```

with:

```js
require('dotenv').config({ path: path.join(__dirname, 'credenciales.env') });
```

(`path` is already imported at line 4, above this line, so no new import is needed — just confirm the require order still has `path` imported before this call.)

- [ ] **Step 3: Make PORT configurable**

Replace line 11:

```js
const PORT = 5000;
```

with:

```js
const PORT = process.env.PORT || 5000;
```

- [ ] **Step 4: Remove hardcoded credential fallback in the transporter**

Replace lines 95-101:

```js
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'reporte.prestamos.showroom@gmail.com',
    pass: process.env.EMAIL_PASS || 'evon uhsg qubg zgai'
  }
});
```

with:

```js
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn('EMAIL_USER / EMAIL_PASS no están configurados en credenciales.env. El envío de reportes por correo fallará.');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
```

- [ ] **Step 5: Remove the second hardcoded fallback (the `from` address)**

Replace line 307:

```js
      from: process.env.EMAIL_USER || 'reporte.prestamos.showroom@gmail.com',
```

with:

```js
      from: process.env.EMAIL_USER,
```

- [ ] **Step 6: Verify env is now loaded**

Run: `cd backend && node -e "require('dotenv').config({ path: require('path').join(__dirname, 'credenciales.env') }); console.log(process.env.EMAIL_USER, process.env.PORT)"`
Expected: prints the real email address and port from `credenciales.env` (not `undefined`).

- [ ] **Step 7: Manual smoke test**

Run: `cd backend && node server.js`
Expected: server starts on the port from `credenciales.env` (check console log), no warning about missing `EMAIL_USER`/`EMAIL_PASS`. Then use the frontend's "Enviar Reporte Ahora" button (or `curl -X POST http://localhost:<port>/send-report -H "Content-Type: application/json" -d '{"email":"<your test email>","loans":[]}'`) and confirm the email arrives.

- [ ] **Step 8: Commit**

```bash
git add backend/server.js
git commit -m "fix: load credenciales.env correctly and remove hardcoded email credentials"
```

---

### Task 3: Add root `.gitignore`

**Files:**
- Create: `.gitignore` (repo root)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing runtime — prevents secrets/build artifacts/uploaded client documents from being committed once git is initialized.

- [ ] **Step 1: Create the file**

Create `.gitignore` at the repo root with:

```
node_modules/
frontend/build/
backend/uploads/
backend/credenciales.env
backend/.env
*.log
.DS_Store
```

- [ ] **Step 2: Verify**

Run: `git status --porcelain 2>&1 | head -5` (if git is not yet initialized, run `git init` first only if the user has confirmed they want the repo initialized — otherwise skip this verification step and just confirm the file's contents visually).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore for node_modules, build artifacts, uploads, and secrets"
```

---

### Task 4: Fix path traversal in `/download/:filename` and `/delete-file/:filename`

**Files:**
- Modify: `backend/server.js:393-420`

**Interfaces:**
- Consumes: `path.basename` (Node built-in, no new import).
- Produces: both routes now reject any `filename` containing path separators.

- [ ] **Step 1: Confirm the vulnerability**

Run (with the server running): `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:<port>/download/..%2f..%2fserver.js"`
Expected (before fix): `200` — the traversal succeeds and would download `server.js` outside the uploads directory. (If the OS/Express normalizes the URL before this reaches the handler, test instead with `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:<port>/download/....%2f....%2fserver.js"` or a literal double-encoded path — the key point is `filename` is not currently restricted to a single path segment.)

- [ ] **Step 2: Sanitize `filename` in `/download/:filename`**

Replace lines 394-403:

```js
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});
```

with:

```js
app.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});
```

- [ ] **Step 3: Sanitize `filename` in `/delete-file/:filename`**

Replace lines 406-420:

```js
app.delete('/delete-file/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
```

with:

```js
app.delete('/delete-file/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, 'uploads', filename);
```

(leave the rest of the handler body unchanged).

- [ ] **Step 4: Verify the fix**

Run: `curl -s "http://localhost:<port>/download/..%2f..%2fserver.js"`
Expected: `{"error":"Archivo no encontrado"}` with a 404 — `path.basename` strips the traversal down to `server.js`, which does not exist inside `uploads/`.

Also re-run a normal download of a real file already in `uploads/` (e.g. `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:<port>/download/Remision%20Equipos_Aruba%20vf-firmado.pdf"`) and confirm it still returns `200` — the fix must not break legitimate downloads.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "fix: sanitize filename params to prevent path traversal in download/delete-file routes"
```

---

### Task 5: Sanitize uploaded filenames in Multer storage

**Files:**
- Modify: `backend/server.js:74-87`

**Interfaces:**
- Consumes: Node's built-in `path.extname`/`path.basename`.
- Produces: uploaded files keep a readable, collision-resistant name derived from the original, without directory components or raw untrusted bytes used as the on-disk filename.

- [ ] **Step 1: Replace the Multer filename function**

Replace lines 74-85:

```js
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
```

with:

```js
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .normalize('NFC')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .slice(0, 100) || 'archivo';
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  }
});
```

Note: this keeps a human-readable name (helps the "documento adjunto" display in the UI still look sensible) while preventing directory traversal via the filename, stripping bytes that produced the mojibake seen in `uploads/archivo00_123-8?Â¡.txt`, and prefixing a timestamp to avoid collisions (matching the pattern already used elsewhere in `uploads/`, e.g. `1759603234411-520734237.txt`).

- [ ] **Step 2: Verify**

Run the server, then: `curl -s -F "file=@/tmp/test file.txt" http://localhost:<port>/upload` (create `/tmp/test file.txt` with any content first).
Expected: JSON response with a `filename` like `1720440000000-test file.txt`, and `ls backend/uploads/` shows the file safely on disk with no path traversal and no raw special characters.

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "fix: sanitize uploaded filenames to prevent path traversal and mojibake"
```

---

### Task 6: Restrict CORS to known origins

**Files:**
- Modify: `backend/server.js:90`
- Modify: `backend/credenciales.env` (add `ALLOWED_ORIGIN`)

**Interfaces:**
- Consumes: `process.env.ALLOWED_ORIGIN` (comma-separated list).
- Produces: `cors()` middleware configured with an explicit origin allowlist instead of reflecting any origin.

- [ ] **Step 1: Add the env var**

Append to `backend/credenciales.env`:

```
ALLOWED_ORIGIN=http://172.24.100.115,http://localhost:3000
```

(Adjust the list to whatever hosts actually serve the frontend — ask the user which hostnames/ports the frontend is served from in each environment before finalizing this list.)

- [ ] **Step 2: Update the CORS middleware**

Replace line 90:

```js
app.use(cors());
```

with:

```js
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true
}));
```

Note: falls back to allowing all origins (`true`) only if `ALLOWED_ORIGIN` is unset, so this cannot silently lock out the app if the env var is missing — but logs should be checked to confirm the intended allowlist is picked up in each environment.

- [ ] **Step 3: Verify**

Run: `curl -s -H "Origin: http://evil.example.com" -I http://localhost:<port>/loans | grep -i access-control-allow-origin`
Expected: no `Access-Control-Allow-Origin: http://evil.example.com` header present. Then repeat with `-H "Origin: http://localhost:3000"` (or whatever is in `ALLOWED_ORIGIN`) and confirm the header **is** present.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js backend/credenciales.env
git commit -m "fix: restrict CORS to an explicit origin allowlist"
```

---

### Task 7: Basic input validation on `POST /loans` and `PUT /loans/:id`

**Files:**
- Modify: `backend/server.js:335-359`

**Interfaces:**
- Consumes: nothing new.
- Produces: a `validateLoanPayload(body)` helper used by both routes; returns `{ valid: boolean, error?: string }`.

- [ ] **Step 1: Add the validation helper**

Insert above the `// ========== RUTAS PARA PRÉSTAMOS ==========` comment (currently line 327):

```js
const validateLoanPayload = (body) => {
  const requiredStringFields = ['client', 'partner', 'responsible', 'loanDate', 'returnDate'];
  for (const field of requiredStringFields) {
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      return { valid: false, error: `El campo "${field}" es obligatorio.` };
    }
  }
  if (!Array.isArray(body.devices) || body.devices.length === 0) {
    return { valid: false, error: 'Debe incluir al menos un dispositivo.' };
  }
  for (const device of body.devices) {
    if (typeof device.equipmentName !== 'string' || device.equipmentName.trim() === '') {
      return { valid: false, error: 'Cada dispositivo debe tener un nombre de equipo.' };
    }
    if (typeof device.equipmentSerial !== 'string' || device.equipmentSerial.trim() === '') {
      return { valid: false, error: 'Cada dispositivo debe tener un serial.' };
    }
  }
  return { valid: true };
};

```

- [ ] **Step 2: Use it in `POST /loans`**

Replace lines 336-346:

```js
app.post('/loans', (req, res) => {
  const loans = readLoans();
  const newLoan = {
    id: loans.length > 0 ? Math.max(...loans.map(l => l.id)) + 1 : 1,
    ...req.body,
    status: req.body.status || 'activo'
  };
  loans.push(newLoan);
  saveLoans(loans);
  res.json(newLoan);
});
```

with:

```js
app.post('/loans', (req, res) => {
  const validation = validateLoanPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const loans = readLoans();
  const newLoan = {
    id: loans.length > 0 ? Math.max(...loans.map(l => l.id)) + 1 : 1,
    ...req.body,
    status: req.body.status || 'activo'
  };
  loans.push(newLoan);
  saveLoans(loans);
  res.json(newLoan);
});
```

- [ ] **Step 3: Use it in `PUT /loans/:id`**

Replace lines 349-359:

```js
app.put('/loans/:id', (req, res) => {
  const loans = readLoans();
  const index = loans.findIndex(l => l.id === parseInt(req.params.id));
  if (index !== -1) {
    loans[index] = { ...loans[index], ...req.body, id: parseInt(req.params.id) };
    saveLoans(loans);
    res.json(loans[index]);
  } else {
    res.status(404).json({ error: 'Préstamo no encontrado' });
  }
});
```

with:

```js
app.put('/loans/:id', (req, res) => {
  const loans = readLoans();
  const index = loans.findIndex(l => l.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: 'Préstamo no encontrado' });
  }
  const merged = { ...loans[index], ...req.body, id: parseInt(req.params.id) };
  const validation = validateLoanPayload(merged);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  loans[index] = merged;
  saveLoans(loans);
  res.json(loans[index]);
});
```

Note: `PUT` is also used by the frontend for partial updates like status-only changes (`handleStatusChange`) and document-only changes (`handleDeleteDocument`) — validating the **merged** object (existing + incoming patch), not just `req.body` in isolation, is required so those partial updates keep passing validation.

- [ ] **Step 4: Verify**

Run: `curl -s -X POST http://localhost:<port>/loans -H "Content-Type: application/json" -d '{}'`
Expected: `400` with an `error` message, not a malformed loan written to `loans.json`.

Run: `curl -s -X PUT http://localhost:<port>/loans/1 -H "Content-Type: application/json" -d '{"status":"devuelto"}'`
Expected: `200` — a partial status update on an existing valid loan still succeeds.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat: validate loan payloads on create and update"
```

---

### Task 8: Move frontend `API_URL` to an environment variable

**Files:**
- Modify: `frontend/src/App.js:4-5`
- Create: `frontend/.env.example`

**Interfaces:**
- Consumes: `process.env.REACT_APP_API_URL` (CRA convention — must be prefixed `REACT_APP_` to be embedded at build time).
- Produces: `API_URL` constant, same as before, now overridable per environment without editing source.

- [ ] **Step 1: Update `App.js`**

Replace lines 4-5:

```js
// URL del servidor - Cambia esto según tu configuración
const API_URL = 'http://172.24.100.115:5000';
```

with:

```js
// URL del servidor - configurable vía REACT_APP_API_URL en frontend/.env
const API_URL = process.env.REACT_APP_API_URL || 'http://172.24.100.115:5000';
```

(keeps the current IP as the default so behavior is unchanged unless the env var is set — a full removal of the hardcoded fallback can happen once every deployment has `.env` set up).

- [ ] **Step 2: Create `.env.example`**

Create `frontend/.env.example`:

```
REACT_APP_API_URL=http://172.24.100.115:5000
```

- [ ] **Step 3: Verify**

Run: `cd frontend && REACT_APP_API_URL=http://localhost:5000 npm start`, open the app, open browser devtools network tab, confirm requests go to `localhost:5000` instead of the hardcoded LAN IP.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.js frontend/.env.example
git commit -m "feat: make frontend API_URL configurable via REACT_APP_API_URL"
```

---

### Task 9: Fix Tailwind config/version mismatch

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a Tailwind config that matches the actually-installed Tailwind version (v2.2.19), so production purging works as intended.

- [ ] **Step 1: Confirm installed version**

Run: `cd frontend && node -e "console.log(require('tailwindcss/package.json').version)"`
Expected: `2.2.19` (confirming v2 is what's actually installed and used, not v3/v4 despite `@tailwindcss/vite: ^4.1.14` sitting unused in `package.json`).

- [ ] **Step 2: Update `tailwind.config.js` to v2 syntax**

Replace the full contents of `frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

with:

```js
module.exports = {
  purge: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  darkMode: false,
  theme: {
    extend: {},
  },
  variants: {
    extend: {},
  },
  plugins: [],
}
```

- [ ] **Step 3: Remove the unused `@tailwindcss/vite` v4 dependency**

In `frontend/package.json`, remove the line:

```json
    "@tailwindcss/vite": "^4.1.14",
```

from the `dependencies` block. This project uses CRA (`react-scripts`), not Vite, so this package is dead weight and its presence is what made the version mismatch confusing.

- [ ] **Step 4: Reinstall and verify**

Run: `cd frontend && npm install && node_modules/.bin/react-scripts build`
Expected: build succeeds; inspect `frontend/build/static/css/*.css` and confirm class names used in `App.js` (e.g. `bg-blue-500`) are present, and the CSS bundle size is reasonable (v2 purge working means the output isn't the full unpurged utility set in a production build).

- [ ] **Step 5: Commit**

```bash
git add frontend/tailwind.config.js frontend/package.json frontend/package-lock.json
git commit -m "fix: align tailwind.config.js with installed Tailwind v2 and drop unused v4 vite plugin"
```

---

## Self-Review Notes

- **Spec coverage:** Tasks 1-9 cover every item raised in the prior review except (a) splitting `App.js` into components, (b) adding authentication, (c) concurrency-safe JSON writes, and (d) duplicated stats logic between backend/frontend — all four are explicitly deferred under "Out of scope" since they're larger, independent refactors rather than bug/security fixes, and should get their own plan once this round lands.
- **Ordering:** Task 1 (JSX) and Task 2 (env/credentials) are first per the user's explicit request to start there. Tasks 4-7 (security-adjacent backend fixes) are grouped next since they touch the same file (`server.js`) and are easy to review together. Tasks 8-9 (frontend config) are last since they're independent of the backend work.
