# Inventory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an organizational hierarchy (Sitio → Locación → Rack) and an equipment inventory to `loan-tracker04`, with basic linking from loan devices to real inventory items — per the approved spec at `docs/superpowers/specs/2026-07-14-inventory-system-design.md`.

**Architecture:** Backend follows the existing JSON-file pattern (`backend/sites.json` for the nested hierarchy tree, `backend/equipment.json` flat, referencing the tree by ID) with new `requireAdmin`-protected routes in `backend/server.js`. Frontend splits new UI into dedicated files (`theme.js`, `SitesAdmin.js`, `InventoryTab.js`, `EquipmentPicker.js`) instead of growing `App.js` further — `theme.js` also extracts the existing shared design tokens so the new files can reuse them without duplication.

**Tech Stack:** Node/Express (backend, no new dependencies), React CRA (frontend, no new dependencies), existing Tailwind design system.

## Global Constraints

- No new npm dependencies on either side.
- No automated test framework exists in this repo; verification is manual (`curl`, browser, `react-scripts build`).
- All user-facing text in Spanish, matching the existing UI voice.
- All new backend routes require admin (`requireAdmin` middleware) — inventory is not visible to anonymous visitors at all.
- Site/location/rack IDs are scoped to their parent (a location's `id` is only unique within its site, a rack's `id` only within its location) — always validate/look up using the full `siteId` → `locationId` → `rackId` chain, never `locationId` or `rackId` alone. Name uniqueness checks are case-insensitive, within the same parent only.
- Equipment's `serial` is required and unique across all equipment, case-insensitive. `name` is required but not unique (multiple physical units of the same model are expected).
- Equipment has no stored status field — "Prestado" vs "Disponible" is computed at read time from whether any non-`devuelto` loan has a device with a matching `inventoryEquipmentId`.
- Deleting a site/location/rack is blocked (400) while equipment still references it. Deleting equipment is never blocked.
- A loan device is either linked to inventory (`inventoryEquipmentId` set, fields auto-filled) or free text (`inventoryEquipmentId: null`) — never both stale at once. Manually editing a linked device's name/serial/owner clears the link.
- New frontend components use the shared `UI` tokens and `StatusBadge` from `./theme` — no re-declaring local copies of those strings.

---

### Task 1: Extract shared design tokens to `theme.js`

**Files:**
- Create: `frontend/src/theme.js`
- Modify: `frontend/src/App.js:1-59`

**Interfaces:**
- Produces: named exports `UI`, `STATUS_META`, `getStatusMeta`, `StatusBadge`, `StatusSelect` from `frontend/src/theme.js` — used by `App.js` now and by `InventoryTab.js`/`EquipmentPicker.js` in later tasks.

This is a pure refactor — no behavior change. `STATUS_META` gains two new keys (`disponible`, `prestado`) for the equipment status badges added in later tasks; nothing in this task uses them yet, but adding them now keeps the token set complete in one place.

- [ ] **Step 1: Create `frontend/src/theme.js`**

```jsx
import React from 'react';
import { FiChevronDown } from 'react-icons/fi';

// Sistema de diseño: clases reutilizables (paleta y tipografía en tailwind.config.js)
export const UI = {
  btnPrimary: 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-circuit text-white transition-colors duration-150 hover:bg-circuit-dark focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2 focus:ring-offset-paper disabled:opacity-50 disabled:cursor-not-allowed',
  btnSecondary: 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-surface text-ink border border-line transition-colors duration-150 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2 focus:ring-offset-paper',
  btnDangerOutline: 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-surface text-signal-red border border-signal-red-line transition-colors duration-150 hover:bg-signal-red hover:text-white hover:border-signal-red focus:outline-none focus:ring-2 focus:ring-signal-red focus:ring-offset-2 focus:ring-offset-paper',
  btnGhost: 'inline-flex items-center gap-1.5 text-sm font-medium text-circuit transition-colors duration-150 hover:text-circuit-dark',
  btnGhostDanger: 'inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors duration-150 hover:text-signal-red',
  iconGhost: 'text-ink-muted transition-colors duration-150 hover:text-circuit',
  iconGhostDanger: 'text-ink-muted transition-colors duration-150 hover:text-signal-red',
  input: 'w-full px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-ink placeholder-ink-muted transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-circuit focus:border-circuit',
  label: 'block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5',
  card: 'bg-surface rounded-xl border border-line shadow-card',
  panel: 'bg-surface rounded-xl border border-line shadow-card p-6 mb-8',
};

export const STATUS_META = {
  activo: { label: 'Activo', dot: 'bg-signal-green', ring: 'shadow-led-green', text: 'text-signal-green', soft: 'bg-signal-green-soft', line: 'border-signal-green-line' },
  atrasado: { label: 'Atrasado', dot: 'bg-signal-amber', ring: 'shadow-led-amber', text: 'text-signal-amber', soft: 'bg-signal-amber-soft', line: 'border-signal-amber-line' },
  devuelto: { label: 'Devuelto', dot: 'bg-signal-slate', ring: 'shadow-led-slate', text: 'text-signal-slate', soft: 'bg-signal-slate-soft', line: 'border-signal-slate-line' },
  disponible: { label: 'Disponible', dot: 'bg-signal-green', ring: 'shadow-led-green', text: 'text-signal-green', soft: 'bg-signal-green-soft', line: 'border-signal-green-line' },
  prestado: { label: 'Prestado', dot: 'bg-signal-amber', ring: 'shadow-led-amber', text: 'text-signal-amber', soft: 'bg-signal-amber-soft', line: 'border-signal-amber-line' },
};

export const getStatusMeta = (status) => STATUS_META[status] || STATUS_META.devuelto;

// Insignia de solo lectura: el estado (de un préstamo o de un equipo), como el LED de un puerto de red
export const StatusBadge = ({ status }) => {
  const meta = getStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${meta.soft} ${meta.line}`}>
      <span className={`w-2 h-2 rounded-full ${meta.dot} ${meta.ring}`} />
      <span className={`text-xs font-semibold uppercase tracking-wide ${meta.text}`}>{meta.label}</span>
    </span>
  );
};

// Selector de estado interactivo: mismo lenguaje visual del LED, pero editable
export const StatusSelect = ({ status, onChange }) => {
  const meta = getStatusMeta(status);
  return (
    <div className="relative inline-flex items-center">
      <span className={`absolute left-3 w-2 h-2 rounded-full pointer-events-none ${meta.dot} ${meta.ring}`} />
      <select
        value={status}
        onChange={onChange}
        className={`appearance-none pl-7 pr-7 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border cursor-pointer ${meta.soft} ${meta.text} ${meta.line} focus:outline-none focus:ring-2 focus:ring-circuit`}
      >
        <option value="activo">Activo</option>
        <option value="atrasado">Atrasado</option>
        <option value="devuelto">Devuelto</option>
      </select>
      <FiChevronDown className={`pointer-events-none absolute right-2 text-xs ${meta.text}`} />
    </div>
  );
};
```

- [ ] **Step 2: Remove the extracted definitions from `App.js` and import them instead**

Replace lines 7-59 of `frontend/src/App.js` (from the `// Sistema de diseño` comment through the closing `};` of `StatusSelect`):

```jsx
// Sistema de diseño: clases reutilizables (paleta y tipografía en tailwind.config.js)
const UI = {
  btnPrimary: 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-circuit text-white transition-colors duration-150 hover:bg-circuit-dark focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2 focus:ring-offset-paper disabled:opacity-50 disabled:cursor-not-allowed',
  btnSecondary: 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-surface text-ink border border-line transition-colors duration-150 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2 focus:ring-offset-paper',
  btnDangerOutline: 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-surface text-signal-red border border-signal-red-line transition-colors duration-150 hover:bg-signal-red hover:text-white hover:border-signal-red focus:outline-none focus:ring-2 focus:ring-signal-red focus:ring-offset-2 focus:ring-offset-paper',
  btnGhost: 'inline-flex items-center gap-1.5 text-sm font-medium text-circuit transition-colors duration-150 hover:text-circuit-dark',
  btnGhostDanger: 'inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors duration-150 hover:text-signal-red',
  iconGhost: 'text-ink-muted transition-colors duration-150 hover:text-circuit',
  iconGhostDanger: 'text-ink-muted transition-colors duration-150 hover:text-signal-red',
  input: 'w-full px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-ink placeholder-ink-muted transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-circuit focus:border-circuit',
  label: 'block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5',
  card: 'bg-surface rounded-xl border border-line shadow-card',
  panel: 'bg-surface rounded-xl border border-line shadow-card p-6 mb-8',
};

const STATUS_META = {
  activo: { label: 'Activo', dot: 'bg-signal-green', ring: 'shadow-led-green', text: 'text-signal-green', soft: 'bg-signal-green-soft', line: 'border-signal-green-line' },
  atrasado: { label: 'Atrasado', dot: 'bg-signal-amber', ring: 'shadow-led-amber', text: 'text-signal-amber', soft: 'bg-signal-amber-soft', line: 'border-signal-amber-line' },
  devuelto: { label: 'Devuelto', dot: 'bg-signal-slate', ring: 'shadow-led-slate', text: 'text-signal-slate', soft: 'bg-signal-slate-soft', line: 'border-signal-slate-line' },
};

const getStatusMeta = (status) => STATUS_META[status] || STATUS_META.devuelto;

// Insignia de solo lectura: el estado de un préstamo, como el LED de un puerto de red
const StatusBadge = ({ status }) => {
  const meta = getStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${meta.soft} ${meta.line}`}>
      <span className={`w-2 h-2 rounded-full ${meta.dot} ${meta.ring}`} />
      <span className={`text-xs font-semibold uppercase tracking-wide ${meta.text}`}>{meta.label}</span>
    </span>
  );
};

// Selector de estado interactivo: mismo lenguaje visual del LED, pero editable
const StatusSelect = ({ status, onChange }) => {
  const meta = getStatusMeta(status);
  return (
    <div className="relative inline-flex items-center">
      <span className={`absolute left-3 w-2 h-2 rounded-full pointer-events-none ${meta.dot} ${meta.ring}`} />
      <select
        value={status}
        onChange={onChange}
        className={`appearance-none pl-7 pr-7 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border cursor-pointer ${meta.soft} ${meta.text} ${meta.line} focus:outline-none focus:ring-2 focus:ring-circuit`}
      >
        <option value="activo">Activo</option>
        <option value="atrasado">Atrasado</option>
        <option value="devuelto">Devuelto</option>
      </select>
      <FiChevronDown className={`pointer-events-none absolute right-2 text-xs ${meta.text}`} />
    </div>
  );
};
```

with:

```jsx
import { UI, StatusBadge, StatusSelect } from './theme';
```

Place this new line among the existing imports at the top of the file (after `import AdminPanel from './AdminPanel';`), and leave the `FiChevronDown`/`FiChevronUp` entries in the existing `react-icons/fi` import on line 2 as they are — `App.js` still uses `FiChevronDown`/`FiChevronUp` directly elsewhere (the filter-toggle chevron and the loan-card expand/collapse chevron), independent of `StatusSelect`.

- [ ] **Step 3: Verify**

Run: `cd frontend && node_modules/.bin/react-scripts build 2>&1 | tail -15`
Expected: compiles clean (only the pre-existing `react-hooks/exhaustive-deps` warning, no new errors — specifically no `'UI' is not defined` / `'StatusBadge' is not defined` type errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/theme.js frontend/src/App.js
git commit -m "refactor: extract shared UI tokens and status components to theme.js"
```

---

### Task 2: Backend — Sitios, Locaciones, Racks CRUD

**Files:**
- Modify: `backend/server.js` (insert after the `// ========== RUTAS PARA ARCHIVOS ==========` section, i.e. right after the `/delete-file/:filename` route and before `// ========== RUTAS PARA REPORTES ==========`)

**Interfaces:**
- Produces: `readSites()`, `saveSites(sites)`, `nextId(items)` (generic ID helper, reused by Task 3), `namesCollide(a, b)` — all used by Task 3. Routes: `GET/POST /sites`, `PUT/DELETE /sites/:id`, `POST /sites/:id/locations`, `PUT/DELETE /sites/:id/locations/:locationId`, `POST /sites/:id/locations/:locationId/racks`, `PUT/DELETE /sites/:id/locations/:locationId/racks/:rackId`.
- Note: the `DELETE` routes in this task do **not** yet check for equipment references (equipment doesn't exist yet) — Task 3 replaces these three `DELETE` handlers with reference-guarded versions once `equipment.json` exists to check against.

- [ ] **Step 1: Create the default sites file**

Create `backend/sites.json`:

```json
[]
```

- [ ] **Step 2: Add the sites/locations/racks section to `server.js`**

Insert the following block right before the `// ========== RUTAS PARA REPORTES ==========` comment:

```js
// ========== INVENTARIO: SITIOS, LOCACIONES, RACKS ==========
const SITES_FILE = path.join(__dirname, 'sites.json');

const readSites = () => {
  try {
    if (fs.existsSync(SITES_FILE)) {
      return JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
    }
    return [];
  } catch (error) {
    console.error('Error leyendo sitios:', error);
    return [];
  }
};

const saveSites = (sites) => {
  fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2));
};

const nextId = (items) => (items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1);

const namesCollide = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

app.get('/sites', requireAdmin, (req, res) => {
  res.json(readSites());
});

app.post('/sites', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del sitio es obligatorio' });
  }
  const sites = readSites();
  if (sites.some(site => namesCollide(site.name, name))) {
    return res.status(400).json({ error: 'Ya existe un sitio con ese nombre' });
  }
  const newSite = { id: nextId(sites), name: name.trim(), locations: [] };
  sites.push(newSite);
  saveSites(sites);
  res.json(newSite);
});

app.put('/sites/:id', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del sitio es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  if (sites.some(s => s.id !== site.id && namesCollide(s.name, name))) {
    return res.status(400).json({ error: 'Ya existe un sitio con ese nombre' });
  }
  site.name = name.trim();
  saveSites(sites);
  res.json(site);
});

app.delete('/sites/:id', requireAdmin, (req, res) => {
  const sites = readSites();
  const index = sites.findIndex(s => s.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  sites.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});

app.post('/sites/:id/locations', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre de la locación es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  if (site.locations.some(loc => namesCollide(loc.name, name))) {
    return res.status(400).json({ error: 'Ya existe una locación con ese nombre en este sitio' });
  }
  const newLocation = { id: nextId(site.locations), name: name.trim(), racks: [] };
  site.locations.push(newLocation);
  saveSites(sites);
  res.json(newLocation);
});

app.put('/sites/:id/locations/:locationId', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre de la locación es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === parseInt(req.params.locationId));
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  if (site.locations.some(l => l.id !== location.id && namesCollide(l.name, name))) {
    return res.status(400).json({ error: 'Ya existe una locación con ese nombre en este sitio' });
  }
  location.name = name.trim();
  saveSites(sites);
  res.json(location);
});

app.delete('/sites/:id/locations/:locationId', requireAdmin, (req, res) => {
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const index = site.locations.findIndex(l => l.id === parseInt(req.params.locationId));
  if (index === -1) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  site.locations.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});

app.post('/sites/:id/locations/:locationId/racks', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del rack es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === parseInt(req.params.locationId));
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  if (location.racks.some(rack => namesCollide(rack.name, name))) {
    return res.status(400).json({ error: 'Ya existe un rack con ese nombre en esta locación' });
  }
  const newRack = { id: nextId(location.racks), name: name.trim() };
  location.racks.push(newRack);
  saveSites(sites);
  res.json(newRack);
});

app.put('/sites/:id/locations/:locationId/racks/:rackId', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del rack es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === parseInt(req.params.locationId));
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  const rack = location.racks.find(r => r.id === parseInt(req.params.rackId));
  if (!rack) {
    return res.status(404).json({ error: 'Rack no encontrado' });
  }
  if (location.racks.some(r => r.id !== rack.id && namesCollide(r.name, name))) {
    return res.status(400).json({ error: 'Ya existe un rack con ese nombre en esta locación' });
  }
  rack.name = name.trim();
  saveSites(sites);
  res.json(rack);
});

app.delete('/sites/:id/locations/:locationId/racks/:rackId', requireAdmin, (req, res) => {
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === parseInt(req.params.locationId));
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  const index = location.racks.findIndex(r => r.id === parseInt(req.params.rackId));
  if (index === -1) {
    return res.status(404).json({ error: 'Rack no encontrado' });
  }
  location.racks.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});
```

- [ ] **Step 3: Verify with curl**

Start the server (`cd backend && node server.js`), log in to get `$TOKEN` (`curl -s -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"password":"<tu contraseña actual>"}'`), then:

```bash
B=http://localhost:5000
H="-H Authorization:\ Bearer\ $TOKEN -H Content-Type:application/json"

# crear sitio
curl -s -X POST $B/sites $H -d '{"name":"Bogotá"}'
# duplicado (mismo nombre, distinta mayúscula) -> 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/sites $H -d '{"name":"bogotá"}'
# crear locación bajo el sitio 1
curl -s -X POST $B/sites/1/locations $H -d '{"name":"Bodega Norte"}'
# crear rack bajo esa locación
curl -s -X POST $B/sites/1/locations/1/racks $H -d '{"name":"Rack 3"}'
# árbol completo
curl -s $B/sites $H
# renombrar el rack
curl -s -X PUT $B/sites/1/locations/1/racks/1 $H -d '{"name":"Rack 3B"}'
# borrar el rack, luego la locación, luego el sitio (sin equipos, debe funcionar)
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/sites/1/locations/1/racks/1 $H
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/sites/1/locations/1 $H
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/sites/1 $H
```

Expected: sitio creado con `locations: []`, segundo intento `400`, locación y rack anidados correctamente en el árbol devuelto por `GET /sites`, renombrado refleja el cambio, los tres `DELETE` devuelven `200`. Kill the server when done.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js backend/sites.json
git commit -m "feat: sites/locations/racks hierarchy CRUD"
```

---

### Task 3: Backend — Equipment CRUD, search, computed status, and delete-guards

**Files:**
- Modify: `backend/server.js` (insert the equipment section right after the sites/locations/racks section from Task 2, before `// ========== RUTAS PARA REPORTES ==========`; also replace the three `DELETE` handlers from Task 2 with guarded versions)

**Interfaces:**
- Consumes: `readSites`, `nextId`, `requireAdmin`, `readLoans` (all already defined).
- Produces: `readEquipment()`, `saveEquipment(equipment)`, `computeEquipmentStatus(equipmentId, loans)` — the last one is the single source of truth for Prestado/Disponible, used again nowhere else in this plan but is the contract InventoryTab (Task 5) and EquipmentPicker (Task 6) rely on via the `status` field in `GET /equipment` and `GET /equipment/search` responses. Routes: `GET /equipment`, `GET /equipment/search?q=`, `POST /equipment`, `PUT/DELETE /equipment/:id`.

- [ ] **Step 1: Create the default equipment file**

Create `backend/equipment.json`:

```json
[]
```

- [ ] **Step 2: Add the equipment section to `server.js`**

Insert right after the sites/locations/racks section (after the last `DELETE /sites/:id/locations/:locationId/racks/:rackId` handler from Task 2) and before `// ========== RUTAS PARA REPORTES ==========`:

```js
// ========== INVENTARIO: EQUIPOS ==========
const EQUIPMENT_FILE = path.join(__dirname, 'equipment.json');

const readEquipment = () => {
  try {
    if (fs.existsSync(EQUIPMENT_FILE)) {
      return JSON.parse(fs.readFileSync(EQUIPMENT_FILE, 'utf8'));
    }
    return [];
  } catch (error) {
    console.error('Error leyendo equipos:', error);
    return [];
  }
};

const saveEquipment = (equipment) => {
  fs.writeFileSync(EQUIPMENT_FILE, JSON.stringify(equipment, null, 2));
};

// ¿Este equipo está vinculado a un préstamo que aún no se devuelve?
const computeEquipmentStatus = (equipmentId, loans) => {
  const isPrestado = loans.some(loan =>
    loan.status !== 'devuelto' &&
    (loan.devices || []).some(device => device.inventoryEquipmentId === equipmentId)
  );
  return isPrestado ? 'prestado' : 'disponible';
};

// Valida que siteId/locationId/rackId formen una cadena real dentro del árbol de sitios
const resolveSiteLocationRack = (sites, siteId, locationId, rackId) => {
  const site = sites.find(s => s.id === siteId);
  if (!site) return { error: 'El sitio indicado no existe' };
  if (locationId == null) {
    if (rackId != null) return { error: 'No puedes indicar un rack sin indicar la locación' };
    return { site, location: null, rack: null };
  }
  const location = site.locations.find(l => l.id === locationId);
  if (!location) return { error: 'La locación indicada no pertenece a ese sitio' };
  if (rackId == null) {
    return { site, location, rack: null };
  }
  const rack = location.racks.find(r => r.id === rackId);
  if (!rack) return { error: 'El rack indicado no pertenece a esa locación' };
  return { site, location, rack };
};

const validateEquipmentPayload = (body, sites) => {
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return { valid: false, error: 'El nombre del equipo es obligatorio' };
  }
  if (typeof body.serial !== 'string' || body.serial.trim() === '') {
    return { valid: false, error: 'El serial es obligatorio' };
  }
  if (typeof body.siteId !== 'number') {
    return { valid: false, error: 'Debes indicar el sitio' };
  }
  const resolved = resolveSiteLocationRack(sites, body.siteId, body.locationId ?? null, body.rackId ?? null);
  if (resolved.error) {
    return { valid: false, error: resolved.error };
  }
  return { valid: true };
};

app.get('/equipment', requireAdmin, (req, res) => {
  const equipment = readEquipment();
  const loans = readLoans();
  res.json(equipment.map(item => ({ ...item, status: computeEquipmentStatus(item.id, loans) })));
});

app.get('/equipment/search', requireAdmin, (req, res) => {
  const query = (req.query.q || '').toString().trim().toLowerCase();
  const equipment = readEquipment();
  const loans = readLoans();
  const matches = equipment
    .filter(item =>
      query === '' ||
      item.name.toLowerCase().includes(query) ||
      item.serial.toLowerCase().includes(query) ||
      (item.mac || '').toLowerCase().includes(query)
    )
    .slice(0, 20)
    .map(item => ({ ...item, status: computeEquipmentStatus(item.id, loans) }));
  res.json(matches);
});

app.post('/equipment', requireAdmin, (req, res) => {
  const sites = readSites();
  const validation = validateEquipmentPayload(req.body, sites);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const equipment = readEquipment();
  const serial = req.body.serial.trim();
  if (equipment.some(item => item.serial.toLowerCase() === serial.toLowerCase())) {
    return res.status(400).json({ error: 'Ya existe un equipo con ese serial' });
  }
  const newEquipment = {
    id: nextId(equipment),
    name: req.body.name.trim(),
    serial,
    mac: req.body.mac || '',
    partNumber: req.body.partNumber || '',
    manufacturer: req.body.manufacturer || '',
    category: req.body.category || '',
    owner: req.body.owner || '',
    siteId: req.body.siteId,
    locationId: req.body.locationId ?? null,
    rackId: req.body.rackId ?? null,
  };
  equipment.push(newEquipment);
  saveEquipment(equipment);
  res.json(newEquipment);
});

app.put('/equipment/:id', requireAdmin, (req, res) => {
  const sites = readSites();
  const validation = validateEquipmentPayload(req.body, sites);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const equipment = readEquipment();
  const index = equipment.findIndex(item => item.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: 'Equipo no encontrado' });
  }
  const serial = req.body.serial.trim();
  if (equipment.some(item => item.id !== equipment[index].id && item.serial.toLowerCase() === serial.toLowerCase())) {
    return res.status(400).json({ error: 'Ya existe un equipo con ese serial' });
  }
  equipment[index] = {
    ...equipment[index],
    name: req.body.name.trim(),
    serial,
    mac: req.body.mac || '',
    partNumber: req.body.partNumber || '',
    manufacturer: req.body.manufacturer || '',
    category: req.body.category || '',
    owner: req.body.owner || '',
    siteId: req.body.siteId,
    locationId: req.body.locationId ?? null,
    rackId: req.body.rackId ?? null,
  };
  saveEquipment(equipment);
  res.json(equipment[index]);
});

app.delete('/equipment/:id', requireAdmin, (req, res) => {
  const equipment = readEquipment();
  const filtered = equipment.filter(item => item.id !== parseInt(req.params.id));
  saveEquipment(filtered);
  res.json({ success: true });
});
```

- [ ] **Step 3: Add the delete-guards to the Task 2 site/location/rack `DELETE` routes**

Replace (the plain version from Task 2):

```js
app.delete('/sites/:id', requireAdmin, (req, res) => {
  const sites = readSites();
  const index = sites.findIndex(s => s.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  sites.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});
```

with:

```js
app.delete('/sites/:id', requireAdmin, (req, res) => {
  const siteId = parseInt(req.params.id);
  const sites = readSites();
  const index = sites.findIndex(s => s.id === siteId);
  if (index === -1) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const blockingCount = readEquipment().filter(item => item.siteId === siteId).length;
  if (blockingCount > 0) {
    return res.status(400).json({ error: `No se puede eliminar: ${blockingCount} equipo(s) están asignados a este sitio` });
  }
  sites.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});
```

Replace:

```js
app.delete('/sites/:id/locations/:locationId', requireAdmin, (req, res) => {
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const index = site.locations.findIndex(l => l.id === parseInt(req.params.locationId));
  if (index === -1) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  site.locations.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});
```

with:

```js
app.delete('/sites/:id/locations/:locationId', requireAdmin, (req, res) => {
  const siteId = parseInt(req.params.id);
  const locationId = parseInt(req.params.locationId);
  const sites = readSites();
  const site = sites.find(s => s.id === siteId);
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const index = site.locations.findIndex(l => l.id === locationId);
  if (index === -1) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  const blockingCount = readEquipment().filter(item => item.siteId === siteId && item.locationId === locationId).length;
  if (blockingCount > 0) {
    return res.status(400).json({ error: `No se puede eliminar: ${blockingCount} equipo(s) están asignados a esta locación` });
  }
  site.locations.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});
```

Replace:

```js
app.delete('/sites/:id/locations/:locationId/racks/:rackId', requireAdmin, (req, res) => {
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === parseInt(req.params.locationId));
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  const index = location.racks.findIndex(r => r.id === parseInt(req.params.rackId));
  if (index === -1) {
    return res.status(404).json({ error: 'Rack no encontrado' });
  }
  location.racks.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});
```

with:

```js
app.delete('/sites/:id/locations/:locationId/racks/:rackId', requireAdmin, (req, res) => {
  const siteId = parseInt(req.params.id);
  const locationId = parseInt(req.params.locationId);
  const rackId = parseInt(req.params.rackId);
  const sites = readSites();
  const site = sites.find(s => s.id === siteId);
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === locationId);
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  const index = location.racks.findIndex(r => r.id === rackId);
  if (index === -1) {
    return res.status(404).json({ error: 'Rack no encontrado' });
  }
  const blockingCount = readEquipment().filter(item => item.siteId === siteId && item.locationId === locationId && item.rackId === rackId).length;
  if (blockingCount > 0) {
    return res.status(400).json({ error: `No se puede eliminar: ${blockingCount} equipo(s) están asignados a este rack` });
  }
  location.racks.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});
```

- [ ] **Step 4: Verify with curl**

Start the server, log in for `$TOKEN`, then:

```bash
B=http://localhost:5000
H="-H Authorization:\ Bearer\ $TOKEN -H Content-Type:application/json"

# recrear un sitio/locación/rack de prueba (Task 2 borró los suyos)
curl -s -X POST $B/sites $H -d '{"name":"Sitio Prueba"}'
curl -s -X POST $B/sites/2/locations $H -d '{"name":"Locación Prueba"}'
curl -s -X POST $B/sites/2/locations/1/racks $H -d '{"name":"Rack Prueba"}'

# crear equipo en ese rack
curl -s -X POST $B/equipment $H -d '{"name":"AP-635","serial":"TEST123","siteId":2,"locationId":1,"rackId":1}'
# duplicar el serial (otra mayúscula) -> 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/equipment $H -d '{"name":"AP-635 (2)","serial":"test123","siteId":2}'
# listar -> status "disponible" (sin préstamo activo vinculado)
curl -s $B/equipment $H
# buscar
curl -s "$B/equipment/search?q=AP" $H

# intentar borrar el rack/locación/sitio que tienen ese equipo -> 400 en los tres
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/sites/2/locations/1/racks/1 $H
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/sites/2/locations/1 $H
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/sites/2 $H

# borrar el equipo, y ahora sí el rack/locación/sitio -> 200 en los tres
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/equipment/1 $H
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/sites/2/locations/1/racks/1 $H
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/sites/2/locations/1 $H
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $B/sites/2 $H
```

Expected: equipo creado con `siteId/locationId/rackId` correctos; duplicado de serial `400`; búsqueda encuentra el equipo; los tres primeros `DELETE` devuelven `400` con el conteo en el mensaje; tras borrar el equipo, los mismos tres `DELETE` devuelven `200`. Kill the server when done.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js backend/equipment.json
git commit -m "feat: equipment CRUD, search, computed status, and delete-guards on sites/locations/racks"
```

---

### Task 4: Frontend — `SitesAdmin.js` and wiring into `AdminPanel.js`

**Files:**
- Create: `frontend/src/SitesAdmin.js`
- Modify: `frontend/src/AdminPanel.js`

**Interfaces:**
- Consumes: `apiFetch` from `./api`; `UI` from `./theme` (Task 1); backend routes from Task 2.
- Produces: default export `SitesAdmin()` (no props) — self-contained, fetches its own data. Rendered inside `AdminPanel`.

- [ ] **Step 1: Create `frontend/src/SitesAdmin.js`**

```jsx
import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiCheck, FiX } from 'react-icons/fi';
import { apiFetch } from './api';
import { UI } from './theme';

const SitesAdmin = () => {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newLocationName, setNewLocationName] = useState({});
  const [newRackName, setNewRackName] = useState({});
  const [editing, setEditing] = useState(null);

  const loadSites = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/sites');
      if (response.ok) setSites(await response.json());
    } catch (err) {
      setError('No se pudieron cargar los sitios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSites(); }, []);

  const handleApiError = async (response) => {
    const data = await response.json().catch(() => ({}));
    setError(data.error || 'Ocurrió un error');
  };

  const addSite = async () => {
    if (!newSiteName.trim()) return;
    setError('');
    const response = await apiFetch('/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSiteName }),
    });
    if (response.ok) {
      setNewSiteName('');
      loadSites();
    } else {
      await handleApiError(response);
    }
  };

  const deleteSite = async (siteId) => {
    if (!window.confirm('¿Eliminar este sitio y todo lo que contiene?')) return;
    setError('');
    const response = await apiFetch(`/sites/${siteId}`, { method: 'DELETE' });
    if (response.ok) {
      loadSites();
    } else {
      await handleApiError(response);
    }
  };

  const addLocation = async (siteId) => {
    const name = (newLocationName[siteId] || '').trim();
    if (!name) return;
    setError('');
    const response = await apiFetch(`/sites/${siteId}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      setNewLocationName({ ...newLocationName, [siteId]: '' });
      loadSites();
    } else {
      await handleApiError(response);
    }
  };

  const deleteLocation = async (siteId, locationId) => {
    if (!window.confirm('¿Eliminar esta locación y todo lo que contiene?')) return;
    setError('');
    const response = await apiFetch(`/sites/${siteId}/locations/${locationId}`, { method: 'DELETE' });
    if (response.ok) {
      loadSites();
    } else {
      await handleApiError(response);
    }
  };

  const addRack = async (siteId, locationId) => {
    const key = `${siteId}-${locationId}`;
    const name = (newRackName[key] || '').trim();
    if (!name) return;
    setError('');
    const response = await apiFetch(`/sites/${siteId}/locations/${locationId}/racks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      setNewRackName({ ...newRackName, [key]: '' });
      loadSites();
    } else {
      await handleApiError(response);
    }
  };

  const deleteRack = async (siteId, locationId, rackId) => {
    if (!window.confirm('¿Eliminar este rack?')) return;
    setError('');
    const response = await apiFetch(`/sites/${siteId}/locations/${locationId}/racks/${rackId}`, { method: 'DELETE' });
    if (response.ok) {
      loadSites();
    } else {
      await handleApiError(response);
    }
  };

  const startEdit = (type, ids, value) => setEditing({ type, ...ids, value });
  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing || !editing.value.trim()) return;
    setError('');
    let url;
    if (editing.type === 'site') url = `/sites/${editing.siteId}`;
    else if (editing.type === 'location') url = `/sites/${editing.siteId}/locations/${editing.locationId}`;
    else url = `/sites/${editing.siteId}/locations/${editing.locationId}/racks/${editing.rackId}`;
    const response = await apiFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editing.value }),
    });
    if (response.ok) {
      setEditing(null);
      loadSites();
    } else {
      await handleApiError(response);
    }
  };

  if (loading) {
    return <p className="text-sm text-ink-muted">Cargando sitios…</p>;
  }

  return (
    <div>
      {error && (
        <p className="text-sm font-medium text-signal-red bg-signal-red-soft border border-signal-red-line rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={newSiteName}
          onChange={(e) => setNewSiteName(e.target.value)}
          placeholder="Nombre del nuevo sitio (ej: Bogotá)"
          className={UI.input}
        />
        <button onClick={addSite} className={UI.btnPrimary}>
          <FiPlus className="text-sm" /> Agregar sitio
        </button>
      </div>

      <div className="space-y-4">
        {sites.map(site => (
          <div key={site.id} className="rounded-lg border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              {editing && editing.type === 'site' && editing.siteId === site.id ? (
                <div className="flex gap-2 flex-1">
                  <input
                    type="text"
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    className={UI.input}
                    autoFocus
                  />
                  <button onClick={saveEdit} className={UI.iconGhost} title="Guardar"><FiCheck className="text-lg" /></button>
                  <button onClick={cancelEdit} className={UI.iconGhostDanger} title="Cancelar"><FiX className="text-lg" /></button>
                </div>
              ) : (
                <>
                  <h4 className="font-display text-base font-bold text-ink">{site.name}</h4>
                  <div className="flex gap-3 flex-shrink-0">
                    <button onClick={() => startEdit('site', { siteId: site.id }, site.name)} className={UI.iconGhost} title="Renombrar">
                      <FiEdit className="text-sm" />
                    </button>
                    <button onClick={() => deleteSite(site.id)} className={UI.iconGhostDanger} title="Eliminar">
                      <FiTrash2 className="text-sm" />
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 pl-4 border-l-2 border-line space-y-3">
              {site.locations.map(location => (
                <div key={location.id}>
                  <div className="flex items-center justify-between gap-3">
                    {editing && editing.type === 'location' && editing.siteId === site.id && editing.locationId === location.id ? (
                      <div className="flex gap-2 flex-1">
                        <input
                          type="text"
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          className={UI.input}
                          autoFocus
                        />
                        <button onClick={saveEdit} className={UI.iconGhost} title="Guardar"><FiCheck className="text-lg" /></button>
                        <button onClick={cancelEdit} className={UI.iconGhostDanger} title="Cancelar"><FiX className="text-lg" /></button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-ink">{location.name}</p>
                        <div className="flex gap-3 flex-shrink-0">
                          <button onClick={() => startEdit('location', { siteId: site.id, locationId: location.id }, location.name)} className={UI.iconGhost} title="Renombrar">
                            <FiEdit className="text-xs" />
                          </button>
                          <button onClick={() => deleteLocation(site.id, location.id)} className={UI.iconGhostDanger} title="Eliminar">
                            <FiTrash2 className="text-xs" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-2 pl-4 border-l-2 border-line space-y-1.5">
                    {location.racks.map(rack => (
                      <div key={rack.id} className="flex items-center justify-between gap-3">
                        {editing && editing.type === 'rack' && editing.siteId === site.id && editing.locationId === location.id && editing.rackId === rack.id ? (
                          <div className="flex gap-2 flex-1">
                            <input
                              type="text"
                              value={editing.value}
                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              className={UI.input}
                              autoFocus
                            />
                            <button onClick={saveEdit} className={UI.iconGhost} title="Guardar"><FiCheck className="text-base" /></button>
                            <button onClick={cancelEdit} className={UI.iconGhostDanger} title="Cancelar"><FiX className="text-base" /></button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-ink-muted font-mono">{rack.name}</p>
                            <div className="flex gap-3 flex-shrink-0">
                              <button onClick={() => startEdit('rack', { siteId: site.id, locationId: location.id, rackId: rack.id }, rack.name)} className={UI.iconGhost} title="Renombrar">
                                <FiEdit className="text-xs" />
                              </button>
                              <button onClick={() => deleteRack(site.id, location.id, rack.id)} className={UI.iconGhostDanger} title="Eliminar">
                                <FiTrash2 className="text-xs" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={newRackName[`${site.id}-${location.id}`] || ''}
                        onChange={(e) => setNewRackName({ ...newRackName, [`${site.id}-${location.id}`]: e.target.value })}
                        placeholder="Nuevo rack"
                        className={`${UI.input} py-1.5 text-xs`}
                      />
                      <button onClick={() => addRack(site.id, location.id)} className={UI.btnGhost}>
                        <FiPlus className="text-xs" /> Rack
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLocationName[site.id] || ''}
                  onChange={(e) => setNewLocationName({ ...newLocationName, [site.id]: e.target.value })}
                  placeholder="Nueva locación"
                  className={`${UI.input} py-1.5 text-sm`}
                />
                <button onClick={() => addLocation(site.id)} className={UI.btnGhost}>
                  <FiPlus className="text-sm" /> Locación
                </button>
              </div>
            </div>
          </div>
        ))}
        {sites.length === 0 && (
          <p className="text-sm text-ink-muted">Todavía no hay sitios. Agrega el primero arriba.</p>
        )}
      </div>
    </div>
  );
};

export default SitesAdmin;
```

- [ ] **Step 2: Wire it into `AdminPanel.js`**

In `frontend/src/AdminPanel.js`, add the import (after `import { API_URL, apiFetch } from './api';`):

```js
import SitesAdmin from './SitesAdmin';
```

Then replace:

```jsx
        </section>
      </div>
    </div>
  );
};

export default AdminPanel;
```

with:

```jsx
        </section>
      </div>

      <div className="mt-8 pt-8 border-t border-line">
        <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4">Sitios, locaciones y racks</h3>
        <SitesAdmin />
      </div>
    </div>
  );
};

export default AdminPanel;
```

- [ ] **Step 3: Verify**

Run: `cd frontend && node_modules/.bin/react-scripts build 2>&1 | tail -15` → compiles clean.

Then in the browser (backend running, logged in as admin): open Administración, confirm the "Sitios, locaciones y racks" section appears below the existing two columns; create a site, a location under it, a rack under that; rename each; delete the rack, then the location, then the site — confirm the tree updates after each action and errors (e.g. deleting a site with equipment, once Task 3's guard exists — not testable until Task 6 links equipment, so for now just confirm normal CRUD works).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/SitesAdmin.js frontend/src/AdminPanel.js
git commit -m "feat: SitesAdmin hierarchy management panel"
```

---

### Task 5: Frontend — `InventoryTab.js` and the "Inventario" tab

**Files:**
- Create: `frontend/src/InventoryTab.js`
- Modify: `frontend/src/App.js`

**Interfaces:**
- Consumes: `apiFetch` from `./api`; `UI`, `StatusBadge` from `./theme`; `GET/POST /equipment`, `PUT/DELETE /equipment/:id`, `GET /sites` from Tasks 2-3.
- Produces: default export `InventoryTab()` (no props, self-contained), rendered by `App.js` when `activeTab === 'inventario'`.

- [ ] **Step 1: Create `frontend/src/InventoryTab.js`**

```jsx
import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiSearch } from 'react-icons/fi';
import { apiFetch } from './api';
import { UI, StatusBadge } from './theme';

const emptyForm = {
  name: '', serial: '', mac: '', partNumber: '', manufacturer: '', category: '', owner: '',
  siteId: '', locationId: '', rackId: '',
};

const InventoryTab = () => {
  const [equipment, setEquipment] = useState([]);
  const [sites, setSites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ siteId: '', locationId: '', rackId: '', category: '', owner: '', status: '' });

  const loadEquipment = async () => {
    try {
      const response = await apiFetch('/equipment');
      if (response.ok) setEquipment(await response.json());
    } catch (error) {
      console.error('Error cargando equipos:', error);
    }
  };

  const loadSites = async () => {
    try {
      const response = await apiFetch('/sites');
      if (response.ok) setSites(await response.json());
    } catch (error) {
      console.error('Error cargando sitios:', error);
    }
  };

  useEffect(() => {
    Promise.all([loadEquipment(), loadSites()]).finally(() => setIsLoading(false));
  }, []);

  const findSite = (siteId) => sites.find(s => s.id === siteId);
  const findLocation = (siteId, locationId) => findSite(siteId)?.locations.find(l => l.id === locationId);
  const findRack = (siteId, locationId, rackId) => findLocation(siteId, locationId)?.racks.find(r => r.id === rackId);

  const placementLabel = (item) => {
    const parts = [findSite(item.siteId)?.name];
    if (item.locationId) parts.push(findLocation(item.siteId, item.locationId)?.name);
    if (item.rackId) parts.push(findRack(item.siteId, item.locationId, item.rackId)?.name);
    return parts.filter(Boolean).join(' › ') || '—';
  };

  const categoryOptions = [...new Set(equipment.map(e => e.category).filter(Boolean))].sort();
  const ownerOptions = [...new Set(equipment.map(e => e.owner).filter(Boolean))].sort();

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setFormError('');
  };

  const openNewForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (item) => {
    setFormData({
      name: item.name, serial: item.serial, mac: item.mac || '', partNumber: item.partNumber || '',
      manufacturer: item.manufacturer || '', category: item.category || '', owner: item.owner || '',
      siteId: item.siteId, locationId: item.locationId || '', rackId: item.rackId || '',
    });
    setEditingId(item.id);
    setFormError('');
    setShowForm(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'siteId') {
      setFormData({ ...formData, siteId: value ? parseInt(value) : '', locationId: '', rackId: '' });
    } else if (name === 'locationId') {
      setFormData({ ...formData, locationId: value ? parseInt(value) : '', rackId: '' });
    } else if (name === 'rackId') {
      setFormData({ ...formData, rackId: value ? parseInt(value) : '' });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const payload = {
      ...formData,
      siteId: formData.siteId || null,
      locationId: formData.locationId || null,
      rackId: formData.rackId || null,
    };
    const url = editingId ? `/equipment/${editingId}` : '/equipment';
    const method = editingId ? 'PUT' : 'POST';
    const response = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (response.ok) {
      setShowForm(false);
      resetForm();
      loadEquipment();
    } else {
      setFormError(data.error || 'No se pudo guardar el equipo');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este equipo del inventario?')) return;
    const response = await apiFetch(`/equipment/${id}`, { method: 'DELETE' });
    if (response.ok) {
      loadEquipment();
    } else {
      alert('No se pudo eliminar el equipo');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'siteId') {
      setFilters({ ...filters, siteId: value, locationId: '', rackId: '' });
    } else if (name === 'locationId') {
      setFilters({ ...filters, locationId: value, rackId: '' });
    } else {
      setFilters({ ...filters, [name]: value });
    }
  };

  const filteredEquipment = equipment.filter(item => {
    const matchesSearch =
      searchTerm === '' ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.mac || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSite = !filters.siteId || item.siteId === parseInt(filters.siteId);
    const matchesLocation = !filters.locationId || item.locationId === parseInt(filters.locationId);
    const matchesRack = !filters.rackId || item.rackId === parseInt(filters.rackId);
    const matchesCategory = !filters.category || item.category === filters.category;
    const matchesOwner = !filters.owner || item.owner === filters.owner;
    const matchesStatus = !filters.status || item.status === filters.status;
    return matchesSearch && matchesSite && matchesLocation && matchesRack && matchesCategory && matchesOwner && matchesStatus;
  });

  const filterSite = filters.siteId ? findSite(parseInt(filters.siteId)) : null;
  const filterLocation = filterSite && filters.locationId ? findLocation(filterSite.id, parseInt(filters.locationId)) : null;

  const formSite = formData.siteId ? findSite(formData.siteId) : null;
  const formLocation = formSite && formData.locationId ? findLocation(formSite.id, formData.locationId) : null;

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Cargando inventario…</p>;
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button onClick={openNewForm} className={UI.btnPrimary}>
          <FiPlus className="text-base" /> Nuevo Equipo
        </button>
      </div>

      {showForm && (
        <div className={UI.panel}>
          <h2 className="font-display text-xl font-bold text-ink mb-6">{editingId ? 'Editar Equipo' : 'Nuevo Equipo'}</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={UI.label}>Nombre del equipo</label>
                <input type="text" name="name" value={formData.name} onChange={handleFormChange} placeholder="Ej: AP-635" className={UI.input} required />
              </div>
              <div>
                <label className={UI.label}>Serial</label>
                <input type="text" name="serial" value={formData.serial} onChange={handleFormChange} className={`${UI.input} font-mono`} required />
              </div>
              <div>
                <label className={UI.label}>MAC (opcional)</label>
                <input type="text" name="mac" value={formData.mac} onChange={handleFormChange} className={`${UI.input} font-mono`} />
              </div>
              <div>
                <label className={UI.label}>Número de parte (opcional)</label>
                <input type="text" name="partNumber" value={formData.partNumber} onChange={handleFormChange} className={`${UI.input} font-mono`} />
              </div>
              <div>
                <label className={UI.label}>Fabricante</label>
                <input type="text" name="manufacturer" value={formData.manufacturer} onChange={handleFormChange} placeholder="Ej: HPE" className={UI.input} />
              </div>
              <div>
                <label className={UI.label}>Categoría</label>
                <input type="text" name="category" value={formData.category} onChange={handleFormChange} placeholder="Ej: Access Point" className={UI.input} list="category-options" />
                <datalist id="category-options">
                  {categoryOptions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className={UI.label}>Dueño del equipo (opcional)</label>
                <input type="text" name="owner" value={formData.owner} onChange={handleFormChange} className={UI.input} list="owner-options" />
                <datalist id="owner-options">
                  {ownerOptions.map(o => <option key={o} value={o} />)}
                </datalist>
              </div>
              <div></div>
              <div>
                <label className={UI.label}>Sitio</label>
                <select name="siteId" value={formData.siteId} onChange={handleFormChange} className={UI.input} required>
                  <option value="">Selecciona un sitio</option>
                  {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </div>
              <div>
                <label className={UI.label}>Locación (opcional)</label>
                <select name="locationId" value={formData.locationId} onChange={handleFormChange} className={UI.input} disabled={!formSite}>
                  <option value="">Sin locación específica</option>
                  {formSite?.locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>
              <div>
                <label className={UI.label}>Rack (opcional)</label>
                <select name="rackId" value={formData.rackId} onChange={handleFormChange} className={UI.input} disabled={!formLocation}>
                  <option value="">Sin rack específico</option>
                  {formLocation?.racks.map(rack => <option key={rack.id} value={rack.id}>{rack.name}</option>)}
                </select>
              </div>
            </div>
            {formError && (
              <p className="text-sm font-medium text-signal-red bg-signal-red-soft border border-signal-red-line rounded-lg px-3 py-2">{formError}</p>
            )}
            <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-line">
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className={UI.btnSecondary}>Cancelar</button>
              <button type="submit" className={UI.btnPrimary}>{editingId ? 'Guardar Cambios' : 'Agregar'}</button>
            </div>
          </form>
        </div>
      )}

      <div>
        <div className="flex items-center gap-3 mb-6 max-w-md">
          <FiSearch className="text-ink-muted text-base flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar por nombre, serial o MAC..."
            className={UI.input}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-paper rounded-lg p-5 mb-6 border border-line">
          <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4">Filtros</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className={UI.label}>Sitio</label>
              <select name="siteId" value={filters.siteId} onChange={handleFilterChange} className={UI.input}>
                <option value="">Todos</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </div>
            <div>
              <label className={UI.label}>Locación</label>
              <select name="locationId" value={filters.locationId} onChange={handleFilterChange} className={UI.input} disabled={!filterSite}>
                <option value="">Todas</option>
                {filterSite?.locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </div>
            <div>
              <label className={UI.label}>Rack</label>
              <select name="rackId" value={filters.rackId} onChange={handleFilterChange} className={UI.input} disabled={!filterLocation}>
                <option value="">Todos</option>
                {filterLocation?.racks.map(rack => <option key={rack.id} value={rack.id}>{rack.name}</option>)}
              </select>
            </div>
            <div>
              <label className={UI.label}>Categoría</label>
              <select name="category" value={filters.category} onChange={handleFilterChange} className={UI.input}>
                <option value="">Todas</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={UI.label}>Dueño</label>
              <select name="owner" value={filters.owner} onChange={handleFilterChange} className={UI.input}>
                <option value="">Todos</option>
                {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={UI.label}>Estado</label>
              <select name="status" value={filters.status} onChange={handleFilterChange} className={UI.input}>
                <option value="">Todos</option>
                <option value="disponible">Disponible</option>
                <option value="prestado">Prestado</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-paper">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Estado</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Nombre</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Serial</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Categoría</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Dueño</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Ubicación</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {filteredEquipment.map(item => (
                <tr key={item.id} className="hover:bg-paper transition-colors duration-150">
                  <td className="py-3 px-4 text-sm"><StatusBadge status={item.status} /></td>
                  <td className="py-3 px-4 text-sm text-ink font-medium">{item.name}</td>
                  <td className="py-3 px-4 text-sm text-ink-muted font-mono">{item.serial}</td>
                  <td className="py-3 px-4 text-sm text-ink-muted">{item.category || '—'}</td>
                  <td className="py-3 px-4 text-sm text-ink-muted">{item.owner || '—'}</td>
                  <td className="py-3 px-4 text-sm text-ink-muted">{placementLabel(item)}</td>
                  <td className="py-3 px-4 text-sm">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => openEditForm(item)} className={UI.iconGhost} title="Editar">
                        <FiEdit className="text-sm" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className={UI.iconGhostDanger} title="Eliminar">
                        <FiTrash2 className="text-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredEquipment.length === 0 && (
            <p className="text-sm text-ink-muted text-center py-8">No hay equipos que coincidan.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryTab;
```

- [ ] **Step 2: Wire the "Inventario" tab into `App.js`**

Add the import (with the other local imports near the top):

```js
import InventoryTab from './InventoryTab';
```

Add the `FiHardDrive` icon to the existing `react-icons/fi` import line (App.js already imports several icons from `'react-icons/fi'` in a single line — add `FiHardDrive` to that same list; it's used for the new Inventario tab so it doesn't reuse `FiArchive`, which already represents the Archivo tab right next to it).

Replace (the two conditions that currently show the search/sort/filters-toggle row and its expandable filter panel on every non-reportes tab):

```jsx
              <div className="flex items-center gap-2 flex-shrink-0">
                {activeTab !== 'reportes' && (
```

with:

```jsx
              <div className="flex items-center gap-2 flex-shrink-0">
                {(activeTab === 'activos' || activeTab === 'archivo') && (
```

Replace:

```jsx
          {isAdmin && activeTab !== 'reportes' && showListFilters && (
```

with:

```jsx
          {isAdmin && (activeTab === 'activos' || activeTab === 'archivo') && showListFilters && (
```

Replace the tabs row (add the fourth tab button after "Reportes"):

```jsx
              <button
                onClick={() => setActiveTab('reportes')}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${activeTab === 'reportes' ? 'text-circuit border-circuit' : 'text-ink-muted border-transparent hover:text-ink'}`}
              >
                <FiFileText className="text-base" /> Reportes
              </button>
            </div>
          )}
```

with:

```jsx
              <button
                onClick={() => setActiveTab('reportes')}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${activeTab === 'reportes' ? 'text-circuit border-circuit' : 'text-ink-muted border-transparent hover:text-ink'}`}
              >
                <FiFileText className="text-base" /> Reportes
              </button>
              <button
                onClick={() => setActiveTab('inventario')}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${activeTab === 'inventario' ? 'text-circuit border-circuit' : 'text-ink-muted border-transparent hover:text-ink'}`}
              >
                <FiHardDrive className="text-base" /> Inventario
              </button>
            </div>
          )}
```

Replace the loan-list content condition:

```jsx
          {isAdmin && activeTab !== 'reportes' && (
            <div className="space-y-3">
              {filteredLoans.length > 0 ? (
```

with:

```jsx
          {isAdmin && (activeTab === 'activos' || activeTab === 'archivo') && (
            <div className="space-y-3">
              {filteredLoans.length > 0 ? (
```

Immediately after the closing of that loan-list block — find:

```jsx
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-ink-muted">No hay préstamos que coincidan con tu búsqueda.</p>
                </div>
              )}
            </div>
          )}
        </div>
```

replace with:

```jsx
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-ink-muted">No hay préstamos que coincidan con tu búsqueda.</p>
                </div>
              )}
            </div>
          )}

          {isAdmin && activeTab === 'inventario' && <InventoryTab />}
        </div>
```

Finally, hide the bottom loan-stats footer on the Inventario tab (it shows loan counts, not equipment counts). Replace:

```jsx
        {isAdmin && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

with:

```jsx
        {isAdmin && activeTab !== 'inventario' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

- [ ] **Step 3: Verify**

Run: `cd frontend && node_modules/.bin/react-scripts build 2>&1 | tail -15` → compiles clean.

In the browser: confirm a fourth tab "Inventario" appears; clicking it hides the search/sort bar, the loan-list, and the bottom loan-stats tiles, and shows the InventoryTab UI instead; create an equipment item (using a site/location/rack created in Task 4's manual test), confirm it appears in the table with "Disponible"; edit it; delete it; filters and search work against real data.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/InventoryTab.js frontend/src/App.js
git commit -m "feat: Inventario tab - equipment list, filters, CRUD"
```

---

### Task 6: Frontend — `EquipmentPicker.js` and linking it into the loan form

**Files:**
- Create: `frontend/src/EquipmentPicker.js`
- Modify: `frontend/src/App.js`

**Interfaces:**
- Consumes: `apiFetch` from `./api`; `UI`, `StatusBadge` from `./theme`; `GET /equipment/search?q=` from Task 3.
- Produces: default export `EquipmentPicker({ linkedEquipment, onSelect, onUnlink })` where `linkedEquipment` is `{ name, serial } | null`, `onSelect(equipment)` fires with the full search-result object (including `id`, `owner`, `status`), `onUnlink()` fires with no args.

- [ ] **Step 1: Create `frontend/src/EquipmentPicker.js`**

```jsx
import React, { useState } from 'react';
import { FiSearch, FiX, FiLink } from 'react-icons/fi';
import { apiFetch } from './api';
import { UI, StatusBadge } from './theme';

const EquipmentPicker = ({ linkedEquipment, onSelect, onUnlink }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const search = async () => {
    if (!query.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    try {
      const response = await apiFetch(`/equipment/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        setResults(await response.json());
        setShowResults(true);
      }
    } catch (error) {
      console.error('Error buscando equipos:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      search();
    }
  };

  const pick = (equipment) => {
    onSelect(equipment);
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  if (linkedEquipment) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-circuit-soft border border-line text-sm">
        <FiLink className="text-circuit flex-shrink-0" />
        <span className="text-ink font-medium truncate">{linkedEquipment.name}</span>
        <span className="text-ink-muted font-mono text-xs truncate">{linkedEquipment.serial}</span>
        <button type="button" onClick={onUnlink} className={`${UI.iconGhostDanger} ml-auto flex-shrink-0`} title="Desvincular">
          <FiX className="text-sm" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Vincular equipo del inventario (opcional)"
          className={`${UI.input} text-sm`}
        />
        <button type="button" onClick={search} className={UI.btnSecondary} disabled={searching}>
          <FiSearch className="text-sm" />
        </button>
      </div>
      {showResults && (
        <div className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-lg shadow-card-hover max-h-56 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-sm text-ink-muted px-3 py-2">Sin resultados</p>
          ) : (
            results.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-paper transition-colors duration-150 text-sm"
              >
                <span className="truncate">
                  <span className="font-medium text-ink">{item.name}</span>
                  <span className="text-ink-muted font-mono ml-2">{item.serial}</span>
                </span>
                <StatusBadge status={item.status} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default EquipmentPicker;
```

- [ ] **Step 2: Give each loan device an `inventoryEquipmentId` field and a way to clear it on manual edits**

In `frontend/src/App.js`, this field needs the same default-shape treatment `equipmentOwner` got previously. Replace each of these three occurrences of the device default (they are currently identical strings, appearing at the initial `formData` state, inside `handleSubmit`'s post-save reset, and inside the "Nuevo Préstamo" button's reset — replace all three, one at a time using enough surrounding context to target each uniquely if needed):

```js
    devices: [{ equipmentName: '', equipmentSerial: '', equipmentOwner: '' }],
```

with:

```js
    devices: [{ equipmentName: '', equipmentSerial: '', equipmentOwner: '', inventoryEquipmentId: null }],
```

Replace the `addDevice` function's new-row default:

```js
  const addDevice = () => {
    setFormData({
      ...formData,
      devices: [...formData.devices, { equipmentName: '', equipmentSerial: '', equipmentOwner: '' }]
    });
  };
```

with:

```js
  const addDevice = () => {
    setFormData({
      ...formData,
      devices: [...formData.devices, { equipmentName: '', equipmentSerial: '', equipmentOwner: '', inventoryEquipmentId: null }]
    });
  };
```

Replace `handleEdit`'s device normalization (so opening an older loan for editing doesn't crash on a missing field):

```js
  const handleEdit = (loan) => {
    setFormData({
      ...loan,
      // Normaliza dispositivos guardados antes de que existiera "Dueño del equipo"
      devices: (loan.devices && loan.devices.length > 0)
        ? loan.devices.map(device => ({ equipmentOwner: '', ...device }))
        : [{ equipmentName: '', equipmentSerial: '', equipmentOwner: '' }]
    });
    setEditingId(loan.id);
```

with:

```js
  const handleEdit = (loan) => {
    setFormData({
      ...loan,
      // Normaliza dispositivos guardados antes de que existieran "Dueño del equipo" / vínculo de inventario
      devices: (loan.devices && loan.devices.length > 0)
        ? loan.devices.map(device => ({ equipmentOwner: '', inventoryEquipmentId: null, ...device }))
        : [{ equipmentName: '', equipmentSerial: '', equipmentOwner: '', inventoryEquipmentId: null }]
    });
    setLinkWarnings({});
    setEditingId(loan.id);
```

Replace `handleDeviceChange` so manually editing a linked device's text fields clears the stale link:

```js
  const handleDeviceChange = (index, e) => {
    const { name, value } = e.target;
    const updatedDevices = [...formData.devices];
    updatedDevices[index][name] = value;
    setFormData({ ...formData, devices: updatedDevices });
  };
```

with:

```js
  const handleDeviceChange = (index, e) => {
    const { name, value } = e.target;
    const updatedDevices = [...formData.devices];
    updatedDevices[index] = { ...updatedDevices[index], [name]: value };
    if (updatedDevices[index].inventoryEquipmentId) {
      updatedDevices[index].inventoryEquipmentId = null;
      const updatedWarnings = { ...linkWarnings };
      delete updatedWarnings[index];
      setLinkWarnings(updatedWarnings);
    }
    setFormData({ ...formData, devices: updatedDevices });
  };

  const handleDeviceLink = (index, equipment) => {
    const updatedDevices = [...formData.devices];
    updatedDevices[index] = {
      ...updatedDevices[index],
      equipmentName: equipment.name,
      equipmentSerial: equipment.serial,
      equipmentOwner: equipment.owner || '',
      inventoryEquipmentId: equipment.id,
    };
    setFormData({ ...formData, devices: updatedDevices });
    setLinkWarnings({ ...linkWarnings, [index]: equipment.status === 'prestado' });
  };

  const handleDeviceUnlink = (index) => {
    const updatedDevices = [...formData.devices];
    updatedDevices[index] = { ...updatedDevices[index], inventoryEquipmentId: null };
    setFormData({ ...formData, devices: updatedDevices });
    const updatedWarnings = { ...linkWarnings };
    delete updatedWarnings[index];
    setLinkWarnings(updatedWarnings);
  };
```

Add the `linkWarnings` state next to `formData`'s declaration. Replace:

```js
  const [editingId, setEditingId] = useState(null);
```

with:

```js
  const [editingId, setEditingId] = useState(null);
  const [linkWarnings, setLinkWarnings] = useState({});
```

Replace `removeDevice` (clears warnings too, since indices shift after removal and stale warnings could point at the wrong row):

```js
  const removeDevice = (index) => {
    const updatedDevices = [...formData.devices];
    updatedDevices.splice(index, 1);
    setFormData({ ...formData, devices: updatedDevices });
  };
```

with:

```js
  const removeDevice = (index) => {
    const updatedDevices = [...formData.devices];
    updatedDevices.splice(index, 1);
    setFormData({ ...formData, devices: updatedDevices });
    setLinkWarnings({});
  };
```

- [ ] **Step 3: Add the import and wire `EquipmentPicker` into each device row**

Add the import with the others:

```js
import EquipmentPicker from './EquipmentPicker';
```

In the device-row JSX, replace:

```jsx
                        <input
                          type="text"
                          name="equipmentOwner"
                          value={device.equipmentOwner || ''}
                          onChange={(e) => handleDeviceChange(index, e)}
                          placeholder="Dueño del equipo (opcional)"
                          className={UI.input}
                        />
                      </div>
                      {index > 0 && (
```

with:

```jsx
                        <input
                          type="text"
                          name="equipmentOwner"
                          value={device.equipmentOwner || ''}
                          onChange={(e) => handleDeviceChange(index, e)}
                          placeholder="Dueño del equipo (opcional)"
                          className={UI.input}
                        />
                      </div>
                      <div className="flex-1">
                        <EquipmentPicker
                          linkedEquipment={device.inventoryEquipmentId ? { name: device.equipmentName, serial: device.equipmentSerial } : null}
                          onSelect={(equipment) => handleDeviceLink(index, equipment)}
                          onUnlink={() => handleDeviceUnlink(index)}
                        />
                        {linkWarnings[index] && (
                          <p className="text-xs text-signal-amber mt-1">Este equipo ya figura prestado en otro préstamo activo</p>
                        )}
                      </div>
                      {index > 0 && (
```

This changes the device row's layout from a 2-column flex (`grid` + delete button) to a 3-item flex where the picker sits beside the 3-input grid. Since the picker needs its own line to have room for the dropdown results, change the row's outer wrapper from `flex items-start gap-3` to `flex flex-col gap-3` (stacking the input grid above the picker) — replace:

```jsx
                    <div key={index} className="flex items-start gap-3 mb-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
```

with:

```jsx
                    <div key={index} className="flex flex-col gap-3 mb-3 pb-3 border-b border-line last:border-b-0">
                      <div className="flex items-start gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
```

and, at the end of the same device block, close the newly-added wrapper `<div>` — replace:

```jsx
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => removeDevice(index)}
                          className={`${UI.iconGhostDanger} p-2 flex-shrink-0`}
                          title="Eliminar dispositivo"
                        >
                          <FiTrash2 className="text-lg" />
                        </button>
                      )}
                    </div>
                  ))}
```

with:

```jsx
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => removeDevice(index)}
                          className={`${UI.iconGhostDanger} p-2 flex-shrink-0`}
                          title="Eliminar dispositivo"
                        >
                          <FiTrash2 className="text-lg" />
                        </button>
                      )}
                      </div>
                    </div>
                  ))}
```

- [ ] **Step 4: Verify**

Run: `cd frontend && node_modules/.bin/react-scripts build 2>&1 | tail -15` → compiles clean.

In the browser: open "Nuevo Préstamo", in the device row's picker type part of an equipment name that exists in the inventory (created in Task 5's test) and press Enter — confirm results appear with a Disponible/Prestado badge, clicking one auto-fills name/serial/owner and shows the linked chip with an unlink (×) button. Manually edit the auto-filled name afterward — confirm the chip reverts to the picker (link cleared). Re-link, then create the loan — confirm in the Inventario tab that equipment now shows "Prestado". Mark that loan `devuelto` — confirm the equipment flips back to "Disponible". Try linking the same equipment to a second active loan — confirm the amber warning appears but does not block submission.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/EquipmentPicker.js frontend/src/App.js
git commit -m "feat: link loan devices to inventory equipment via EquipmentPicker"
```

---

## Self-Review Notes

- **Spec coverage:** §1 hierarchy → Tasks 2-3 (backend), Task 4 (frontend); §2 loan integration → Task 6; §3 backend API → Tasks 2-3; §4 frontend (Inventario tab + Sitios admin) → Tasks 4-5; §5 error handling → distributed across Tasks 2-3 (validation messages) and Task 6 (non-blocking warning); §6 verification → each task's Step 3/4 curl or browser checks map directly to the spec's 5 verification scenarios.
- **Working app at every step:** Task 1 is a zero-behavior-change refactor. Tasks 2-3 only add new, currently-unreferenced routes — nothing existing changes behavior. Tasks 4-6 each add one new, additive UI surface; none of them modify existing loan-management behavior except Task 6's device-row layout (visually additive, not behavior-removing) and the `handleDeviceChange`/`removeDevice`/`handleEdit` edits (backward compatible — old devices without `inventoryEquipmentId` are normalized to `null`).
- **Type/name consistency check:** `inventoryEquipmentId` spelled identically everywhere (backend `computeEquipmentStatus`, frontend device objects, `EquipmentPicker` callback contract). `status: 'disponible' | 'prestado'` string values match between backend (`computeEquipmentStatus` return value) and frontend (`STATUS_META` keys added in Task 1, the `InventoryTab` status filter `<option>` values, and `EquipmentPicker`'s `StatusBadge status={item.status}`). Route paths in Task 4/5/6 frontend calls match Task 2/3 backend route definitions exactly (`/sites`, `/sites/:id/locations`, `/sites/:id/locations/:locationId/racks`, `/equipment`, `/equipment/search`).
- **Post-completion:** none of this plan's work requires any user action afterward (unlike the auth plan's password rotation) — it's purely additive functionality.
