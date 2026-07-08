import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit, FiTrash2, FiPaperclip, FiMessageSquare, FiSearch, FiFileText, FiArchive, FiAlertCircle, FiDownload, FiMail, FiSettings, FiChevronDown, FiChevronUp } from 'react-icons/fi';

// URL del servidor - Cambia esto según tu configuración
const API_URL = 'http://172.24.100.115:5000';

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

  // Función para cargar préstamos desde el servidor
  const fetchLoans = async () => {
    try {
      const response = await fetch(`${API_URL}/loans`);
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
  
  // Cargar configuración de reportes al inicio
useEffect(() => {
  const fetchReportConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/report-config`);
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
}, []);
  

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
        await fetch(`${API_URL}/loans/${loan.id}`, {
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
    if (loans.length > 0) {
      updateLoanStatuses();
      const interval = setInterval(updateLoanStatuses, 60000);
      return () => clearInterval(interval);
    }
  }, [loans]);

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
      const response = await fetch(`${API_URL}/upload`, {
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
        const response = await fetch(`${API_URL}/loans/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (!response.ok) throw new Error('Error al actualizar');
        alert('Préstamo actualizado correctamente');
      } else {
        const response = await fetch(`${API_URL}/loans`, {
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
      const response = await fetch(`${API_URL}/loans/${id}`, {
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
        const response = await fetch(`${API_URL}/loans/${id}`, {
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
        const response = await fetch(`${API_URL}/delete-file/${documentName}`, {
          method: 'DELETE',
        });

        const data = await response.json();
        if (data.success) {
          const loan = loans.find(l => l.id === loanId);
          await fetch(`${API_URL}/loans/${loanId}`, {
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

  const handleDownloadDocument = (documentName) => {
    window.open(`${API_URL}/download/${documentName}`, '_blank');
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
      const response = await fetch(`${API_URL}/send-report`, {
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
	const response = await fetch(`${API_URL}/schedule-report`, {
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
      const response = await fetch(`${API_URL}/stop-report`, {
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
        !reportFilters.partner || loan.partner.toLowerCase().includes(reportFilters.partner.toLowerCase());

      const matchesClient =
        !reportFilters.client || loan.client.toLowerCase().includes(reportFilters.client.toLowerCase());

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
          Dispositivos: loan.devices.map(device => device.equipmentName).join(', '),
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
          loan.devices.map(d => d.equipmentName).join(', '),
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
    loan.partner.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loan.responsible.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loan.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (loan.devices && loan.devices.some(device =>
      device.equipmentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.equipmentSerial.toLowerCase().includes(searchTerm.toLowerCase())
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando préstamos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-8">
          <div className="mb-6 md:mb-0">
            <h1 className="text-3xl font-bold text-gray-800">Control de Préstamos Showroom</h1>
            <p className="text-gray-600">Gestiona y controla todos los préstamos de manera eficiente</p>
          </div>
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
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg transition duration-200"
            >
              <FiPlus className="text-lg" /> Nuevo Préstamo
            </button>
            <button
              onClick={() => setShowReportConfig(true)}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg transition duration-200"
            >
              <FiSettings className="text-lg" /> Configurar Reportes
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 mb-8">
            <h2 className="text-2xl font-semibold mb-6">{editingId ? 'Editar Préstamo' : 'Nuevo Préstamo'}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                  <input
                    type="text"
                    name="client"
                    value={formData.client}
                    onChange={handleInputChange}
                    placeholder="Nombre del cliente"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Partner</label>
                  <input
                    type="text"
                    name="partner"
                    value={formData.partner}
                    onChange={handleInputChange}
                    placeholder="Nombre del partner"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
                  <input
                    type="text"
                    name="responsible"
                    value={formData.responsible}
                    onChange={handleInputChange}
                    placeholder="Nombre del responsable"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div></div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de préstamo</label>
                  <input
                    type="date"
                    name="loanDate"
                    value={formData.loanDate}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha prevista de devolución</label>
                  <input
                    type="date"
                    name="returnDate"
                    value={formData.returnDate}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dispositivos</label>
                  {formData.devices.map((device, index) => (
                    <div key={index} className="flex gap-3 mb-3">
                      <input
                        type="text"
                        name="equipmentName"
                        value={device.equipmentName}
                        onChange={(e) => handleDeviceChange(index, e)}
                        placeholder="Nombre del dispositivo"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                      <input
                        type="text"
                        name="equipmentSerial"
                        value={device.equipmentSerial}
                        onChange={(e) => handleDeviceChange(index, e)}
                        placeholder="Serial del dispositivo"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => removeDevice(index)}
                          className="text-red-500 hover:text-red-700 p-2"
                          title="Eliminar dispositivo"
                        >
                          <FiTrash2 className="text-xl" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addDevice}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm mt-2"
                  >
                    <FiPlus /> Agregar otro dispositivo
                  </button>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Documento adjunto</label>
                  <label className="flex items-center gap-2 cursor-pointer text-blue-600 hover:text-blue-800">
                    <FiPaperclip />
                    <span>Adjuntar documento</span>
                    <input
                      type="file"
                      name="file"
                      onChange={handleDocumentChange}
                      className="hidden"
                    />
                  </label>
                  {formData.document && (
                    <p className="text-sm text-gray-600 mt-2">{formData.document}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios adicionales</label>
                  <textarea
                    name="comments"
                    value={formData.comments}
                    onChange={handleInputChange}
                    placeholder="Agrega comentarios adicionales..."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent h-32"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-5 py-2.5 rounded-lg transition duration-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg transition duration-200"
                >
                  {editingId ? 'Guardar Cambios' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        )}

        {showReportConfig && (
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 mb-8">
            <h2 className="text-2xl font-semibold mb-6">Configuración de Envío de Reportes</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  name="email"
                  value={reportConfig.email}
                  onChange={handleReportConfigChange}
                  placeholder="ejemplo@correo.com"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia de Envío</label>
                <select
                  name="frequency"
                  value={reportConfig.frequency}
                  onChange={handleReportConfigChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="daily">Diario</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleSendReportNow}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg transition duration-200"
                >
                  <FiMail /> Enviar Reporte Ahora
                </button>
                {!reportConfig.isScheduled ? (
                  <button
                    type="button"
                    onClick={handleScheduleReport}
                    className="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-5 py-2.5 rounded-lg transition duration-200"
                  >
                    Programar Envío Automático
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopReport}
                    className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg transition duration-200"
                  >
                    Detener Envío Automático
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowReportConfig(false)}
                  className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-5 py-2.5 rounded-lg transition duration-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 mb-8">
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3">
              <FiSearch className="text-gray-500 text-lg" />
              <input
                type="text"
                placeholder="Buscar por equipo, serial o partner..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {activeTab === 'activos' && (
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Ordenar por:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="creation">Más recientes primero</option>
                  <option value="overdue">Mayor atraso primero</option>
                </select>
              </div>
            )}
          </div>
        
        
          <div className="flex gap-4 border-b-2 border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('activos')}
              className={`flex items-center gap-2 pb-3 ${activeTab === 'activos' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <FiFileText className="text-lg" /> Préstamos Activos
              <span className="text-xs bg-blue-100 text-blue-600 px-2.5 py-1 rounded-full ml-2">
                {stats.activos}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('archivo')}
              className={`flex items-center gap-2 pb-3 ${activeTab === 'archivo' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <FiArchive className="text-lg" /> Archivo
              <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full ml-2">
                {stats.devueltos}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('reportes')}
              className={`flex items-center gap-2 pb-3 ${activeTab === 'reportes' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <FiFileText className="text-lg" /> Reportes
            </button>
          </div>

          {activeTab === 'reportes' && (
            <div className="bg-white p-6 rounded-xl shadow-md">
              <div className="flex justify-end gap-3 mb-6">
                <button
                  onClick={() => handleExportReport('PDF')}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition duration-200"
                >
                  <FiFileText /> Exportar a PDF
                </button>
                <button
                  onClick={() => handleExportReport('Excel')}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition duration-200"
                >
                  <FiFileText /> Exportar a Excel
                </button>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Filtros</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                    <input
                      type="date"
                      name="startDate"
                      value={reportFilters.startDate}
                      onChange={handleFilterChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                    <input
                      type="date"
                      name="endDate"
                      value={reportFilters.endDate}
                      onChange={handleFilterChange}
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Partner</label>
                    <input
                      type="text"
                      name="partner"
                      value={reportFilters.partner}
                      onChange={handleFilterChange}
                      placeholder="Filtrar por partner"
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                    <input
                      type="text"
                      name="client"
                      value={reportFilters.client}
                      onChange={handleFilterChange}
                      placeholder="Filtrar por cliente"
                      className="w-full p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-purple-50 p-4 rounded-xl shadow-sm border border-purple-100">
                  <p className="text-sm text-gray-600 mb-1">Total de préstamos</p>
                  <p className="text-2xl font-bold text-purple-700">{stats.total}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-xl shadow-sm border border-green-100">
                  <p className="text-sm text-gray-600 mb-1">Préstamos activos</p>
                  <p className="text-2xl font-bold text-green-700">{stats.activos}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-xl shadow-sm border border-yellow-100">
                  <p className="text-sm text-gray-600 mb-1">Préstamos atrasados</p>
                  <p className="text-2xl font-bold text-yellow-700">{stats.atrasados}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-purple-50 p-4 rounded-xl shadow-sm border border-purple-100">
                  <p className="text-sm text-gray-600 mb-1">Promedio de días de préstamo</p>
                  <p className="text-2xl font-bold text-purple-700">
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
                <div className="bg-blue-50 p-4 rounded-xl shadow-sm border border-blue-100">
                  <p className="text-sm text-gray-600 mb-1">Promedio de días de atraso</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {loans.filter(loan => loan.status === 'atrasado').length > 0 ?
                      Math.round(loans.filter(loan => loan.status === 'atrasado').reduce((acc, loan) => {
                        return acc + calculateOverdueDays(loan.returnDate);
                      }, 0) / loans.filter(loan => loan.status === 'atrasado').length)
                      : 0} días
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-xl shadow-sm border border-green-100">
                  <p className="text-sm text-gray-600 mb-1">Partner con más préstamos</p>
                  <p className="text-xl font-bold text-green-700">
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
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Detalle de Préstamos</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Estado</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Cliente</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Partner</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Responsable</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Dispositivos</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Fecha Préstamo</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Fecha Devolución</th>
                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700">Días de Atraso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterLoansByReportFilters().map(loan => (
                        <tr key={loan.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 border-b border-gray-200 text-sm text-gray-600">
                            <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                              loan.status === 'activo' ? 'bg-green-100 text-green-800' :
                              loan.status === 'devuelto' ? 'bg-gray-100 text-gray-800' :
                              'bg-yellow-200 text-yellow-800'
                            }`}>
                              {loan.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 border-b border-gray-200 text-sm text-gray-600">{loan.client}</td>
                          <td className="py-3 px-4 border-b border-gray-200 text-sm text-gray-600">{loan.partner}</td>
                          <td className="py-3 px-4 border-b border-gray-200 text-sm text-gray-600 font-bold uppercase">{loan.responsible}</td>
                          <td className="py-3 px-4 border-b border-gray-200 text-sm text-gray-600">
                            {loan.devices && loan.devices.map((device, index) => (
                              <div key={index} className="mb-1">
                                {device.equipmentName}
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-4 border-b border-gray-200 text-sm text-gray-600">{loan.loanDate}</td>
                          <td className="py-3 px-4 border-b border-gray-200 text-sm text-gray-600">{loan.returnDate}</td>
                          <td className="py-3 px-4 border-b border-gray-200 text-sm">
                            {loan.status === 'atrasado' ? (
                              <span className="text-red-600 font-medium">
                                {calculateOverdueDays(loan.returnDate)} días
                              </span>
                            ) : (
                              <span className="text-gray-500">0 días</span>
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

          {activeTab !== 'reportes' && (
            <div className="space-y-4">
              {filteredLoans.length > 0 ? (
                filteredLoans.map(loan => (
                  <div key={loan.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-4">
                          <div>
                            <h3 className="text-xl font-bold text-gray-800">{loan.partner}</h3>
                            <p className="text-lg text-gray-600 font-semibold uppercase">{loan.responsible}</p>
                            <p className="text-sm text-gray-500 mt-1">Cliente: {loan.client}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={loan.status}
                              onChange={(e) => handleStatusChange(loan.id, e.target.value)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                                loan.status === 'activo' ? 'bg-green-100 text-green-800' :
                                loan.status === 'devuelto' ? 'bg-gray-100 text-gray-800' :
                                'bg-yellow-200 text-yellow-800'
                              }`}
                            >
                              <option value="activo">Activo</option>
                              <option value="devuelto">Devuelto</option>
                              <option value="atrasado">Atrasado</option>
                            </select>
                            {loan.status === 'atrasado' && (
                              <span className="text-sm text-red-600 font-medium bg-red-50 px-2 py-1 rounded">
                                {calculateOverdueDays(loan.returnDate)} días de atraso
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setExpandedLoanId(expandedLoanId === loan.id ? null : loan.id)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {expandedLoanId === loan.id ? <FiChevronUp className="text-xl" /> : <FiChevronDown className="text-xl" />}
                      </button>
                    </div>

                    {expandedLoanId === loan.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Dispositivos</h4>
                            {loan.devices && loan.devices.map((device, index) => (
                              <div key={index} className="mb-2">
                                <p className="text-gray-600">
                                  <span className="font-medium">{device.equipmentName}</span>
                                  <span className="text-gray-500 ml-2">(Serial: {device.equipmentSerial})</span>
                                </p>
                              </div>
                            ))}
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Fechas</h4>
                            <p className="text-gray-600 mb-1">
                              <span className="font-medium">Préstamo:</span> {loan.loanDate}
                            </p>
                            <p className="text-gray-600">
                              <span className="font-medium">Devolución:</span> {loan.returnDate}
                            </p>
                          </div>
                        </div>

                        {loan.document && (
                          <div className="mt-4 flex items-center gap-2">
                            <FiPaperclip className="text-gray-500" />
                            <span className="text-sm text-gray-600">{loan.document}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadDocument(loan.document)
                              }}
                              className="text-blue-500 hover:text-blue-700"
                              title="Descargar documento"
                            >
                              <FiDownload />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDocument(loan.id, loan.document)
                              }}
                              className="text-red-500 hover:text-red-700"
                              title="Eliminar documento"
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        )}

                        {loan.comments && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Comentarios</h4>
                            <p className="text-sm text-gray-600">{loan.comments}</p>
                          </div>
                        )}

                        <div className="flex justify-end gap-3 mt-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(loan)
                            }}
                            className="flex items-center gap-1 text-blue-500 hover:text-blue-700 text-sm"
                          >
                            <FiEdit /> Editar
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLoan(loan.id)
                            }}
                            className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm"
                          >
                            <FiTrash2 /> Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">No hay préstamos para mostrar.</p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">Total de préstamos</p>
            <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-green-50 p-5 rounded-xl shadow-sm border border-green-100">
            <p className="text-sm text-gray-500 mb-1">Préstamos activos</p>
            <p className="text-2xl font-bold text-green-700">{stats.activos}</p>
          </div>
          <div className="bg-gray-50 p-5 rounded-xl shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">Préstamos devueltos</p>
            <p className="text-2xl font-bold text-gray-700">{stats.devueltos}</p>
          </div>
          <div className="bg-yellow-50 p-5 rounded-xl shadow-sm border border-yellow-100">
            <p className="text-sm text-gray-500 mb-1">Préstamos atrasados</p>
            <p className="text-2xl font-bold text-yellow-700">{stats.atrasados}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
