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
  const [equipmentOptions, setEquipmentOptions] = useState({ manufacturers: [], categories: [], owners: [] });
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

  const loadEquipmentOptions = async () => {
    try {
      const response = await apiFetch('/equipment-options');
      if (response.ok) setEquipmentOptions(await response.json());
    } catch (error) {
      console.error('Error cargando listas de equipo:', error);
    }
  };

  useEffect(() => {
    Promise.all([loadEquipment(), loadSites(), loadEquipmentOptions()]).finally(() => setIsLoading(false));
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
                <select name="manufacturer" value={formData.manufacturer} onChange={handleFormChange} className={UI.input}>
                  <option value="">Selecciona un fabricante</option>
                  {equipmentOptions.manufacturers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className={UI.label}>Categoría</label>
                <select name="category" value={formData.category} onChange={handleFormChange} className={UI.input}>
                  <option value="">Selecciona una categoría</option>
                  {equipmentOptions.categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={UI.label}>Dueño del equipo (opcional)</label>
                <select name="owner" value={formData.owner} onChange={handleFormChange} className={UI.input}>
                  <option value="">Ninguno</option>
                  {equipmentOptions.owners.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                </select>
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
