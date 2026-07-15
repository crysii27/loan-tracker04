# Sistema de Alarmas y Recordatorios de Préstamos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send automatic emails (from the existing Zoho corporate account) to loan responsables before a loan's due date, and recurring reminders while it's overdue — fully configurable from the admin panel.

**Architecture:** Extend `backend/server.js` (single-file Express + JSON persistence, no changes to that pattern) with a second daily `node-cron` job mirroring the existing `startScheduledReport` pattern (`server.js:1193`). The cron recomputes each loan's due/overdue state directly from `returnDate` (not from the possibly-stale `status` field — see Context below) and sends templated HTML emails via the existing `transporter` (`server.js:326`).

**Tech Stack:** Node/Express, `node-cron` (already a dependency), `nodemailer` (already configured for Zoho), React CRA frontend, no new dependencies.

## Global Constraints

- No test framework in this repo — every task is verified manually via `node -c`, `curl` against the running dev backend, and (for frontend) `eslint` + a manual browser pass done by the user afterward (this session cannot drive a browser — Playwright's Chromium isn't installed in this sandbox).
- Never write the admin password or any session token to a file. Test curl commands use a shell variable populated inline in the same command chain.
- Backend changes require restarting `node server.js` to take effect (no hot reload) — every backend task's verification steps say so explicitly.
- Spec: `docs/superpowers/specs/2026-07-14-loan-alerts-design.md` — refer back to it for the "why" behind any decision below.

---

### Task 1: Alert config persistence, admin routes, and `responsibleEmail` validation

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Produces: `readAlertConfig()` → `{ enabled: boolean, preDueDays: number[], overdueIntervalDays: number, lastRun: string|null }`; `saveAlertConfig(config)` → `boolean`. Task 2 consumes both.
- Produces routes: `GET /alert-config` (admin), `PUT /alert-config` (admin) — body `{ enabled, preDueDays, overdueIntervalDays }`.

- [ ] **Step 1: Add `ALERT_CONFIG_FILE` constant and read/save helpers**

Add right after the existing `saveReportConfig` function (`server.js:69-77`):

```javascript
// Funciones para manejar configuración de alertas de vencimiento
const ALERT_CONFIG_FILE = path.join(__dirname, 'alertConfig.json');

const DEFAULT_ALERT_CONFIG = { enabled: false, preDueDays: [7, 3, 1], overdueIntervalDays: 3, lastRun: null };

const readAlertConfig = () => {
  try {
    if (fs.existsSync(ALERT_CONFIG_FILE)) {
      return { ...DEFAULT_ALERT_CONFIG, ...JSON.parse(fs.readFileSync(ALERT_CONFIG_FILE, 'utf8')) };
    }
    return { ...DEFAULT_ALERT_CONFIG };
  } catch (error) {
    console.error('Error leyendo configuración de alertas:', error);
    return { ...DEFAULT_ALERT_CONFIG };
  }
};

const saveAlertConfig = (config) => {
  try {
    fs.writeFileSync(ALERT_CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error guardando configuración de alertas:', error);
    return false;
  }
};
```

- [ ] **Step 2: Add the admin routes**

Add near the other `/report-config`-style routes (right after `app.get('/report-config', ...)`, `server.js:1230-1237`):

```javascript
app.get('/alert-config', requireAdmin, (req, res) => {
  res.json(readAlertConfig());
});

app.put('/alert-config', requireAdmin, (req, res) => {
  const { enabled, preDueDays, overdueIntervalDays } = req.body;

  if (!Array.isArray(preDueDays) || preDueDays.length === 0 || preDueDays.some(d => !Number.isInteger(d) || d < 0)) {
    return res.status(400).json({ error: 'preDueDays debe ser una lista de al menos un entero no negativo' });
  }
  if (!Number.isInteger(overdueIntervalDays) || overdueIntervalDays < 1) {
    return res.status(400).json({ error: 'overdueIntervalDays debe ser un entero mayor o igual a 1' });
  }

  const config = readAlertConfig();
  config.enabled = !!enabled;
  config.preDueDays = preDueDays;
  config.overdueIntervalDays = overdueIntervalDays;
  saveAlertConfig(config);

  res.json({ success: true, config });
});
```

- [ ] **Step 3: Add `responsibleEmail` format validation to `validateLoanPayload`**

Modify `validateLoanPayload` (`server.js:597-616`) — add this block right before the final `return { valid: true };`:

```javascript
  if (typeof body.responsibleEmail === 'string' && body.responsibleEmail.trim() !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.responsibleEmail.trim())) {
      return { valid: false, error: 'El correo del responsable no parece válido.' };
    }
  }
```

- [ ] **Step 4: Syntax check**

Run: `cd backend && node -c server.js`
Expected: no output (exit code 0).

- [ ] **Step 5: Restart the backend and verify the routes manually**

```bash
# desde backend/ — mata el proceso anterior y arranca uno nuevo con el código actualizado
pkill -f "node server.js"
cd backend && node server.js &
sleep 1

# reemplaza <ADMIN_PASSWORD> con la contraseña real solo al ejecutar — no la escribas en ningún archivo
TOKEN=$(curl -s -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"password":"<ADMIN_PASSWORD>"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# GET debe devolver la config por defecto (todavía no existe alertConfig.json)
curl -s http://localhost:5000/alert-config -H "Authorization: Bearer $TOKEN"
# Expected: {"enabled":false,"preDueDays":[7,3,1],"overdueIntervalDays":3,"lastRun":null}

# PUT con payload inválido -> 400
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:5000/alert-config -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"enabled":true,"preDueDays":["x"],"overdueIntervalDays":3}'
# Expected: 400

# PUT válido -> 200, y GET refleja el cambio
curl -s -X PUT http://localhost:5000/alert-config -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"enabled":true,"preDueDays":[5,2],"overdueIntervalDays":2}'
curl -s http://localhost:5000/alert-config -H "Authorization: Bearer $TOKEN"
# Expected: {"enabled":true,"preDueDays":[5,2],"overdueIntervalDays":2,"lastRun":null}
cat backend/alertConfig.json
# Expected: same JSON, pretty-printed on disk
```

- [ ] **Step 6: Commit**

```bash
git add backend/server.js
git commit -m "feat: add alert config persistence, admin routes, and responsibleEmail validation"
```

---

### Task 2: `checkLoanAlerts` core logic, email templates, cron wiring, boot restore

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `readAlertConfig()`, `saveAlertConfig(config)` (Task 1), `readLoans()`/`saveLoans(loans)` (`server.js:27-48`), `readReportConfig()` (`server.js:51-67`), `transporter` (`server.js:326`).
- Produces: `checkLoanAlerts()` (async, no args, no return value — side effects only), `startAlertCron()`, `stopAlertCron()`.
- Modifies the `PUT /alert-config` handler from Task 1 to call `startAlertCron()`/`stopAlertCron()`.

- [ ] **Step 1: Add email templates and recipient logic**

Add right after `sendReportEmail` (`server.js:595`, before `validateLoanPayload`):

```javascript
const DAY_MS = 24 * 60 * 60 * 1000;

const buildAlertRecipients = (loan, adminEmails) => {
  if (loan.responsibleEmail) {
    return { to: [loan.responsibleEmail], cc: adminEmails.length > 0 ? adminEmails : undefined };
  }
  if (adminEmails.length > 0) {
    return { to: adminEmails, cc: undefined };
  }
  return null;
};

const renderDevicesList = (devices) =>
  (devices || []).map(d => `<li>${d.equipmentName} (${d.equipmentSerial})</li>`).join('');

const buildPreDueEmailHtml = (loan, daysRemaining) => `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, sans-serif; color: #1a1a1a;">
      <h2 style="color: #2563eb;">Recordatorio: préstamo por vencer</h2>
      <p>El préstamo del cliente <strong>${loan.client}</strong> (Partner: ${loan.partner}) vence en <strong>${daysRemaining} día(s)</strong>.</p>
      <p><strong>Responsable:</strong> ${loan.responsible}</p>
      <p><strong>Fecha de devolución:</strong> ${loan.returnDate}</p>
      <p><strong>Equipos:</strong></p>
      <ul>${renderDevicesList(loan.devices)}</ul>
    </body>
  </html>
`;

const buildOverdueEmailHtml = (loan, daysOverdue) => `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, sans-serif; color: #1a1a1a;">
      <h2 style="color: #dc2626;">Atención: préstamo atrasado</h2>
      <p>El préstamo del cliente <strong>${loan.client}</strong> (Partner: ${loan.partner}) está atrasado por <strong>${daysOverdue} día(s)</strong>.</p>
      <p><strong>Responsable:</strong> ${loan.responsible}</p>
      <p><strong>Fecha de devolución esperada:</strong> ${loan.returnDate}</p>
      <p><strong>Equipos:</strong></p>
      <ul>${renderDevicesList(loan.devices)}</ul>
    </body>
  </html>
`;
```

- [ ] **Step 2: Add `checkLoanAlerts`**

Add right after the templates from Step 1:

```javascript
const checkLoanAlerts = async () => {
  const config = readAlertConfig();
  if (!config.enabled) return;

  const loans = readLoans();
  const reportConfig = readReportConfig();
  const adminEmails = (reportConfig && Array.isArray(reportConfig.emails)) ? reportConfig.emails : [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let changed = false;

  for (const loan of loans) {
    if (loan.status === 'devuelto') continue;
    if (!loan.alertState) loan.alertState = { preDueSent: [], lastOverdueSentAt: null };

    const returnDate = new Date(loan.returnDate);
    returnDate.setHours(0, 0, 0, 0);
    const diasRestantes = Math.round((returnDate - today) / DAY_MS);

    if (diasRestantes < 0) {
      if (loan.status !== 'atrasado') {
        loan.status = 'atrasado';
        changed = true;
      }
      const diasAtraso = Math.abs(diasRestantes);
      const lastSent = loan.alertState.lastOverdueSentAt ? new Date(loan.alertState.lastOverdueSentAt) : null;
      const dueForReminder = !lastSent || (today - lastSent) / DAY_MS >= config.overdueIntervalDays;

      if (dueForReminder) {
        const recipients = buildAlertRecipients(loan, adminEmails);
        if (!recipients) {
          console.warn(`Préstamo ${loan.id} atrasado sin destinatarios de alerta configurados`);
        } else {
          try {
            await transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: recipients.to.join(', '),
              cc: recipients.cc ? recipients.cc.join(', ') : undefined,
              subject: `Atención: préstamo de ${loan.client} está atrasado (${diasAtraso} días)`,
              html: buildOverdueEmailHtml(loan, diasAtraso)
            });
            loan.alertState.lastOverdueSentAt = today.toISOString();
            changed = true;
          } catch (error) {
            console.error(`Error enviando recordatorio de atraso para préstamo ${loan.id}:`, error.message);
          }
        }
      }
    } else if (config.preDueDays.includes(diasRestantes) && !loan.alertState.preDueSent.includes(diasRestantes)) {
      const recipients = buildAlertRecipients(loan, adminEmails);
      if (!recipients) {
        console.warn(`Préstamo ${loan.id} sin destinatarios de alerta configurados`);
      } else {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: recipients.to.join(', '),
            cc: recipients.cc ? recipients.cc.join(', ') : undefined,
            subject: `Recordatorio: préstamo de ${loan.client} vence en ${diasRestantes} día(s)`,
            html: buildPreDueEmailHtml(loan, diasRestantes)
          });
          loan.alertState.preDueSent.push(diasRestantes);
          changed = true;
        } catch (error) {
          console.error(`Error enviando aviso previo para préstamo ${loan.id}:`, error.message);
        }
      }
    }
  }

  if (changed) saveLoans(loans);
  config.lastRun = new Date().toISOString();
  saveAlertConfig(config);
};
```

- [ ] **Step 3: Add cron start/stop and wire them into `PUT /alert-config`**

Add near `let scheduledJob = null;` (`server.js:1190`):

```javascript
let alertCronJob = null;

const startAlertCron = () => {
  if (alertCronJob) alertCronJob.stop();
  alertCronJob = cron.schedule('0 9 * * *', () => { checkLoanAlerts(); });
};

const stopAlertCron = () => {
  if (alertCronJob) {
    alertCronJob.stop();
    alertCronJob = null;
  }
};
```

Then modify the `PUT /alert-config` handler added in Task 1 — replace:
```javascript
  saveAlertConfig(config);

  res.json({ success: true, config });
```
with:
```javascript
  saveAlertConfig(config);

  if (config.enabled) {
    startAlertCron();
  } else {
    stopAlertCron();
  }

  res.json({ success: true, config });
```

- [ ] **Step 4: Restore the cron on server boot**

Add right after the existing report-restore block (`server.js:1291-1296`):

```javascript
// Restaurar configuración de alertas al iniciar
const savedAlertConfig = readAlertConfig();
if (savedAlertConfig.enabled) {
  console.log('Restaurando configuración de alertas guardada...');
  startAlertCron();
}
```

- [ ] **Step 5: Syntax check**

Run: `cd backend && node -c server.js`
Expected: no output (exit code 0).

- [ ] **Step 6: End-to-end manual verification with a fast cron (temporary)**

Temporarily change the schedule string from Step 3 to fire every minute, so you don't have to wait until 9am:

```javascript
  alertCronJob = cron.schedule('*/1 * * * *', () => { checkLoanAlerts(); });
```

```bash
pkill -f "node server.js"
cd backend && node server.js &
sleep 1

# reemplaza <ADMIN_PASSWORD> al ejecutar, no la escribas en archivos
TOKEN=$(curl -s -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{"password":"<ADMIN_PASSWORD>"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# habilita alertas con un umbral de 3 días
curl -s -X PUT http://localhost:5000/alert-config -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"enabled":true,"preDueDays":[3],"overdueIntervalDays":2}'

# crea un préstamo de prueba que vence en 3 días, con correo de responsable de prueba (usa uno tuyo real para verlo llegar)
curl -s -X POST http://localhost:5000/loans -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "client":"Cliente Prueba Alertas","partner":"N/A","responsible":"Prueba","responsibleEmail":"TU_CORREO_DE_PRUEBA@dominio.com",
  "loanDate":"2026-07-01","returnDate":"'"$(date -d '+3 days' +%F)"'",
  "devices":[{"equipmentName":"Test-AP","equipmentSerial":"TEST123"}]
}'

# espera a que el cron de cada minuto corra (hasta 65s) y confirma
sleep 65
grep -A3 "Cliente Prueba Alertas" backend/loans.json
# Expected: el objeto del préstamo ahora tiene "alertState": { "preDueSent": [3], ... }
# y revisa el buzón TU_CORREO_DE_PRUEBA@dominio.com — debe haber llegado el correo "Recordatorio: préstamo de Cliente Prueba Alertas vence en 3 día(s)"

# corre el cron una segunda vez (espera otro minuto) y confirma que NO se duplica el envío
sleep 65
grep -A3 "Cliente Prueba Alertas" backend/loans.json
# Expected: "preDueSent" sigue siendo [3], no [3,3] — sin reenvío
```

Elimina el préstamo de prueba cuando termines:
```bash
curl -s -X DELETE http://localhost:5000/loans/<ID_DEL_PRESTAMO_DE_PRUEBA> -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 7: Revert the fast cron schedule back to production (9am daily)**

Change `'*/1 * * * *'` back to `'0 9 * * *'` in `startAlertCron` and restart the backend once more to confirm it starts cleanly:

```bash
cd backend && node -c server.js
pkill -f "node server.js"
cd backend && node server.js &
```

- [ ] **Step 8: Commit**

```bash
git add backend/server.js
git commit -m "feat: implement daily loan due-date alert cron with email templates"
```

---

### Task 3: "Correo del responsable" field in the loan form (frontend)

**Files:**
- Modify: `frontend/src/App.js`

**Interfaces:**
- Consumes: existing `formData` state, `handleInputChange` (`App.js:238`, generic `name`/`value` setter — no changes needed there), `handleEdit` (`App.js:361-372`).

- [ ] **Step 1: Add `responsibleEmail` to the three `formData` initialization/reset spots**

In the initial `useState` (`App.js:31-40`), the post-submit reset (`App.js:344-351`), and the "Nuevo Préstamo" button reset (`App.js:782-791`) — in all three, add `responsibleEmail: ''` right after the `responsible: ''` line, e.g.:

```javascript
    client: '',
    partner: '',
    responsible: '',
    responsibleEmail: '',
    loanDate: '',
```

- [ ] **Step 2: Default `responsibleEmail` in `handleEdit` for loans saved before this field existed**

Modify `handleEdit` (`App.js:361-368`):

```javascript
  const handleEdit = (loan) => {
    setFormData({
      ...loan,
      responsibleEmail: loan.responsibleEmail || '',
      // Normaliza dispositivos guardados antes de que existieran "Dueño del equipo" / vínculo de inventario
      devices: (loan.devices && loan.devices.length > 0)
        ? loan.devices.map(device => ({ equipmentOwner: '', inventoryEquipmentId: null, ...device }))
        : [{ equipmentName: '', equipmentSerial: '', equipmentOwner: '', inventoryEquipmentId: null }]
    });
```

- [ ] **Step 3: Replace the empty spacer div with the new input**

Modify `App.js:865` — replace:
```jsx
                <div></div>
```
(the one immediately after the "Responsable" field block, `App.js:853-864`) with:
```jsx
                <div>
                  <label className={UI.label}>Correo del responsable (opcional)</label>
                  <input
                    type="email"
                    name="responsibleEmail"
                    value={formData.responsibleEmail}
                    onChange={handleInputChange}
                    placeholder="correo@empresa.com"
                    className={UI.input}
                  />
                </div>
```

- [ ] **Step 4: Lint check**

Run: `cd frontend && npx eslint src/App.js`
Expected: no new errors (pre-existing unrelated warnings about `caniuse-lite`/`browserslist` are fine).

- [ ] **Step 5: Verify via the backend directly (browser check to be done manually afterward — this session cannot drive a browser)**

```bash
# confirma que el frontend compila (CRA ya corre en background y hace hot-reload)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
# Expected: 200
```

Pide al usuario que abra `http://localhost:3000`, cree o edite un préstamo, llene "Correo del responsable" y confirme que se guarda (recargando la página y volviendo a abrir el registro).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.js
git commit -m "feat: add optional responsible email field to loan form"
```

---

### Task 4: "Alertas de Vencimiento" admin panel (frontend)

**Files:**
- Modify: `frontend/src/App.js`

**Interfaces:**
- Consumes: `GET /alert-config`, `PUT /alert-config` (Task 1/2), `apiFetch` (`api.js`), `isAdmin` (existing auth state already used by the report-config `useEffect` at `App.js:162-181`).

- [ ] **Step 1: Add `FiBell` to the icon import**

Modify `App.js:2`:
```javascript
import { FiPlus, FiEdit, FiTrash2, FiPaperclip, FiSearch, FiFileText, FiArchive, FiHardDrive, FiDownload, FiMail, FiSettings, FiChevronDown, FiChevronUp, FiLock, FiSliders, FiX, FiBell } from 'react-icons/fi';
```

- [ ] **Step 2: Add alert-config state**

Add right after the `reportFilters`/`emailInputError` state block (near `App.js:55-56`):

```javascript
  const [alertConfig, setAlertConfig] = useState({
    enabled: false,
    preDueDays: [7, 3, 1],
    overdueIntervalDays: 3,
    lastRun: null
  });
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [preDueDayInput, setPreDueDayInput] = useState('');
  const [preDueDayInputError, setPreDueDayInputError] = useState('');
```

- [ ] **Step 3: Fetch the saved alert config on mount (admin only)**

Add right after the report-config `useEffect` (`App.js:162-181`):

```javascript
  // Cargar configuración de alertas (solo admin)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchAlertConfig = async () => {
      try {
        const response = await apiFetch('/alert-config');
        if (!response.ok) return;
        const config = await response.json();
        setAlertConfig(config);
      } catch (error) {
        console.error('Error cargando configuración de alertas:', error);
      }
    };
    fetchAlertConfig();
  }, [isAdmin]);
```

- [ ] **Step 4: Add the chip-input handlers and save handler**

Add right after `handleEmailInputKeyDown` (`App.js:474-479`):

```javascript
  const addPreDueDay = () => {
    const value = parseInt(preDueDayInput, 10);
    if (isNaN(value) || value < 0) {
      setPreDueDayInputError('Ingresa un número de días válido (0 o más)');
      return;
    }
    if (alertConfig.preDueDays.includes(value)) {
      setPreDueDayInputError('Ese número de días ya está en la lista');
      return;
    }
    setAlertConfig({ ...alertConfig, preDueDays: [...alertConfig.preDueDays, value].sort((a, b) => b - a) });
    setPreDueDayInput('');
    setPreDueDayInputError('');
  };

  const removePreDueDay = (day) => {
    setAlertConfig({ ...alertConfig, preDueDays: alertConfig.preDueDays.filter(d => d !== day) });
  };

  const handlePreDueDayKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPreDueDay();
    }
  };

  const handleOverdueIntervalChange = (e) => {
    setAlertConfig({ ...alertConfig, overdueIntervalDays: parseInt(e.target.value, 10) || 1 });
  };

  const handleSaveAlertConfig = async () => {
    if (alertConfig.preDueDays.length === 0) {
      alert('Agrega al menos un valor de días antes del vencimiento, o desactiva las alertas');
      return;
    }
    try {
      const response = await apiFetch('/alert-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: alertConfig.enabled,
          preDueDays: alertConfig.preDueDays,
          overdueIntervalDays: alertConfig.overdueIntervalDays
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setAlertConfig(data.config);
        alert('Configuración de alertas guardada');
      } else {
        alert(`Error al guardar la configuración: ${data.error}`);
      }
    } catch (error) {
      console.error('Error en la conexión:', error);
      alert('Error en la conexión con el servidor. Verifica que el backend esté en ejecución.');
    }
  };
```

- [ ] **Step 5: Add the toggle button next to "Configurar Reportes"**

Modify `App.js:799-802` — add right after the `Configurar Reportes` button:
```jsx
              <button
                onClick={() => setShowReportConfig(true)}
                className={UI.btnSecondary}
              >
                <FiSettings className="text-base" /> Configurar Reportes
              </button>
              <button
                onClick={() => setShowAlertConfig(true)}
                className={UI.btnSecondary}
              >
                <FiBell className="text-base" /> Alertas de Vencimiento
              </button>
```

- [ ] **Step 6: Add the panel JSX**

Add right after the closing `)}` of the report-config panel (`App.js:1088`):

```jsx
        {showAlertConfig && (
          <div className={UI.panel}>
            <h2 className="font-display text-xl font-bold text-ink mb-6">Alertas de Vencimiento</h2>
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="alertsEnabled"
                  checked={alertConfig.enabled}
                  onChange={(e) => setAlertConfig({ ...alertConfig, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="alertsEnabled" className="text-sm text-ink">Activar alertas automáticas por correo</label>
              </div>
              <div>
                <label className={UI.label}>Avisar N días antes del vencimiento</label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    min="0"
                    value={preDueDayInput}
                    onChange={(e) => { setPreDueDayInput(e.target.value); setPreDueDayInputError(''); }}
                    onKeyDown={handlePreDueDayKeyDown}
                    placeholder="Ej: 3 — Enter para agregar"
                    className={UI.input}
                  />
                  <button type="button" onClick={addPreDueDay} className={UI.btnSecondary}>
                    <FiPlus className="text-sm" /> Agregar
                  </button>
                </div>
                {preDueDayInputError && (
                  <p className="text-xs font-medium text-signal-red mt-1.5">{preDueDayInputError}</p>
                )}
                {alertConfig.preDueDays.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {alertConfig.preDueDays.map(day => (
                      <span key={day} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-paper border border-line text-sm text-ink">
                        {day} día(s) antes
                        <button
                          type="button"
                          onClick={() => removePreDueDay(day)}
                          className="text-ink-muted hover:text-signal-red rounded-full p-0.5"
                          title={`Quitar ${day}`}
                        >
                          <FiX className="text-xs" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted mt-2">Agrega al menos un umbral de días antes del vencimiento.</p>
                )}
              </div>
              <div>
                <label className={UI.label}>Repetir recordatorio de atraso cada (días)</label>
                <input
                  type="number"
                  min="1"
                  value={alertConfig.overdueIntervalDays}
                  onChange={handleOverdueIntervalChange}
                  className={UI.input}
                />
              </div>
              {alertConfig.lastRun && (
                <p className="text-xs text-ink-muted">Última ejecución: {new Date(alertConfig.lastRun).toLocaleString()}</p>
              )}
              <div className="flex flex-wrap justify-end gap-3 pt-6 mt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowAlertConfig(false)}
                  className={UI.btnSecondary}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAlertConfig}
                  className={UI.btnPrimary}
                >
                  Guardar Configuración
                </button>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 7: Lint check**

Run: `cd frontend && npx eslint src/App.js`
Expected: no new errors.

- [ ] **Step 8: Verify via backend + confirm frontend compiles**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
# Expected: 200 (CRA hot-reloaded without compile errors)
```

Pide al usuario que abra `http://localhost:3000`, entre como admin, abra "Alertas de Vencimiento", agregue/quite chips de días, cambie el intervalo, guarde, recargue la página y confirme que los valores persisten.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.js
git commit -m "feat: add loan alert configuration panel to admin UI"
```
