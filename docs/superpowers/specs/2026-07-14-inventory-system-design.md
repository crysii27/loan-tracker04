# Inventory System — Design

**Date:** 2026-07-14
**Status:** Approved by user (pending written-spec review)

## Context

`loan-tracker04` currently tracks equipment *loans* only (backend `backend/server.js`, JSON-file persistence; frontend `frontend/src/App.js`, single-file React app with admin auth already in place — see `docs/superpowers/specs/2026-07-08-admin-auth-branding-design.md`). Loan devices are free-text (`equipmentName`, `equipmentSerial`, `equipmentOwner`) with no link to any real inventory record.

The user wants a second subsystem — an **inventory of HPE Networking assets** across multiple LATAM showrooms — that coexists with loans and links to them at a basic level.

## Goals

1. An organizational hierarchy — **Sitio → Locación → Rack** — that the admin manages explicitly (create/rename/delete), not typed ad hoc.
2. A proper **equipment inventory**: each physical asset tracked with identifying fields, ownership, and placement in the hierarchy.
3. **Basic linking** to loans: when creating a loan device, the admin can pick a real inventory item instead of (or as well as — coexistence, no forced migration) typing free text. A linked item's "Prestado" status is derived automatically from whether it's on an active loan.
4. Single admin sees and manages everything (matches the current one-admin auth model).

## Non-goals (this round)

- Per-site admin accounts / scoped permissions (flagged by the user as a possible future need if they hire regional admins — would require extending the current single-shared-password auth to individual accounts, a separate project).
- Automatic double-booking prevention (the user explicitly chose "vinculación básica" over the fuller "automático y total" option).
- More than two equipment states (Disponible/Prestado only — no Mantenimiento/De baja in this round).
- Predefined category list (categories are free text, same UX pattern as Partner/Cliente today).
- Migrating existing loan devices to reference inventory retroactively.
- Barcode/QR, photos, purchase date/warranty, cost/value — not requested.

## 1. Data model

**Storage (Approach B, chosen over flat-per-entity files or a real DB):** the site/location/rack tree lives in one nested JSON file; equipment is a separate flat file referencing the tree by ID, because equipment is filtered/searched constantly while the tree itself changes rarely.

`backend/sites.json`:
```json
[
  {
    "id": 1,
    "name": "Bogotá",
    "locations": [
      {
        "id": 1,
        "name": "Bodega Norte",
        "racks": [
          { "id": 1, "name": "Rack 3" }
        ]
      }
    ]
  }
]
```
- IDs are per-collection auto-increment integers, same convention as `loans.json` (`Math.max(...existing) + 1`).
- Name uniqueness enforced **within the same parent only**, case-insensitive (so "Bodega Norte" and "bodega norte" count as the same name): two sites can't share a name; two locations under the same site can't share a name; two racks under the same location can't share a name. Same name is fine across different parents (two different locations can each have a "Rack 3").
- **Delete guard:** deleting a site/location/rack is rejected (400) if any equipment currently references it (or, for a site/location, references anything nested under it). The error message names the blocking equipment count so the admin knows to reassign or delete those first.

`backend/equipment.json`:
```json
[
  {
    "id": 1,
    "name": "AP-635",
    "serial": "PHS9KYJ6YJ",
    "mac": "",
    "partNumber": "",
    "manufacturer": "HPE",
    "category": "Access Point",
    "owner": "",
    "siteId": 1,
    "locationId": 1,
    "rackId": 1
  }
]
```
- `name`: required, **not unique** (multiple physical units of the same model are expected).
- `serial`: required, **unique across all equipment** (case-insensitive compare, matching how a real serial works).
- `mac`, `partNumber`, `manufacturer`, `category`, `owner`: all optional free text.
- `siteId`: required, must reference an existing site.
- `locationId`: optional; if present, must belong to `siteId`.
- `rackId`: optional; if present, `locationId` must also be present and `rackId` must belong to `locationId`.
- **No stored status field.** "Prestado" is computed at read time: an equipment item is Prestado if any loan's `devices[]` array contains a device with `inventoryEquipmentId` equal to this equipment's `id` **and** that loan's `status !== 'devuelto'`. Otherwise Disponible. This mirrors how loan status itself already works (derived, not a separate source of truth to keep in sync).

## 2. Loan integration

Each device object inside a loan's `devices[]` array gains one new **optional** field: `inventoryEquipmentId` (number or `null`). Existing free-text devices are untouched (field simply absent, same non-breaking pattern used for `equipmentOwner` last round).

In the loan form, each device row gets a new "Vincular equipo del inventario" search control (searches by name/serial/MAC). Selecting a result:
- Sets `inventoryEquipmentId` on that device.
- Auto-fills `equipmentName`, `equipmentSerial`, `equipmentOwner` from the inventory record (still editable afterward — auto-fill is a convenience, not a lock).
- If the selected equipment is already Prestado (on another active loan), shows a non-blocking warning ("Este equipo ya figura prestado en otro préstamo activo") and lets the admin proceed anyway — no hard block, per the user's chosen integration level.

Clearing the link (or just editing the free-text fields directly) sets `inventoryEquipmentId` back to `null` — a device row is either linked or free text, not both at once, to avoid stale references after manual edits.

## 3. Backend API (all routes admin-only, same `requireAdmin` middleware as loans)

| Route | Method | Notes |
|---|---|---|
| `/sites` | GET | Full tree (sites with nested locations/racks) |
| `/sites` | POST | `{ name }` |
| `/sites/:id` | PUT / DELETE | Rename / delete-guarded |
| `/sites/:id/locations` | POST | `{ name }` |
| `/sites/:id/locations/:locationId` | PUT / DELETE | Rename / delete-guarded |
| `/sites/:id/locations/:locationId/racks` | POST | `{ name }` |
| `/sites/:id/locations/:locationId/racks/:rackId` | PUT / DELETE | Rename / delete-guarded |
| `/equipment` | GET | Flat list, each item annotated with a computed `status: 'disponible' \| 'prestado'` field (server computes it by cross-referencing loans, same as the delete-guard logic) |
| `/equipment` | POST | Create; validates serial uniqueness + site/location/rack referential integrity |
| `/equipment/:id` | PUT / DELETE | Update / delete, unrestricted (see note below on what happens to existing loan links) |
| `/equipment/search?q=` | GET | Lightweight name/serial/MAC search for the loan-form picker (admin-only, same as everything else) |

Deleting an equipment record is **not** blocked by existing loan links (unlike deleting a site/location/rack, which *is* blocked by equipment references — see §1). A loan device's `equipmentName`/`equipmentSerial`/`equipmentOwner` were copied onto the device at link time, so the loan's history stays intact either way; only `inventoryEquipmentId` goes stale. A stale `inventoryEquipmentId` (pointing at a deleted equipment record) is treated the same as an unlinked device: the loan-status computation in `GET /equipment` only ever looks up IDs that still exist, so it simply can't match a deleted one, and the loan form's picker treats an unresolvable ID as "not currently linked" if the loan is reopened for editing.

## 4. Frontend

**New pages/tabs:**
- A top-level **"Inventario"** tab (alongside Préstamos en Curso / Archivo / Reportes), admin-only: filterable/searchable equipment table (filters: Sitio, Locación, Rack, Categoría, Dueño, Estado; search: name/serial/MAC) with create/edit/delete.
- A **"Sitios"** section inside the existing Administración panel: tree view of Sitio → Locación → Rack with inline create/rename/delete at each level.

**Code organization** (the file-split the user approved):
- `frontend/src/theme.js` — the `UI` design-token object and `STATUS_META`/`getStatusMeta` moved out of `App.js` so new files can import them without duplication. `App.js` imports from here instead of defining locally.
- `frontend/src/InventoryTab.js` — equipment list, filters, create/edit form, delete.
- `frontend/src/SitesAdmin.js` — hierarchy tree management, rendered inside `AdminPanel.js`.
- `frontend/src/EquipmentPicker.js` — the small searchable "vincular equipo" widget, used inside `App.js`'s loan device rows.
- `App.js` itself only gains: the new tab wiring, and the `EquipmentPicker` call sites inside the existing device-row JSX.

## 5. Error handling

- Duplicate serial on create/update → 400, `{ error: 'Ya existe un equipo con ese serial' }`.
- Site/location/rack name collision within the same parent → 400 with a specific message.
- Delete blocked by references → 400 naming the count (e.g. `"No se puede eliminar: 3 equipos están asignados a este rack"`).
- Invalid `locationId`/`rackId` combination (rack without matching location, location not under the given site) → 400.
- Picker warning for an already-Prestado item is informational only (200, not an error) — the frontend renders it as a caution message, not a blocking dialog.

## 6. Verification (manual — repo has no test framework)

1. Create a site → location → rack tree via curl with an admin token; confirm `GET /sites` reflects nesting.
2. Attempt to delete a site with equipment assigned → 400; delete the equipment, retry → 200.
3. Create two equipment items with the same serial (different case) → second one rejected.
4. Create a loan, link a device to an inventory item → `GET /equipment` shows it as `prestado`; mark the loan `devuelto` → item flips back to `disponible`.
5. Frontend: Inventario tab filters/search against real data; Sitios admin panel create/rename/delete with the same tree reflected live; loan form picker auto-fills and shows the Prestado warning correctly.
