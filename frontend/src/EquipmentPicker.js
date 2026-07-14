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
