import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { apiFetch } from './api';
import { UI } from './theme';

const KIND_LABELS = {
  manufacturers: 'Fabricantes',
  categories: 'Categorías',
  owners: 'Dueños del equipo',
};

// Una columna reutilizable: agregar/listar/quitar valores de una de las tres listas
const OptionColumn = ({ kind, items, onAdd, onDelete }) => {
  const [value, setValue] = useState('');

  const handleAdd = () => {
    if (!value.trim()) return;
    onAdd(kind, value);
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{KIND_LABELS[kind]}</h4>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Agregar…"
          className={`${UI.input} text-sm`}
        />
        <button type="button" onClick={handleAdd} className={UI.iconGhost} title="Agregar">
          <FiPlus className="text-lg" />
        </button>
      </div>
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-paper border border-line text-sm">
            <span className="text-ink truncate">{item.name}</span>
            <button type="button" onClick={() => onDelete(kind, item.id)} className={UI.iconGhostDanger} title="Quitar">
              <FiTrash2 className="text-xs" />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-ink-muted">Sin valores todavía.</p>
        )}
      </div>
    </div>
  );
};

const EquipmentOptionsAdmin = () => {
  const [options, setOptions] = useState({ manufacturers: [], categories: [], owners: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOptions = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/equipment-options');
      if (response.ok) setOptions(await response.json());
    } catch (err) {
      setError('No se pudieron cargar las listas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOptions(); }, []);

  const handleAdd = async (kind, name) => {
    setError('');
    const response = await apiFetch(`/equipment-options/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      loadOptions();
    } else {
      const data = await response.json().catch(() => ({}));
      setError(data.error || 'No se pudo agregar el valor');
    }
  };

  const handleDelete = async (kind, id) => {
    setError('');
    const response = await apiFetch(`/equipment-options/${kind}/${id}`, { method: 'DELETE' });
    if (response.ok) {
      loadOptions();
    } else {
      setError('No se pudo quitar el valor');
    }
  };

  if (loading) {
    return <p className="text-sm text-ink-muted">Cargando listas…</p>;
  }

  return (
    <div>
      {error && (
        <p className="text-sm font-medium text-signal-red bg-signal-red-soft border border-signal-red-line rounded-lg px-3 py-2 mb-4">{error}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OptionColumn kind="manufacturers" items={options.manufacturers} onAdd={handleAdd} onDelete={handleDelete} />
        <OptionColumn kind="categories" items={options.categories} onAdd={handleAdd} onDelete={handleDelete} />
        <OptionColumn kind="owners" items={options.owners} onAdd={handleAdd} onDelete={handleDelete} />
      </div>
    </div>
  );
};

export default EquipmentOptionsAdmin;
