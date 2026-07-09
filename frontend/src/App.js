import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiPaperclip, FiSearch, FiFileText, FiArchive, FiDownload, FiMail, FiSettings, FiChevronDown, FiChevronUp, FiLock, FiSliders } from 'react-icons/fi';
import { API_URL, apiFetch, getToken, clearToken, setSessionExpiredHandler, downloadFile } from './api';
import LoginModal from './LoginModal';
import AdminPanel from './AdminPanel';

// Sistema de diseño: clases reutilizables (paleta y tipografía en tailwind.config.js)
const UI = {
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

const STATUS_META = {
  activo: { label: 'Activo', dot: 'bg-signal-green', ring: 'shadow-led-green', text: 'text-signal-green', soft: 'bg-signal-green-soft', line: 'border-signal-green-line' },
  atrasado: { label: 'Atrasado', dot: 'bg-signal-amber', ring: 'shadow-led-amber', text: 'text-signal-amber', soft: 'bg-signal-amber-soft', line: 'border-signal-amber-line' },
  devuelto: { label: 'Devuelto', dot: 'bg-signal-slate', ring: 'shadow-led-slate', text: 'text-signal-slate', soft: 'bg-signal-slate-soft', line: 'border-signal-slate-line' },
};

const getStatusMeta = (status) => STATUS_META[status] || STATUS_META.devuelto;

// Insignia de solo lectura: el estado de un préstamo, como el LED de un puerto de red
const StatusBadge = ({ status }) => {
  const meta = getStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${meta.soft} ${meta.line}`}>
      <span className={`w-2 h-2 rounded-full ${meta.dot} ${meta.ring}`} />
      <span className={`text-xs font-semibold uppercase tracking-wide ${meta.text}`}>{meta.label}</span>
    </span>
  );
};

// Selector de estado interactivo: mismo lenguaje visual del LED, pero editable
const StatusSelect = ({ status, onChange }) => {
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

function App() {
  // Estados
  const [loans, setLoans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({
    client: '',
    partner: '',
    responsible: '',
    loanDate: '',
    returnDate: '',
    comments: '',
    document: null,
    devices: [{ equipmentName: '', equipmentSerial: '' }],
  });

  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('activos');
  const [searchTerm, setSearchTerm] = useState('');
  const [showReportConfig, setShowReportConfig] = useState(false);
  const [expandedLoanId, setExpandedLoanId] = useState(null);

  const [reportConfig, setReportConfig] = useState({
    email: '',
    frequency: 'daily',
    isScheduled: false
  });

  const [reportFilters, setReportFilters] = useState({
    startDate: '',
    endDate: '',
    partner: '',
    client: '',
  });

  const [sortBy, setSortBy] = useState('creation');

  // Autenticación y marca
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [branding, setBranding] = useState({ title: 'Control de Préstamos', hasLogo: false, logoVersion: null });

  const loadBranding = async () => {
    try {
      const response = await apiFetch('/branding');
      if (response.ok) setBranding(await response.json());
    } catch (error) {
      console.error('Error cargando la marca:', error);
    }
  };

  const handleLogout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch { /* sin conexión: igual cerramos localmente */ }
    clearToken();
    setIsAdmin(false);
    setShowAdminPanel(false);
    setShowForm(false);
    setShowReportConfig(false);
  };

  // Función para cargar préstamos desde el servidor
  const fetchLoans = async () => {
    try {
      const response = await apiFetch('/loans');
      if (!response.ok) throw new Error('Error al cargar préstamos');
      const data = await response.json();
      setLoans(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error cargando préstamos:', error);
      alert('Error al cargar los préstamos desde el servidor');
      setIsLoading(false);
    }
  };

  // Cargar préstamos al inicio
  useEffect(() => {
    fetchLoans();
  }, []);

  // Restaurar sesión de admin (si hay token válido) y luego instalar el manejador de expiración
  useEffect(() => {
    const restoreSession = async () => {
      const token = getToken();
      if (token) {
        try {
          const response = await fetch(`${API_URL}/auth/verify`, { headers: { Authorization: `Bearer ${token}` } });
          if (response.ok) setIsAdmin(true);
          else clearToken();
        } catch { /* backend inalcanzable: se queda como visitante */ }
      }
      setSessionExpiredHandler(() => {
        clearToken();
        setIsAdmin(false);
        setShowAdminPanel(false);
        setShowForm(false);
        setShowReportConfig(false);
        alert('Tu sesión expiró. Vuelve a iniciar sesión.');
      });
    };
    restoreSession();
    loadBranding();
  }, []);

  // El título configurado también nombra la pestaña del navegador
  useEffect(() => {
    document.title = branding.title;
  }, [branding.title]);

  // Cargar configuración de reportes (solo admin: la ruta queda protegida)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchReportConfig = async () => {
      try {
        const response = await apiFetch('/report-config');
        if (!response.ok) return;
        const config = await response.json();
        if (config && config.isScheduled) {
          setReportConfig({
            email: config.email,
            frequency: config.frequency,
            isScheduled: config.isScheduled
          });
        }
      } catch (error) {
        console.error('Error cargando configuración de reportes:', error);
      }
    };
    fetchReportConfig();
  }, [isAdmin]);


  // Actualizar préstamos cada 30 segundos para sincronización
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLoans();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Función para calcular días de atraso
  const calculateOverdueDays = (returnDate) => {
    const today = new Date();
    const returnDateObj = new Date(returnDate);
    const diffTime = returnDateObj - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? Math.abs(diffDays) : 0;
  };

  // Función para actualizar los estados de los préstamos
  const updateLoanStatuses = async () => {
    const today = new Date();
    const updatedLoans = loans.map(loan => {
      const returnDate = new Date(loan.returnDate);
      if (loan.status !== 'devuelto' && returnDate < today) {
        return { ...loan, status: 'atrasado' };
      }
      return loan;
    });

    for (const loan of updatedLoans) {
      const originalLoan = loans.find(l => l.id === loan.id);
      if (originalLoan && originalLoan.status !== loan.status) {
        await apiFetch(`/loans/${loan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loan)
        });
      }
    }

    if (updatedLoans.some((loan, i) => loan.status !== loans[i]?.status)) {
      fetchLoans();
    }
  };

  useEffect(() => {
    if (isAdmin && loans.length > 0) {
      updateLoanStatuses();
      const interval = setInterval(updateLoanStatuses, 60000);
      return () => clearInterval(interval);
    }
  }, [loans, isAdmin]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleDeviceChange = (index, e) => {
    const { name, value } = e.target;
    const updatedDevices = [...formData.devices];
    updatedDevices[index][name] = value;
    setFormData({ ...formData, devices: updatedDevices });
  };

  const addDevice = () => {
    setFormData({
      ...formData,
      devices: [...formData.devices, { equipmentName: '', equipmentSerial: '' }]
    });
  };

  const removeDevice = (index) => {
    const updatedDevices = [...formData.devices];
    updatedDevices.splice(index, 1);
    setFormData({ ...formData, devices: updatedDevices });
  };

  const handleDocumentChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formDataFile = new FormData();
    formDataFile.append('file', file);

    try {
      const response = await apiFetch('/upload', {
        method: 'POST',
        body: formDataFile,
      });

      const data = await response.json();
      if (response.ok) {
        setFormData({ ...formData, document: data.filename });
        alert('Archivo subido correctamente: ' + data.filename);
      } else {
        console.error('Error al subir el archivo:', data.error);
        alert('Error al subir el archivo: ' + data.error);
      }
    } catch (error) {
      console.error('Error en la conexión:', error);
      alert('Error en la conexión con el servidor: ' + error.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingId) {
        const response = await apiFetch(`/loans/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (!response.ok) throw new Error('Error al actualizar');
        alert('Préstamo actualizado correctamente');
      } else {
        const response = await apiFetch('/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (!response.ok) throw new Error('Error al crear');
        alert('Préstamo creado correctamente');
      }

      await fetchLoans();

      setFormData({
        client: '',
        partner: '',
        responsible: '',
        loanDate: '',
        returnDate: '',
        comments: '',
        document: null,
        devices: [{ equipmentName: '', equipmentSerial: '' }],
      });
      setEditingId(null);
      setShowForm(false);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar el préstamo: ' + error.message);
    }
  };

  const handleEdit = (loan) => {
    setFormData({
      ...loan,
      devices: loan.devices || [{ equipmentName: '', equipmentSerial: '' }]
    });
    setEditingId(loan.id);
    setShowForm(true);
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const loan = loans.find(l => l.id === id);
      const response = await apiFetch(`/loans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loan, status: newStatus })
      });

      if (!response.ok) throw new Error('Error al actualizar estado');
      await fetchLoans();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      alert('Error al actualizar el estado');
    }
  };

  const handleDeleteLoan = async (id) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este préstamo?')) {
      try {
        const response = await apiFetch(`/loans/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) throw new Error('Error al eliminar');

        await fetchLoans();
        setExpandedLoanId(null);
        alert('Préstamo eliminado correctamente');
      } catch (error) {
        console.error('Error eliminando préstamo:', error);
        alert('Error al eliminar el préstamo');
      }
    }
  };

  const handleDeleteDocument = async (loanId, documentName) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este documento?')) {
      try {
        const response = await apiFetch(`/delete-file/${documentName}`, {
          method: 'DELETE',
        });

        const data = await response.json();
        if (data.success) {
          const loan = loans.find(l => l.id === loanId);
          await apiFetch(`/loans/${loanId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...loan, document: null })
          });

          await fetchLoans();
          alert('Documento eliminado correctamente');
        } else {
          throw new Error(data.error);
        }
      } catch (error) {
        console.error('Error eliminando documento:', error);
        alert('Error al eliminar el documento: ' + error.message);
      }
    }
  };

  const handleDownloadDocument = async (documentName) => {
    try {
      await downloadFile(`/download/${encodeURIComponent(documentName)}`, documentName);
    } catch (error) {
      console.error('Error descargando documento:', error);
      alert('No se pudo descargar el documento');
    }
  };

  const handleReportConfigChange = (e) => {
    const { name, value } = e.target;
    setReportConfig({ ...reportConfig, [name]: value });
  };

  const handleSendReportNow = async () => {
    if (!reportConfig.email) {
      alert('Por favor, ingresa un correo electrónico');
      return;
    }

    try {
      const response = await apiFetch('/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: reportConfig.email,
          loans: loans
        }),
      });

      const data = await response.json();
      if (response.ok) {
        alert(data.message);
      } else {
        console.error('Error del servidor:', data.error);
        alert(`Error al enviar el reporte: ${data.error}`);
      }
    } catch (error) {
      console.error('Error en la conexión:', error);
      alert('Error en la conexión con el servidor. Verifica que el backend esté en ejecución.');
    }
  };

  const handleScheduleReport = async () => {
    if (!reportConfig.email) {
      alert('Por favor, ingresa un correo electrónico');
      return;
    }

    try {
      const response = await apiFetch('/schedule-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: reportConfig.email,
          frequency: reportConfig.frequency
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setReportConfig({
          ...reportConfig,
          isScheduled: true
        });
        alert(data.message + '\n\nLa configuración se mantendrá activa incluso si recargas la página.');
      } else {
        console.error('Error del servidor:', data.error);
        alert(`Error al programar el reporte: ${data.error}`);
      }
    } catch (error) {
      console.error('Error en la conexión:', error);
      alert('Error en la conexión con el servidor. Verifica que el backend esté en ejecución.');
    }
  };

  const handleStopReport = async () => {
    try {
      const response = await apiFetch('/stop-report', {
        method: 'POST',
      });

      const data = await response.json();
      if (response.ok) {
        setReportConfig({ ...reportConfig, isScheduled: false });
        alert(data.message);
      } else {
        console.error('Error del servidor:', data.error);
        alert(`Error al detener el reporte: ${data.error}`);
      }
    } catch (error) {
      console.error('Error en la conexión:', error);
      alert('Error en la conexión con el servidor. Verifica que el backend esté en ejecución.');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setReportFilters({ ...reportFilters, [name]: value });
  };

  const filterLoansByReportFilters = () => {
    return loans.filter(loan => {
      const loanDate = new Date(loan.loanDate);
      const returnDate = new Date(loan.returnDate);

      const matchesDateRange =
        (!reportFilters.startDate || loanDate >= new Date(reportFilters.startDate)) &&
        (!reportFilters.endDate || returnDate <= new Date(reportFilters.endDate));

      const matchesPartner =
        !reportFilters.partner || (loan.partner || '').toLowerCase().includes(reportFilters.partner.toLowerCase());

      const matchesClient =
        !reportFilters.client || (loan.client || '').toLowerCase().includes(reportFilters.client.toLowerCase());

      const isActiveOrOverdue = loan.status !== 'devuelto';

      return matchesDateRange && matchesPartner && matchesClient && isActiveOrOverdue;
    });
  };

  const exportToExcel = (data) => {
    import('xlsx').then((XLSX) => {
      const worksheet = XLSX.utils.json_to_sheet(
        data.map(loan => ({
          Estado: loan.status,
          Cliente: loan.client,
          Partner: loan.partner,
          Responsable: loan.responsible,
          Dispositivos: (loan.devices || []).map(device => device.equipmentName).join(', '),
          'Fecha Préstamo': loan.loanDate,
          'Fecha Devolución': loan.returnDate,
          'Días de Atraso': loan.status === 'atrasado' ? calculateOverdueDays(loan.returnDate) : '0'
        }))
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Préstamos');
      XLSX.writeFile(workbook, 'reporte_prestamos.xlsx');
    });
  };

  const handleExportReport = async (format) => {
    const filteredData = filterLoansByReportFilters();

    if (format === 'Excel') {
      exportToExcel(filteredData);
    } else if (format === 'PDF') {
      try {
        const { jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');

        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text('Reporte de Préstamos', 14, 15);

        doc.setFontSize(12);
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 25);

        doc.setFontSize(14);
        doc.text('Resumen', 14, 35);

        const stats = [
          ['Total de préstamos', filteredData.length.toString()],
          ['Préstamos activos', filteredData.filter(loan => loan.status === 'activo').length.toString()],
          ['Préstamos atrasados', filteredData.filter(loan => loan.status === 'atrasado').length.toString()]
        ];

        autoTable(doc, {
          startY: 40,
          head: [['Concepto', 'Cantidad']],
          body: stats,
          styles: { fontSize: 10 },
          headStyles: { fillColor: [41, 128, 185] }
        });

        doc.setFontSize(14);
        doc.text('Detalle de Préstamos', 14, doc.lastAutoTable.finalY + 10);

        const tableData = filteredData.map(loan => [
          loan.client,
          loan.partner,
          loan.responsible,
          (loan.devices || []).map(d => d.equipmentName).join(', '),
          loan.loanDate,
          loan.returnDate,
          loan.status === 'atrasado' ?
            `${loan.status} (${calculateOverdueDays(loan.returnDate)} días)` :
            loan.status
        ]);

        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 15,
          head: [['Cliente', 'Partner', 'Responsable', 'Dispositivos', 'Fecha Préstamo', 'Fecha Devolución', 'Estado']],
          body: tableData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [41, 128, 185] },
          columnStyles: {
            6: { cellWidth: 'auto' }
          }
        });

        doc.save('reporte_prestamos.pdf');
      } catch (error) {
        console.error('Error al generar PDF:', error);
        alert('Error al generar el PDF. Verifica la consola para más detalles.');
      }
    }
  };

  const filteredLoans = loans.filter(loan => {
    const matchesStatus =
      activeTab === 'activos' ? loan.status !== 'devuelto' :
      activeTab === 'archivo' ? loan.status === 'devuelto' :
      true;
    const matchesSearch =
      (loan.partner || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loan.responsible || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loan.client || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loan.devices && loan.devices.some(device =>
        (device.equipmentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (device.equipmentSerial || '').toLowerCase().includes(searchTerm.toLowerCase())
      ));
    return matchesStatus && matchesSearch;
  }).sort((a, b) => {
    // Ordenar según la opción seleccionada
    if (sortBy === 'creation') {
      return b.id - a.id; // Más recientes primero
    } else if (sortBy === 'overdue') {
      const overdueDaysA = a.status === 'atrasado' ? calculateOverdueDays(a.returnDate) : 0;
      const overdueDaysB = b.status === 'atrasado' ? calculateOverdueDays(b.returnDate) : 0;
      return overdueDaysB - overdueDaysA; // Mayor atraso primero
    }
    return 0;
  });

  const stats = {
    total: loans.length,
    activos: loans.filter(loan => loan.status !== 'devuelto').length,
    devueltos: loans.filter(loan => loan.status === 'devuelto').length,
    atrasados: loans.filter(loan => loan.status === 'atrasado').length,
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-line border-t-circuit rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-ink-muted font-medium">Cargando préstamos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="h-1 bg-circuit" />
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 gap-6">
          <div className="flex items-center gap-4">
            {branding.hasLogo && (
              <img
                src={`${API_URL}/branding/logo?v=${branding.logoVersion}`}
                alt={branding.title}
                className="h-14 w-auto"
              />
            )}
            <div>
              <p className="font-mono text-xs font-medium text-ink-muted uppercase tracking-widest mb-2">Showroom · Gestión de Activos</p>
              <h1 className="font-display text-3xl font-bold text-ink tracking-tight">{branding.title}</h1>
              <p className="text-sm text-ink-muted mt-1">
                {isAdmin ? 'Gestiona y controla todos los préstamos de equipos en un solo lugar' : 'Reporte de préstamos de equipos del showroom'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setEditingId(null);
                  setFormData({
                    client: '',
                    partner: '',
                    responsible: '',
                    loanDate: '',
                    returnDate: '',
                    comments: '',
                    document: null,
                    devices: [{ equipmentName: '', equipmentSerial: '' }],
                  });
                  setShowForm(true);
                }}
                className={UI.btnPrimary}
              >
                <FiPlus className="text-base" /> Nuevo Préstamo
              </button>
              <button
                onClick={() => setShowReportConfig(true)}
                className={UI.btnSecondary}
              >
                <FiSettings className="text-base" /> Configurar Reportes
              </button>
              <button
                onClick={() => setShowAdminPanel(true)}
                className={UI.btnSecondary}
              >
                <FiSliders className="text-base" /> Administración
              </button>
            </div>
          )}
        </div>

        {showAdminPanel && (
          <AdminPanel
            branding={branding}
            onBrandingChange={loadBranding}
            onLogout={handleLogout}
            onClose={() => setShowAdminPanel(false)}
          />
        )}

        {showForm && (
          <div className={UI.panel}>
            <h2 className="font-display text-xl font-bold text-ink mb-6">{editingId ? 'Editar Préstamo' : 'Nuevo Préstamo'}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={UI.label}>Cliente</label>
                  <input
                    type="text"
                    name="client"
                    value={formData.client}
                    onChange={handleInputChange}
                    placeholder="Nombre del cliente"
                    className={UI.input}
                    required
                  />
                </div>
                <div>
                  <label className={UI.label}>Partner</label>
                  <input
                    type="text"
                    name="partner"
                    value={formData.partner}
                    onChange={handleInputChange}
                    placeholder="Nombre del partner"
                    className={UI.input}
                    required
                  />
                </div>
                <div>
                  <label className={UI.label}>Responsable</label>
                  <input
                    type="text"
                    name="responsible"
                    value={formData.responsible}
                    onChange={handleInputChange}
                    placeholder="Nombre del responsable"
                    className={UI.input}
                    required
                  />
                </div>
                <div></div>
                <div>
                  <label className={UI.label}>Fecha de préstamo</label>
                  <input
                    type="date"
                    name="loanDate"
                    value={formData.loanDate}
                    onChange={handleInputChange}
                    className={UI.input}
                    required
                  />
                </div>
                <div>
                  <label className={UI.label}>Fecha prevista de devolución</label>
                  <input
                    type="date"
                    name="returnDate"
                    value={formData.returnDate}
                    onChange={handleInputChange}
                    className={UI.input}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={UI.label}>Dispositivos</label>
                  {formData.devices.map((device, index) => (
                    <div key={index} className="flex gap-3 mb-3">
                      <input
                        type="text"
                        name="equipmentName"
                        value={device.equipmentName}
                        onChange={(e) => handleDeviceChange(index, e)}
                        placeholder="Nombre del dispositivo"
                        className={UI.input}
                        required
                      />
                      <input
                        type="text"
                        name="equipmentSerial"
                        value={device.equipmentSerial}
                        onChange={(e) => handleDeviceChange(index, e)}
                        placeholder="Serial del dispositivo"
                        className={`${UI.input} font-mono`}
                        required
                      />
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => removeDevice(index)}
                          className={`${UI.iconGhostDanger} p-2`}
                          title="Eliminar dispositivo"
                        >
                          <FiTrash2 className="text-lg" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addDevice}
                    className={`${UI.btnGhost} mt-1`}
                  >
                    <FiPlus className="text-sm" /> Agregar otro dispositivo
                  </button>
                </div>
                <div className="md:col-span-2">
                  <label className={UI.label}>Documento adjunto</label>
                  <label className={`${UI.btnGhost} cursor-pointer`}>
                    <FiPaperclip className="text-sm" />
                    <span>Adjuntar documento</span>
                    <input
                      type="file"
                      name="file"
                      onChange={handleDocumentChange}
                      className="hidden"
                    />
                  </label>
                  {formData.document && (
                    <p className="text-xs text-ink-muted font-mono mt-2">{formData.document}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className={UI.label}>Comentarios adicionales</label>
                  <textarea
                    name="comments"
                    value={formData.comments}
                    onChange={handleInputChange}
                    placeholder="Agrega comentarios adicionales..."
                    className={`${UI.input} h-28 resize-none`}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className={UI.btnSecondary}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={UI.btnPrimary}
                >
                  {editingId ? 'Guardar Cambios' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        )}

        {showReportConfig && (
          <div className={UI.panel}>
            <h2 className="font-display text-xl font-bold text-ink mb-6">Configuración de Envío de Reportes</h2>
            <div className="space-y-6">
              <div>
                <label className={UI.label}>Correo electrónico</label>
                <input
                  type="email"
                  name="email"
                  value={reportConfig.email}
                  onChange={handleReportConfigChange}
                  placeholder="ejemplo@correo.com"
                  className={UI.input}
                  required
                />
              </div>
              <div>
                <label className={UI.label}>Frecuencia de envío</label>
                <select
                  name="frequency"
                  value={reportConfig.frequency}
                  onChange={handleReportConfigChange}
                  className={UI.input}
                >
                  <option value="daily">Diario</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </div>
              <div className="flex flex-wrap justify-end gap-3 pt-6 mt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowReportConfig(false)}
                  className={UI.btnSecondary}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleSendReportNow}
                  className={UI.btnSecondary}
                >
                  <FiMail className="text-base" /> Enviar Reporte Ahora
                </button>
                {!reportConfig.isScheduled ? (
                  <button
                    type="button"
                    onClick={handleScheduleReport}
                    className={UI.btnPrimary}
                  >
                    Programar Envío Automático
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopReport}
                    className={UI.btnDangerOutline}
                  >
                    Detener Envío Automático
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={UI.panel}>
          {isAdmin && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <FiSearch className="text-ink-muted text-base flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar por equipo, serial o partner..."
                  className={UI.input}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {activeTab === 'activos' && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide whitespace-nowrap">Ordenar por</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className={`${UI.input} py-2`}
                  >
                    <option value="creation">Más recientes primero</option>
                    <option value="overdue">Mayor atraso primero</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="flex gap-6 border-b border-line mb-6">
              <button
                onClick={() => setActiveTab('activos')}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${activeTab === 'activos' ? 'text-circuit border-circuit' : 'text-ink-muted border-transparent hover:text-ink'}`}
              >
                <FiFileText className="text-base" /> Préstamos Activos
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === 'activos' ? 'bg-circuit-soft text-circuit' : 'bg-paper text-ink-muted'}`}>
                  {stats.activos}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('archivo')}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${activeTab === 'archivo' ? 'text-circuit border-circuit' : 'text-ink-muted border-transparent hover:text-ink'}`}
              >
                <FiArchive className="text-base" /> Archivo
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === 'archivo' ? 'bg-circuit-soft text-circuit' : 'bg-paper text-ink-muted'}`}>
                  {stats.devueltos}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('reportes')}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${activeTab === 'reportes' ? 'text-circuit border-circuit' : 'text-ink-muted border-transparent hover:text-ink'}`}
              >
                <FiFileText className="text-base" /> Reportes
              </button>
            </div>
          )}

          {(!isAdmin || activeTab === 'reportes') && (
            <div>
              <div className="flex justify-end gap-3 mb-6">
                <button
                  onClick={() => handleExportReport('PDF')}
                  className={UI.btnSecondary}
                >
                  <FiFileText className="text-base" /> Exportar a PDF
                </button>
                <button
                  onClick={() => handleExportReport('Excel')}
                  className={UI.btnSecondary}
                >
                  <FiFileText className="text-base" /> Exportar a Excel
                </button>
              </div>

              <div className="bg-paper rounded-lg p-5 mb-6 border border-line">
                <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4">Filtros</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className={UI.label}>Fecha inicio</label>
                    <input
                      type="date"
                      name="startDate"
                      value={reportFilters.startDate}
                      onChange={handleFilterChange}
                      className={UI.input}
                    />
                  </div>
                  <div>
                    <label className={UI.label}>Fecha fin</label>
                    <input
                      type="date"
                      name="endDate"
                      value={reportFilters.endDate}
                      onChange={handleFilterChange}
                      className={UI.input}
                    />
                  </div>
                  <div>
                    <label className={UI.label}>Partner</label>
                    <input
                      type="text"
                      name="partner"
                      value={reportFilters.partner}
                      onChange={handleFilterChange}
                      placeholder="Filtrar por partner"
                      className={UI.input}
                    />
                  </div>
                  <div>
                    <label className={UI.label}>Cliente</label>
                    <input
                      type="text"
                      name="client"
                      value={reportFilters.client}
                      onChange={handleFilterChange}
                      placeholder="Filtrar por cliente"
                      className={UI.input}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg border border-line p-4">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Total de préstamos</p>
                  <p className="font-mono text-2xl font-bold text-ink">{stats.total}</p>
                </div>
                <div className="rounded-lg border border-signal-green-line bg-signal-green-soft p-4">
                  <p className="text-xs font-semibold text-signal-green uppercase tracking-wide mb-1.5">Préstamos activos</p>
                  <p className="font-mono text-2xl font-bold text-signal-green">{stats.activos}</p>
                </div>
                <div className="rounded-lg border border-signal-amber-line bg-signal-amber-soft p-4">
                  <p className="text-xs font-semibold text-signal-amber uppercase tracking-wide mb-1.5">Préstamos atrasados</p>
                  <p className="font-mono text-2xl font-bold text-signal-amber">{stats.atrasados}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="rounded-lg border border-line p-4">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Promedio de días de préstamo</p>
                  <p className="font-mono text-xl font-bold text-ink">
                    {loans.length > 0 ?
                      Math.round(loans.reduce((acc, loan) => {
                        const loanDate = new Date(loan.loanDate);
                        const returnDate = new Date(loan.returnDate);
                        const diffTime = returnDate - loanDate;
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return acc + diffDays;
                      }, 0) / loans.length)
                      : 0} días
                  </p>
                </div>
                <div className="rounded-lg border border-line p-4">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Promedio de días de atraso</p>
                  <p className="font-mono text-xl font-bold text-ink">
                    {loans.filter(loan => loan.status === 'atrasado').length > 0 ?
                      Math.round(loans.filter(loan => loan.status === 'atrasado').reduce((acc, loan) => {
                        return acc + calculateOverdueDays(loan.returnDate);
                      }, 0) / loans.filter(loan => loan.status === 'atrasado').length)
                      : 0} días
                  </p>
                </div>
                <div className="rounded-lg border border-line p-4">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Partner con más préstamos</p>
                  <p className="font-display text-lg font-bold text-ink truncate">
                    {(() => {
                      if (loans.length === 0) return 'N/A';
                      const partnerCounts = {};
                      loans.forEach(loan => {
                        partnerCounts[loan.partner] = (partnerCounts[loan.partner] || 0) + 1;
                      });
                      let maxPartner = '';
                      let maxCount = 0;
                      for (const partner in partnerCounts) {
                        if (partnerCounts[partner] > maxCount) {
                          maxPartner = partner;
                          maxCount = partnerCounts[partner];
                        }
                      }
                      return maxPartner || 'N/A';
                    })()}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-display text-lg font-bold text-ink mb-4">Detalle de préstamos</h3>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="min-w-full divide-y divide-line">
                    <thead className="bg-paper">
                      <tr>
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Estado</th>
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Cliente</th>
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Partner</th>
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Responsable</th>
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Dispositivos</th>
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Préstamo</th>
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Devolución</th>
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Atraso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-surface">
                      {filterLoansByReportFilters().map(loan => (
                        <tr key={loan.id} className="hover:bg-paper transition-colors duration-150">
                          <td className="py-3 px-4 text-sm">
                            <StatusBadge status={loan.status} />
                          </td>
                          <td className="py-3 px-4 text-sm text-ink">{loan.client}</td>
                          <td className="py-3 px-4 text-sm text-ink">{loan.partner}</td>
                          <td className="py-3 px-4 text-sm text-ink font-bold uppercase">{loan.responsible}</td>
                          <td className="py-3 px-4 text-sm text-ink-muted font-mono">
                            {(loan.devices || []).map((device, index) => (
                              <div key={index} className="mb-1">
                                {device.equipmentName}
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-4 text-sm text-ink-muted font-mono">{loan.loanDate}</td>
                          <td className="py-3 px-4 text-sm text-ink-muted font-mono">{loan.returnDate}</td>
                          <td className="py-3 px-4 text-sm">
                            {loan.status === 'atrasado' ? (
                              <span className="font-mono font-semibold text-signal-amber">
                                {calculateOverdueDays(loan.returnDate)} días
                              </span>
                            ) : (
                              <span className="font-mono text-ink-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {isAdmin && activeTab !== 'reportes' && (
            <div className="space-y-3">
              {filteredLoans.length > 0 ? (
                filteredLoans.map(loan => (
                  <div key={loan.id} className={`${UI.card} p-4 transition-shadow duration-150 hover:shadow-card-hover`}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <div className="min-w-0">
                            <h3 className="font-display text-lg font-bold text-ink truncate">{loan.partner || 'Sin partner'}</h3>
                            <p className="text-sm font-semibold text-ink-muted uppercase">{loan.responsible}</p>
                            <p className="text-sm text-ink-muted mt-0.5">Cliente: {loan.client}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusSelect status={loan.status} onChange={(e) => handleStatusChange(loan.id, e.target.value)} />
                            {loan.status === 'atrasado' && (
                              <span className="text-xs font-semibold text-signal-amber bg-signal-amber-soft border border-signal-amber-line px-2 py-1 rounded-md">
                                {calculateOverdueDays(loan.returnDate)} días de atraso
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setExpandedLoanId(expandedLoanId === loan.id ? null : loan.id)}
                        className={`${UI.iconGhost} flex-shrink-0`}
                      >
                        {expandedLoanId === loan.id ? <FiChevronUp className="text-xl" /> : <FiChevronDown className="text-xl" />}
                      </button>
                    </div>

                    {expandedLoanId === loan.id && (
                      <div className="mt-4 pt-4 border-t border-line">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <h4 className={UI.label}>Dispositivos</h4>
                            {(loan.devices || []).map((device, index) => (
                              <div key={index} className="mb-1.5 text-sm">
                                <span className="font-medium text-ink">{device.equipmentName}</span>
                                <span className="font-mono text-ink-muted ml-2">{device.equipmentSerial}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <h4 className={UI.label}>Fechas</h4>
                            <p className="text-sm text-ink mb-1">
                              <span className="text-ink-muted">Préstamo</span> <span className="font-mono">{loan.loanDate}</span>
                            </p>
                            <p className="text-sm text-ink">
                              <span className="text-ink-muted">Devolución</span> <span className="font-mono">{loan.returnDate}</span>
                            </p>
                          </div>
                        </div>

                        {loan.document && (
                          <div className="mt-4 flex items-center gap-2 text-sm">
                            <FiPaperclip className="text-ink-muted" />
                            <span className="text-ink-muted font-mono truncate">{loan.document}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadDocument(loan.document)
                              }}
                              className={UI.iconGhost}
                              title="Descargar documento"
                            >
                              <FiDownload />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDocument(loan.id, loan.document)
                              }}
                              className={UI.iconGhostDanger}
                              title="Eliminar documento"
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        )}

                        {loan.comments && (
                          <div className="mt-4">
                            <h4 className={UI.label}>Comentarios</h4>
                            <p className="text-sm text-ink-muted">{loan.comments}</p>
                          </div>
                        )}

                        <div className="flex justify-end gap-4 mt-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(loan)
                            }}
                            className={UI.btnGhost}
                          >
                            <FiEdit className="text-sm" /> Editar
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLoan(loan.id)
                            }}
                            className={UI.btnGhostDanger}
                          >
                            <FiTrash2 className="text-sm" /> Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-ink-muted">No hay préstamos que coincidan con tu búsqueda.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`${UI.card} p-5`}>
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Total</p>
              <p className="font-mono text-2xl font-bold text-ink">{stats.total}</p>
            </div>
            <div className="rounded-xl border border-signal-green-line bg-signal-green-soft p-5">
              <p className="text-xs font-semibold text-signal-green uppercase tracking-wide mb-1.5">Activos</p>
              <p className="font-mono text-2xl font-bold text-signal-green">{stats.activos}</p>
            </div>
            <div className="rounded-xl border border-signal-slate-line bg-signal-slate-soft p-5">
              <p className="text-xs font-semibold text-signal-slate uppercase tracking-wide mb-1.5">Devueltos</p>
              <p className="font-mono text-2xl font-bold text-signal-slate">{stats.devueltos}</p>
            </div>
            <div className="rounded-xl border border-signal-amber-line bg-signal-amber-soft p-5">
              <p className="text-xs font-semibold text-signal-amber uppercase tracking-wide mb-1.5">Atrasados</p>
              <p className="font-mono text-2xl font-bold text-signal-amber">{stats.atrasados}</p>
            </div>
          </div>
        )}

        {!isAdmin && (
          <footer className="mt-10 flex justify-center">
            <button
              onClick={() => setShowLogin(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors duration-150 hover:text-circuit"
            >
              <FiLock className="text-xs" /> Acceso administrador
            </button>
          </footer>
        )}

        {showLogin && (
          <LoginModal
            onSuccess={() => { setShowLogin(false); setIsAdmin(true); }}
            onClose={() => setShowLogin(false)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
