import React, { useState } from 'react';
import { FiImage, FiTrash2, FiLogOut, FiKey } from 'react-icons/fi';
import { API_URL, apiFetch } from './api';

const inputCls = 'w-full px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-circuit focus:border-circuit';
const labelCls = 'block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5';
const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-circuit text-white transition-colors duration-150 hover:bg-circuit-dark focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2 disabled:opacity-50';
const btnSecondary = 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-surface text-ink border border-line transition-colors duration-150 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-circuit focus:ring-offset-2';
const btnDangerOutline = 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-5 py-2.5 bg-surface text-signal-red border border-signal-red-line transition-colors duration-150 hover:bg-signal-red hover:text-white hover:border-signal-red focus:outline-none focus:ring-2 focus:ring-signal-red focus:ring-offset-2';

const AdminPanel = ({ branding, onBrandingChange, onLogout, onClose }) => {
  const [title, setTitle] = useState(branding.title);
  const [brandMsg, setBrandMsg] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passMsg, setPassMsg] = useState('');

  const saveTitle = async () => {
    setBrandMsg('');
    const response = await apiFetch('/branding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await response.json();
    if (response.ok) {
      setBrandMsg('Título guardado');
      onBrandingChange();
    } else {
      setBrandMsg(data.error || 'No se pudo guardar el título');
    }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBrandMsg('');
    const form = new FormData();
    form.append('logo', file);
    const response = await apiFetch('/branding/logo', { method: 'POST', body: form });
    const data = await response.json();
    if (response.ok) {
      setBrandMsg('Logo actualizado');
      onBrandingChange();
    } else {
      setBrandMsg(data.error || 'No se pudo subir el logo');
    }
    e.target.value = '';
  };

  const removeLogo = async () => {
    setBrandMsg('');
    const response = await apiFetch('/branding/logo', { method: 'DELETE' });
    if (response.ok) {
      setBrandMsg('Logo eliminado');
      onBrandingChange();
    } else {
      setBrandMsg('No se pudo eliminar el logo');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPassMsg('');
    if (newPassword !== confirmPassword) {
      setPassMsg('La confirmación no coincide con la nueva contraseña');
      return;
    }
    const response = await apiFetch('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    if (response.ok) {
      setPassMsg('Contraseña actualizada. Las demás sesiones se cerraron.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPassMsg(data.error || 'No se pudo cambiar la contraseña');
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-line shadow-card p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-xl font-bold text-ink">Administración</h2>
        <div className="flex gap-3">
          <button onClick={onClose} className={btnSecondary}>Cerrar</button>
          <button onClick={onLogout} className={btnDangerOutline}>
            <FiLogOut className="text-base" /> Cerrar sesión
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section>
          <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4 flex items-center gap-2">
            <FiImage className="text-circuit" /> Marca de la página
          </h3>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Título de la página</label>
              <div className="flex gap-3">
                <input type="text" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
                <button onClick={saveTitle} className={btnPrimary}>Guardar</button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Logo (PNG, JPG o WebP, máx. 2 MB)</label>
              {branding.hasLogo && (
                <div className="flex items-center gap-4 mb-3">
                  <img
                    src={`${API_URL}/branding/logo?v=${branding.logoVersion}`}
                    alt="Logo actual"
                    className="h-12 w-auto rounded border border-line bg-paper p-1"
                  />
                  <button onClick={removeLogo} className={btnDangerOutline}>
                    <FiTrash2 className="text-base" /> Quitar logo
                  </button>
                </div>
              )}
              <label className={`${btnSecondary} cursor-pointer`}>
                <FiImage className="text-base" /> {branding.hasLogo ? 'Reemplazar logo' : 'Subir logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} className="hidden" />
              </label>
            </div>
            {brandMsg && <p className="text-sm font-medium text-ink-muted">{brandMsg}</p>}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4 flex items-center gap-2">
            <FiKey className="text-circuit" /> Cambiar contraseña
          </h3>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className={labelCls}>Contraseña actual</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Nueva contraseña (mínimo 8 caracteres)</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} minLength={8} required />
            </div>
            <div>
              <label className={labelCls}>Confirmar nueva contraseña</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} minLength={8} required />
            </div>
            <button type="submit" className={btnPrimary}>Actualizar contraseña</button>
            {passMsg && <p className="text-sm font-medium text-ink-muted">{passMsg}</p>}
          </form>
        </section>
      </div>
    </div>
  );
};

export default AdminPanel;
