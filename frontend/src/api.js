// Cliente de API: agrega el token de administrador cuando existe y
// centraliza el manejo de sesión expirada.
export const API_URL = process.env.REACT_APP_API_URL || 'http://172.24.100.115:5000';

const TOKEN_KEY = 'adminToken';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

let onSessionExpired = null;
export const setSessionExpiredHandler = (fn) => { onSessionExpired = fn; };

export const apiFetch = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && token && onSessionExpired) {
    clearToken();
    onSessionExpired();
  }
  return response;
};

// Descarga autenticada: pide el archivo con token y dispara la descarga del navegador.
export const downloadFile = async (path, filename) => {
  const response = await apiFetch(path);
  if (!response.ok) throw new Error('No se pudo descargar el archivo');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
