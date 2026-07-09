import React, { useState } from 'react';
import { FiLock, FiX } from 'react-icons/fi';
import { apiFetch, setToken } from './api';

const LoginModal = ({ onSuccess, onClose }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (response.ok) {
        setToken(data.token);
        onSuccess();
      } else {
        setError(data.error || 'No se pudo iniciar sesión');
      }
    } catch {
      setError('No hay conexión con el servidor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(18,22,28,0.55)' }}>
      <div className="bg-surface rounded-xl border border-line shadow-card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2">
            <FiLock className="text-circuit" /> Acceso administrador
          </h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" title="Cerrar">
            <FiX className="text-xl" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-circuit focus:border-circuit"
              autoFocus
              required
            />
          </div>
          {error && (
            <p className="text-sm font-medium text-signal-red bg-signal-red-soft border border-signal-red-line rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-circuit text-white transition-colors duration-150 hover:bg-circuit-dark focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2 disabled:opacity-50"
          >
            {busy ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
