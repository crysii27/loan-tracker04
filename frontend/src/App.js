import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiPaperclip, FiSearch, FiFileText, FiArchive, FiHardDrive, FiDownload, FiMail, FiSettings, FiChevronDown, FiChevronUp, FiLock, FiSliders, FiX, FiBell } from 'react-icons/fi';
import { API_URL, apiFetch, getToken, clearToken, setSessionExpiredHandler, downloadFile } from './api';
import LoginModal from './LoginModal';
import AdminPanel from './AdminPanel';
import InventoryTab from './InventoryTab';
import EquipmentPicker from './EquipmentPicker';
import { UI, StatusBadge, StatusSelect } from './theme';

// Filtros compartidos por Reportes, Préstamos en Curso y Archivo (Estado se evalúa aparte, solo aplica en Reportes)
const matchesCommonFilters = (loan, filters) => {
  const loanDate = new Date(loan.loanDate);
  const matchesDateRange =
    (!filters.loanDateFrom || loanDate >= new Date(filters.loanDateFrom)) &&
    (!filters.loanDateTo || loanDate <= new Date(filters.loanDateTo));
  const matchesPartner = !filters.partner || loan.partner === filters.partner;
  const matchesClient = !filters.client || loan.client === filters.client;
  const matchesResponsible = !filters.responsible || loan.responsible === filters.responsible;
  const matchesEquipmentOwner =
    !filters.equipmentOwner || (loan.devices || []).some(device => device.equipmentOwner === filters.equipmentOwner);
  return matchesDateRange && matchesPartner && matchesClient && matchesResponsible && matchesEquipmentOwner;
};

const countActiveFilters = (filters) => Object.values(filters).filter(Boolean).length;

function App() {
  // Estados
  const [loans, setLoans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({
    client: '',
    partner: '',
    responsible: '',
    responsibleEmail: '',
    loanDate: '',
    returnDate: '',
    comments: '',
    document: null,
    devices: [{ equipmentName: '', equipmentSerial: '', equipmentOwner: '', inventoryEquipmentId: null }],
  });

  const [editingId, setEditingId] = useState(null);
  const [linkWarnings, setLinkWarnings] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('activos');
  const [searchTerm, setSearchTerm] = useState('');
  const [showReportConfig, setShowReportConfig] = useState(false);
  const [expandedLoanId, setExpandedLoanId] = useState(null);

  const [reportConfig, setReportConfig] = useState({
    emails: [],
    frequency: 'daily',
    isScheduled: false
  });
  const [emailInput, setEmailInput] = useState('');
  const [emailInputError, setEmailInputError] = useState('');

  const [alertConfig, setAlertConfig] = useState({
    enabled: false,
    preDueDays: [7, 3, 1],
    overdueIntervalDays: 3,
    lastRun: null
  });
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [preDueDayInput, setPreDueDayInput] = useState('');
  const [preDueDayInputError, setPreDueDayInputError] = useState('');

  const [reportFilters, setReportFilters] = useState({
    loanDateFrom: '',
    loanDateTo: '',
    partner: '',
    client: '',
    responsible: '',
    equipmentOwner: '',
    status: '',
  });

  // Filtros compartidos por las pestañas "Préstamos en Curso" y "Archivo" (revelado progresivo: ocultos por defecto)
  const [listFilters, setListFilters] = useState({
    loanDateFrom: '',
    loanDateTo: '',
    partner: '',
    client: '',
    responsible: '',
    equipmentOwner: '',
  });
  const [showListFilters, setShowListFilters] = useState(false);
  const [showReportFilters, setShowReportFilters] = useState(false);

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
    // fetch directo (no apiFetch): si el token ya expiró, el 401 no debe disparar la alerta de sesión expirada
    const token = getToken();
    if (token) {
      try {
        await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch { /* sin conexión: igual cerramos localmente */ }
    }
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
            emails: config.emails || [],
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

  // Cargar configuración de alertas (solo admin)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchAlertConfig = async () => {
      try {
        const response = await apiFetch('/alert-config');
        if (!response.ok) return;
        const config = await response.json();
        setAlertConfig(config);
      } catch (error) {
        console.error('Error cargando configuración de alertas:', error);
      }
    };
    fetchAlertConfig();
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
    updatedDevices[index] = { ...updatedDevices[index], [name]: value };
    if (updatedDevices[index].inventoryEquipmentId) {
      updatedDevices[index].inventoryEquipmentId = null;
      const updatedWarnings = { ...linkWarnings };
      delete updatedWarnings[index];
      setLinkWarnings(updatedWarnings);
    }
    setFormData({ ...formData, devices: updatedDevices });
  };

  const handleDeviceLink = (index, equipment) => {
    const updatedDevices = [...formData.devices];
    updatedDevices[index] = {
      ...updatedDevices[index],
      equipmentName: equipment.name,
      equipmentSerial: equipment.serial,
      equipmentOwner: equipment.owner || '',
      inventoryEquipmentId: equipment.id,
    };
    setFormData({ ...formData, devices: updatedDevices });
    setLinkWarnings({ ...linkWarnings, [index]: equipment.status === 'prestado' });
  };

  const handleDeviceUnlink = (index) => {
    const updatedDevices = [...formData.devices];
    updatedDevices[index] = { ...updatedDevices[index], inventoryEquipmentId: null };
    setFormData({ ...formData, devices: updatedDevices });
    const updatedWarnings = { ...linkWarnings };
    delete updatedWarnings[index];
    setLinkWarnings(updatedWarnings);
  };

  const addDevice = () => {
    setFormData({
      ...formData,
      devices: [...formData.devices, { equipmentName: '', equipmentSerial: '', equipmentOwner: '', inventoryEquipmentId: null }]
    });
  };

  const removeDevice = (index) => {
    const updatedDevices = [...formData.devices];
    updatedDevices.splice(index, 1);
    setFormData({ ...formData, devices: updatedDevices });
    setLinkWarnings({});
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
        responsibleEmail: '',
        loanDate: '',
        returnDate: '',
        comments: '',
        document: null,
        devices: [{ equipmentName: '', equipmentSerial: '', equipmentOwner: '', inventoryEquipmentId: null }],
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
      responsibleEmail: loan.responsibleEmail || '',
      // Normaliza dispositivos guardados antes de que existieran "Dueño del equipo" / vínculo de inventario
      devices: (loan.devices && loan.devices.length > 0)
        ? loan.devices.map(device => ({ equipmentOwner: '', inventoryEquipmentId: null, ...device }))
        : [{ equipmentName: '', equipmentSerial: '', equipmentOwner: '', inventoryEquipmentId: null }]
    });
    setLinkWarnings({});
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

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const addEmailRecipient = () => {
    const value = emailInput.trim();
    if (!value) return;
    if (!isValidEmail(value)) {
      setEmailInputError('Ese correo no parece válido');
      return;
    }
    if (reportConfig.emails.includes(value)) {
      setEmailInputError('Ese correo ya está en la lista');
      return;
    }
    setReportConfig({ ...reportConfig, emails: [...reportConfig.emails, value] });
    setEmailInput('');
    setEmailInputError('');
  };

  const removeEmailRecipient = (email) => {
    setReportConfig({ ...reportConfig, emails: reportConfig.emails.filter(e => e !== email) });
  };

  const handleEmailInputKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmailRecipient();
    }
  };

  const addPreDueDay = () => {
    const value = parseInt(preDueDayInput, 10);
    if (isNaN(value) || value < 0) {
      setPreDueDayInputError('Ingresa un número de días válido (0 o más)');
      return;
    }
    if (alertConfig.preDueDays.includes(value)) {
      setPreDueDayInputError('Ese número de días ya está en la lista');
      return;
    }
    setAlertConfig({ ...alertConfig, preDueDays: [...alertConfig.preDueDays, value].sort((a, b) => b - a) });
    setPreDueDayInput('');
    setPreDueDayInputError('');
  };

  const removePreDueDay = (day) => {
    setAlertConfig({ ...alertConfig, preDueDays: alertConfig.preDueDays.filter(d => d !== day) });
  };

  const handlePreDueDayKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPreDueDay();
    }
  };

  const handleOverdueIntervalChange = (e) => {
    setAlertConfig({ ...alertConfig, overdueIntervalDays: Math.max(1, parseInt(e.target.value, 10) || 1) });
  };

  const handleSaveAlertConfig = async () => {
    if (alertConfig.preDueDays.length === 0) {
      alert('Agrega al menos un valor de días antes del vencimiento, o desactiva las alertas');
      return;
    }
    try {
      const response = await apiFetch('/alert-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: alertConfig.enabled,
          preDueDays: alertConfig.preDueDays,
          overdueIntervalDays: alertConfig.overdueIntervalDays
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setAlertConfig(data.config);
        alert('Configuración de alertas guardada');
      } else {
        alert(`Error al guardar la configuración: ${data.error}`);
      }
    } catch (error) {
      console.error('Error en la conexión:', error);
      alert('Error en la conexión con el servidor. Verifica que el backend esté en ejecución.');
    }
  };

  const handleSendReportNow = async () => {
    if (reportConfig.emails.length === 0) {
      alert('Agrega al menos un correo electrónico destinatario');
      return;
    }

    try {
      const response = await apiFetch('/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: reportConfig.emails,
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
    if (reportConfig.emails.length === 0) {
      alert('Agrega al menos un correo electrónico destinatario');
      return;
    }

    try {
      const response = await apiFetch('/schedule-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: reportConfig.emails,
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

  const handleListFilterChange = (e) => {
    const { name, value } = e.target;
    setListFilters({ ...listFilters, [name]: value });
  };

  const clearListFilters = () => {
    setListFilters({ loanDateFrom: '', loanDateTo: '', partner: '', client: '', responsible: '', equipmentOwner: '' });
  };

  const filterLoansByReportFilters = () => {
    return loans.filter(loan => {
      const matchesStatus = !reportFilters.status || loan.status === reportFilters.status;
      return matchesCommonFilters(loan, reportFilters) && matchesStatus;
    });
  };

  // Nombres únicos con préstamos, para los filtros desplegables
  const partnerOptions = [...new Set(loans.map(loan => loan.partner).filter(Boolean))].sort();
  const clientOptions = [...new Set(loans.map(loan => loan.client).filter(Boolean))].sort();
  const responsibleOptions = [...new Set(loans.map(loan => loan.responsible).filter(Boolean))].sort();
  const equipmentOwnerOptions = [...new Set(
    loans.flatMap(loan => (loan.devices || []).map(device => device.equipmentOwner)).filter(Boolean)
  )].sort();

  // Devoluciones: KPIs siempre calculados sobre todos los préstamos (no se ven afectados por los Filtros de arriba)
  const returnedLast30Days = loans.filter(loan => {
    if (loan.status !== 'devuelto' || !loan.returnedAt) return false;
    const diffDays = (Date.now() - new Date(loan.returnedAt).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  }).length;

  const returnedWithoutDate = loans.filter(loan => loan.status === 'devuelto' && !loan.returnedAt).length;

  const monthlyReturns = (() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }),
        count: 0,
      });
    }
    loans.forEach(loan => {
      if (loan.status === 'devuelto' && loan.returnedAt) {
        const d = new Date(loan.returnedAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const month = months.find(m => m.key === key);
        if (month) month.count += 1;
      }
    });
    return months;
  })();

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
    return matchesStatus && matchesSearch && matchesCommonFilters(loan, listFilters);
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

  // Segregación estricta: cada préstamo cuenta en un solo estado (activos y atrasados nunca se solapan)
  const stats = {
    total: loans.length,
    activos: loans.filter(loan => loan.status === 'activo').length,
    devueltos: loans.filter(loan => loan.status === 'devuelto').length,
    atrasados: loans.filter(loan => loan.status === 'atrasado').length,
  };
  // "En curso" agrupa activos + atrasados solo para la gestión operativa (la pestaña que lista ambos juntos)
  stats.enCurso = stats.activos + stats.atrasados;

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
              <p className="font-mono text-xs font-medium text-ink-muted uppercase tracking-widest mb-2">Gestión de Activos</p>
              <h1 className="font-display text-3xl font-bold text-ink tracking-tight">{branding.title}</h1>
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
                    responsibleEmail: '',
                    loanDate: '',
                    returnDate: '',
                    comments: '',
                    document: null,
                    devices: [{ equipmentName: '', equipmentSerial: '', equipmentOwner: '', inventoryEquipmentId: null }],
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
                onClick={() => setShowAlertConfig(true)}
                className={UI.btnSecondary}
              >
                <FiBell className="text-base" /> Alertas de Vencimiento
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
                <div>
                  <label className={UI.label}>Correo del responsable (opcional)</label>
                  <input
                    type="email"
                    name="responsibleEmail"
                    value={formData.responsibleEmail}
                    onChange={handleInputChange}
                    placeholder="correo@empresa.com"
                    className={UI.input}
                  />
                </div>
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
                    <div key={index} className="flex flex-col gap-3 mb-3 pb-3 border-b border-line last:border-b-0">
                      <div className="flex items-start gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
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
                        <input
                          type="text"
                          name="equipmentOwner"
                          value={device.equipmentOwner || ''}
                          onChange={(e) => handleDeviceChange(index, e)}
                          placeholder="Dueño del equipo (opcional)"
                          className={UI.input}
                        />
                      </div>
                      <div className="flex-1">
                        <EquipmentPicker
                          linkedEquipment={device.inventoryEquipmentId ? { name: device.equipmentName, serial: device.equipmentSerial } : null}
                          onSelect={(equipment) => handleDeviceLink(index, equipment)}
                          onUnlink={() => handleDeviceUnlink(index)}
                        />
                        {linkWarnings[index] && (
                          <p className="text-xs text-signal-amber mt-1">Este equipo ya figura prestado en otro préstamo activo</p>
                        )}
                      </div>
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => removeDevice(index)}
                          className={`${UI.iconGhostDanger} p-2 flex-shrink-0`}
                          title="Eliminar dispositivo"
                        >
                          <FiTrash2 className="text-lg" />
                        </button>
                      )}
                      </div>
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
                <label className={UI.label}>Destinatarios</label>
                <div className="flex gap-3">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); setEmailInputError(''); }}
                    onKeyDown={handleEmailInputKeyDown}
                    placeholder="correo@empresa.com — Enter para agregar"
                    className={UI.input}
                  />
                  <button type="button" onClick={addEmailRecipient} className={UI.btnSecondary}>
                    <FiPlus className="text-sm" /> Agregar
                  </button>
                </div>
                {emailInputError && (
                  <p className="text-xs font-medium text-signal-red mt-1.5">{emailInputError}</p>
                )}
                {reportConfig.emails.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {reportConfig.emails.map(email => (
                      <span key={email} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-paper border border-line text-sm text-ink">
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmailRecipient(email)}
                          className="text-ink-muted hover:text-signal-red rounded-full p-0.5"
                          title={`Quitar ${email}`}
                        >
                          <FiX className="text-xs" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted mt-2">Agrega al menos un correo destinatario.</p>
                )}
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

        {showAlertConfig && (
          <div className={UI.panel}>
            <h2 className="font-display text-xl font-bold text-ink mb-6">Alertas de Vencimiento</h2>
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="alertsEnabled"
                  checked={alertConfig.enabled}
                  onChange={(e) => setAlertConfig({ ...alertConfig, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="alertsEnabled" className="text-sm text-ink">Activar alertas automáticas por correo</label>
              </div>
              <div>
                <label className={UI.label}>Avisar N días antes del vencimiento</label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    min="0"
                    value={preDueDayInput}
                    onChange={(e) => { setPreDueDayInput(e.target.value); setPreDueDayInputError(''); }}
                    onKeyDown={handlePreDueDayKeyDown}
                    placeholder="Ej: 3 — Enter para agregar"
                    className={UI.input}
                  />
                  <button type="button" onClick={addPreDueDay} className={UI.btnSecondary}>
                    <FiPlus className="text-sm" /> Agregar
                  </button>
                </div>
                {preDueDayInputError && (
                  <p className="text-xs font-medium text-signal-red mt-1.5">{preDueDayInputError}</p>
                )}
                {alertConfig.preDueDays.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {alertConfig.preDueDays.map(day => (
                      <span key={day} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-paper border border-line text-sm text-ink">
                        {day} día(s) antes
                        <button
                          type="button"
                          onClick={() => removePreDueDay(day)}
                          className="text-ink-muted hover:text-signal-red rounded-full p-0.5"
                          title={`Quitar ${day}`}
                        >
                          <FiX className="text-xs" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted mt-2">Agrega al menos un umbral de días antes del vencimiento.</p>
                )}
              </div>
              <div>
                <label className={UI.label}>Repetir recordatorio de atraso cada (días)</label>
                <input
                  type="number"
                  min="1"
                  value={alertConfig.overdueIntervalDays}
                  onChange={handleOverdueIntervalChange}
                  className={UI.input}
                />
              </div>
              {alertConfig.lastRun && (
                <p className="text-xs text-ink-muted">Última ejecución: {new Date(alertConfig.lastRun).toLocaleString()}</p>
              )}
              <div className="flex flex-wrap justify-end gap-3 pt-6 mt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowAlertConfig(false)}
                  className={UI.btnSecondary}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAlertConfig}
                  className={UI.btnPrimary}
                >
                  Guardar Configuración
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={UI.panel}>
          {isAdmin && (activeTab === 'activos' || activeTab === 'archivo') && (
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
              <div className="flex items-center gap-2 flex-shrink-0">
                {(activeTab === 'activos' || activeTab === 'archivo') && (
                  <button
                    type="button"
                    onClick={() => setShowListFilters(!showListFilters)}
                    className={`${UI.btnSecondary} px-4 py-2`}
                  >
                    <FiSliders className="text-sm" /> Filtros
                    {countActiveFilters(listFilters) > 0 && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-circuit-soft text-circuit">
                        {countActiveFilters(listFilters)}
                      </span>
                    )}
                    {showListFilters ? <FiChevronUp className="text-sm" /> : <FiChevronDown className="text-sm" />}
                  </button>
                )}
                {activeTab === 'activos' && (
                  <div className="flex items-center gap-2">
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
            </div>
          )}

          {isAdmin && (activeTab === 'activos' || activeTab === 'archivo') && showListFilters && (
            <div className="bg-paper rounded-lg p-5 mb-6 border border-line">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-ink uppercase tracking-wide">Filtros</h3>
                <button type="button" onClick={clearListFilters} className={UI.btnGhost}>Limpiar filtros</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className={UI.label}>Partner</label>
                  <select name="partner" value={listFilters.partner} onChange={handleListFilterChange} className={UI.input}>
                    <option value="">Todos</option>
                    {partnerOptions.map(partner => (
                      <option key={partner} value={partner}>{partner}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={UI.label}>Cliente</label>
                  <select name="client" value={listFilters.client} onChange={handleListFilterChange} className={UI.input}>
                    <option value="">Todos</option>
                    {clientOptions.map(client => (
                      <option key={client} value={client}>{client}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={UI.label}>Responsable</label>
                  <select name="responsible" value={listFilters.responsible} onChange={handleListFilterChange} className={UI.input}>
                    <option value="">Todos</option>
                    {responsibleOptions.map(responsible => (
                      <option key={responsible} value={responsible}>{responsible}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={UI.label}>Dueño del equipo</label>
                  <select name="equipmentOwner" value={listFilters.equipmentOwner} onChange={handleListFilterChange} className={UI.input}>
                    <option value="">Todos</option>
                    {equipmentOwnerOptions.map(owner => (
                      <option key={owner} value={owner}>{owner}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={UI.label}>Préstamo desde</label>
                  <input type="date" name="loanDateFrom" value={listFilters.loanDateFrom} onChange={handleListFilterChange} className={UI.input} />
                </div>
                <div>
                  <label className={UI.label}>Préstamo hasta</label>
                  <input type="date" name="loanDateTo" value={listFilters.loanDateTo} onChange={handleListFilterChange} className={UI.input} />
                </div>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="flex gap-6 border-b border-line mb-6">
              <button
                onClick={() => setActiveTab('activos')}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${activeTab === 'activos' ? 'text-circuit border-circuit' : 'text-ink-muted border-transparent hover:text-ink'}`}
              >
                <FiFileText className="text-base" /> Préstamos en Curso
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === 'activos' ? 'bg-circuit-soft text-circuit' : 'bg-paper text-ink-muted'}`}>
                  {stats.enCurso}
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
              <button
                onClick={() => setActiveTab('inventario')}
                className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors duration-150 ${activeTab === 'inventario' ? 'text-circuit border-circuit' : 'text-ink-muted border-transparent hover:text-ink'}`}
              >
                <FiHardDrive className="text-base" /> Inventario
              </button>
            </div>
          )}

          {(!isAdmin || activeTab === 'reportes') && (
            <div>
              <div className="flex justify-between gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => setShowReportFilters(!showReportFilters)}
                  className={`${UI.btnSecondary} px-4 py-2`}
                >
                  <FiSliders className="text-sm" /> Filtros
                  {countActiveFilters(reportFilters) > 0 && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-circuit-soft text-circuit">
                      {countActiveFilters(reportFilters)}
                    </span>
                  )}
                  {showReportFilters ? <FiChevronUp className="text-sm" /> : <FiChevronDown className="text-sm" />}
                </button>
                <div className="flex gap-3">
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
              </div>

              {showReportFilters && (
              <div className="bg-paper rounded-lg p-5 mb-6 border border-line">
                <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4">Filtros</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className={UI.label}>Estado</label>
                    <select name="status" value={reportFilters.status} onChange={handleFilterChange} className={UI.input}>
                      <option value="">Todos</option>
                      <option value="activo">Activo (sin vencer)</option>
                      <option value="atrasado">Atrasado (vencido)</option>
                      <option value="devuelto">Devuelto</option>
                    </select>
                  </div>
                  <div>
                    <label className={UI.label}>Partner</label>
                    <select name="partner" value={reportFilters.partner} onChange={handleFilterChange} className={UI.input}>
                      <option value="">Todos</option>
                      {partnerOptions.map(partner => (
                        <option key={partner} value={partner}>{partner}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={UI.label}>Cliente</label>
                    <select name="client" value={reportFilters.client} onChange={handleFilterChange} className={UI.input}>
                      <option value="">Todos</option>
                      {clientOptions.map(client => (
                        <option key={client} value={client}>{client}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={UI.label}>Responsable</label>
                    <select name="responsible" value={reportFilters.responsible} onChange={handleFilterChange} className={UI.input}>
                      <option value="">Todos</option>
                      {responsibleOptions.map(responsible => (
                        <option key={responsible} value={responsible}>{responsible}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={UI.label}>Dueño del equipo</label>
                    <select name="equipmentOwner" value={reportFilters.equipmentOwner} onChange={handleFilterChange} className={UI.input}>
                      <option value="">Todos</option>
                      {equipmentOwnerOptions.map(owner => (
                        <option key={owner} value={owner}>{owner}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={UI.label}>Préstamo desde</label>
                    <input
                      type="date"
                      name="loanDateFrom"
                      value={reportFilters.loanDateFrom}
                      onChange={handleFilterChange}
                      className={UI.input}
                    />
                  </div>
                  <div>
                    <label className={UI.label}>Préstamo hasta</label>
                    <input
                      type="date"
                      name="loanDateTo"
                      value={reportFilters.loanDateTo}
                      onChange={handleFilterChange}
                      className={UI.input}
                    />
                  </div>
                </div>
              </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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
                <div className="rounded-lg border border-signal-slate-line bg-signal-slate-soft p-4">
                  <p className="text-xs font-semibold text-signal-slate uppercase tracking-wide mb-1.5">Devueltos (30 días)</p>
                  <p className="font-mono text-2xl font-bold text-signal-slate">{returnedLast30Days}</p>
                </div>
              </div>

              <div className="rounded-lg border border-line p-5 mb-8">
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-sm font-bold text-ink uppercase tracking-wide">Devoluciones por mes</h3>
                  {returnedWithoutDate > 0 && (
                    <p className="text-xs text-ink-muted">{returnedWithoutDate} devueltos antes de activar este registro no tienen fecha</p>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {monthlyReturns.map(month => {
                    const maxCount = Math.max(1, ...monthlyReturns.map(m => m.count));
                    return (
                      <div key={month.key} className="flex flex-col items-center gap-2">
                        <div className="w-full h-20 bg-paper rounded-md flex items-end overflow-hidden">
                          <div
                            className="w-full bg-circuit rounded-t-sm transition-all duration-300"
                            style={{ height: `${(month.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <p className="font-mono text-sm font-bold text-ink">{month.count}</p>
                        <p className="text-xs text-ink-muted capitalize">{month.label}</p>
                      </div>
                    );
                  })}
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
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Devolución prevista</th>
                        <th className="py-3 px-4 text-left text-xs font-bold text-ink-muted uppercase tracking-wide">Devuelto el</th>
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
                          <td className="py-3 px-4 text-sm text-ink-muted font-mono">
                            {loan.returnedAt ? new Date(loan.returnedAt).toLocaleDateString('es-CO') : '—'}
                          </td>
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

          {isAdmin && (activeTab === 'activos' || activeTab === 'archivo') && (
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
                                {device.equipmentOwner && (
                                  <span className="text-xs text-ink-muted ml-2">· dueño: {device.equipmentOwner}</span>
                                )}
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

          {isAdmin && activeTab === 'inventario' && <InventoryTab />}
        </div>

        {isAdmin && activeTab !== 'inventario' && (
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
