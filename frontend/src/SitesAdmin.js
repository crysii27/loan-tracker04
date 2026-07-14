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
