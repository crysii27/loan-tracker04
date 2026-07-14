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
