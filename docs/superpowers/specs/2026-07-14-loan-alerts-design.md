# Sistema de Alarmas y Recordatorios de Préstamos — Design

**Date:** 2026-07-14
**Status:** Approved by user (pending written-spec review)

## Context

`loan-tracker04` ya envía reportes programados por correo (Zoho, `smtp.zoho.com:465`, ver `backend/server.js:326` `transporter` y `backend/server.js:1193` `startScheduledReport`), pero esos reportes son un resumen periódico a una lista fija de administradores — no notifican individualmente a nadie sobre un préstamo específico.

El usuario quiere que el mismo correo corporativo (dominio ya autorizado) envíe automáticamente avisos a los **responsables** de cada préstamo cuando esté por vencer, y recordatorios recurrentes mientras siga atrasado.

**Hallazgo relevante durante la exploración:** el campo `status` de un préstamo (`'activo' | 'atrasado' | 'devuelto'`) no se recalcula en el backend. Solo cambia a `'atrasado'` cuando alguien abre el frontend y la función `updateLoanStatuses` (`frontend/src/App.js:202`) detecta que `returnDate` ya pasó, y hace un PUT de vuelta. Si nadie abre la app, un préstamo vencido puede seguir figurando como `'activo'` indefinidamente. El cron de alertas no puede depender de ese campo para decidir si algo está vencido — debe recalcularlo comparando `returnDate` contra la fecha actual directamente, y de paso corregir el campo `status` en el JSON (beneficio colateral: el sistema deja de depender de que alguien abra el navegador para que el estado sea correcto).

## Goals

1. Aviso(s) automático(s) antes de que un préstamo venza, con antelación configurable (ej. 7, 3, 1 días antes).
2. Recordatorio(s) automático(s) recurrentes mientras un préstamo siga atrasado, con frecuencia configurable (ej. cada 3 días).
3. Todo configurable desde el panel de administración, sin tocar código.
4. Reutilizar la infraestructura de correo y cron ya existente (mismo estilo del proyecto: un solo archivo backend, persistencia en JSON, sin dependencias nuevas más allá de las ya instaladas).

## Non-goals (this round)

- Chatbot / consultas por correo sobre inventario o préstamos (idea separada del usuario, evaluada aparte — requiere IMAP entrante + LLM + control de acceso, es un proyecto propio).
- Notificaciones por otro canal (SMS, Slack, WhatsApp) — solo correo.
- Editar/reenviar manualmente una alerta puntual desde la UI — solo el ciclo automático diario.
- Migrar `responsibleEmail` retroactivamente para los 12 préstamos existentes — el campo queda vacío hasta que el admin lo rellene; ver §4 Destinatarios para el comportamiento mientras tanto.
- Convertir "Responsable" en una lista administrable (como Fabricante/Categoría/Dueño) — se mantiene como texto libre, solo se le agrega un campo de correo al lado.

## 1. Data model

`backend/loans.json` — cada préstamo gana dos campos nuevos:
```json
{
  "responsibleEmail": "",
  "alertState": { "preDueSent": [], "lastOverdueSentAt": null }
}
```
- `responsibleEmail`: opcional, texto libre validado como email al guardar (mismo criterio que ya se usa para los correos de reportes). Vacío por defecto, incluido en los 12 préstamos existentes.
- `alertState.preDueSent`: array de enteros — qué umbrales de "días antes" ya generaron un correo para este préstamo (evita reenviar el mismo aviso cada día mientras el conteo se mantenga en ese número).
- `alertState.lastOverdueSentAt`: fecha ISO del último recordatorio de atraso enviado, o `null` si nunca se ha enviado uno. Se reinicia (a `null` y `preDueSent: []`) si el préstamo se marca `devuelto` y luego se reabre editando su fecha — no es un caso esperado, pero evita arrastrar estado obsoleto.

Nuevo `backend/alertConfig.json`:
```json
{
  "enabled": false,
  "preDueDays": [7, 3, 1],
  "overdueIntervalDays": 3,
  "lastRun": null
}
```
- `enabled`: apagado por defecto — el admin lo activa explícitamente después de revisar la configuración y rellenar al menos algunos correos de responsables.
- `preDueDays`: lista de enteros, orden libre, editable como chips (mismo patrón de UI que la lista de correos de reportes).
- `overdueIntervalDays`: entero ≥ 1.

## 2. Lógica del cron diario

Nuevo cron (`node-cron`, mismo horario 9am que el reporte, job independiente) que corre si `alertConfig.enabled === true`:

Para cada préstamo con `status !== 'devuelto'`:
1. Calcula `diasRestantes = Math.ceil((returnDate - hoy) / díaEnMs)`.
2. Si `diasRestantes < 0` (vencido):
   - Si `status !== 'atrasado'`, se corrige a `'atrasado'` en el JSON (independiente de que el frontend lo haya hecho o no).
   - Si `alertState.lastOverdueSentAt` es `null` o pasaron ≥ `overdueIntervalDays` desde esa fecha: envía **recordatorio de atraso**, actualiza `lastOverdueSentAt = hoy`.
3. Si `diasRestantes >= 0` (aún no vence):
   - Si `diasRestantes` está en `preDueDays` y no está ya en `alertState.preDueSent`: envía **aviso previo**, agrega el valor a `preDueSent`.

Al terminar la corrida: guarda `loans.json` (si hubo cambios) y actualiza `alertConfig.lastRun`.

El cron se re-registra al arrancar el servidor si `alertConfig.enabled === true` (mismo patrón que `startScheduledReport(savedConfig)` en `server.js:1295`).

## 3. Destinatarios

- Si el préstamo tiene `responsibleEmail`: `to = [responsibleEmail]`, `cc = adminEmails` (los mismos correos configurados en `reportConfig.json`).
- Si no tiene `responsibleEmail`: `to = adminEmails` (sin `cc`, para no duplicar el mismo correo en ambos campos).
- Si `adminEmails` también está vacío (nunca se configuró el reporte) y el préstamo tampoco tiene `responsibleEmail`: se omite el envío para ese préstamo y se registra en el log del servidor (`console.warn`) — no hay a quién escribirle.

## 4. Contenido del correo

Dos plantillas HTML en español, mismo estilo visual que `sendReportEmail` (`backend/server.js:337`):
- **Aviso previo:** asunto `Recordatorio: préstamo de [cliente] vence en N día(s)`. Cuerpo: cliente, partner, responsable, lista de equipos (nombre + serial), fecha de devolución, días restantes.
- **Recordatorio de atraso:** asunto `Atención: préstamo de [cliente] está atrasado (N días)`. Mismo cuerpo + días de atraso, tono más directo (color ámbar/rojo, coherente con `STATUS_META.atrasado` del frontend).

## 5. Backend API

| Route | Method | Notes |
|---|---|---|
| `/alert-config` | GET | `requireAdmin` — config actual |
| `/alert-config` | PUT | `requireAdmin` — `{ enabled, preDueDays, overdueIntervalDays }`, valida `preDueDays` como enteros ≥ 0 y `overdueIntervalDays` ≥ 1; arranca/detiene el cron según `enabled` |

`responsibleEmail` se agrega al payload existente de `POST /loans` y `PUT /loans/:id` (mismo endpoint, sin ruta nueva) — validado como email si viene no vacío, igual que el resto de campos opcionales.

## 6. Frontend

- **Formulario de préstamo** (`App.js`): nuevo input opcional "Correo del responsable" junto al campo "Responsable" existente, mismo `UI.input`.
- **Nueva sección en `AdminPanel.js`**, "Alertas de vencimiento": toggle activar/desactivar, chips editables para `preDueDays`, input numérico para `overdueIntervalDays`, texto de solo lectura con `lastRun` formateado. Mismo bloque visual que la sección de reporte programado existente.

## 7. Error handling

- Email inválido en `responsibleEmail` al guardar el préstamo → 400, mismo mensaje de formato que ya usa la validación de correos de reportes.
- `preDueDays`/`overdueIntervalDays` inválidos al guardar la config → 400 con mensaje específico.
- Falla de envío SMTP para un préstamo puntual dentro del loop del cron → se loguea el error y se sigue con el resto de préstamos (no se marca `preDueSent`/`lastOverdueSentAt` para ese préstamo, así se reintenta al día siguiente).

## 8. Verification (manual — repo sin framework de tests)

1. Crear un préstamo con `returnDate` = hoy + 3 días y `responsibleEmail` de prueba; activar alertas con `preDueDays: [3]`; correr el cron manualmente (llamando la función directo, sin esperar las 9am) y confirmar que llega el correo con `to` = responsable y `cc` = admins.
2. Repetir sin `responsibleEmail` → confirmar que llega solo a `to` = admins, sin `cc`.
3. Correr el cron dos veces seguidas con el mismo préstamo → confirmar que el segundo run NO reenvía (dedupe por `preDueSent`).
4. Crear un préstamo con `returnDate` en el pasado y `status: 'activo'` manualmente en el JSON; correr el cron → confirmar que corrige `status` a `'atrasado'` y envía el recordatorio de atraso.
5. Correr el cron un día después (o simular `lastOverdueSentAt` = hace `overdueIntervalDays` días) → confirmar que reenvía el recordatorio de atraso; correr al día siguiente sin cumplir el intervalo → confirmar que NO reenvía.
6. Frontend: activar/desactivar el toggle, editar chips de `preDueDays` y el intervalo desde el panel admin, confirmar que persiste tras recargar.
