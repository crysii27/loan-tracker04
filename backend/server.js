const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
require('dotenv').config({ path: path.join(__dirname, 'credenciales.env') });

const app = express();
const PORT = process.env.PORT || 5000;

process.on('uncaughtException', (err) => {
  console.error('Error no manejado:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Rechazo no manejado:', err);
});

// Archivo para guardar préstamos
const LOANS_FILE = path.join(__dirname, 'loans.json');
const REPORT_CONFIG_FILE = path.join(__dirname, 'reportConfig.json');

// Funciones para manejar préstamos
const readLoans = () => {
  try {
    if (fs.existsSync(LOANS_FILE)) {
      const data = fs.readFileSync(LOANS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error leyendo préstamos:', error);
    return [];
  }
};

const saveLoans = (loans) => {
  try {
    fs.writeFileSync(LOANS_FILE, JSON.stringify(loans, null, 2));
    return true;
  } catch (error) {
    console.error('Error guardando préstamos:', error);
    return false;
  }
};

// Funciones para manejar configuración de reportes
const readReportConfig = () => {
  try {
    if (fs.existsSync(REPORT_CONFIG_FILE)) {
      const data = fs.readFileSync(REPORT_CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error leyendo configuración de reportes:', error);
    return null;
  }
};

const saveReportConfig = (config) => {
  try {
    fs.writeFileSync(REPORT_CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error guardando configuración de reportes:', error);
    return false;
  }
};

// Configuración de Multer para guardar archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .normalize('NFC')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .slice(0, 100) || 'archivo';
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  }
});

const upload = multer({ storage: storage });

// Middleware
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración del transporte de correo
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn('EMAIL_USER / EMAIL_PASS no están configurados en credenciales.env. El envío de reportes por correo fallará.');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Función para enviar el reporte por correo
const sendReportEmail = async (toEmail, loans) => {
  try {
    const today = new Date();
    const activeLoans = loans.filter(loan => loan.status !== 'devuelto');
    const overdueLoans = loans.filter(loan => loan.status === 'atrasado');

    const totalLoans = loans.length;
    const activeCount = activeLoans.length;
    const overdueCount = overdueLoans.length;

    const avgLoanDays = loans.length > 0 ?
      Math.round(loans.reduce((acc, loan) => {
        const loanDate = new Date(loan.loanDate);
        const returnDate = new Date(loan.returnDate);
        const diffTime = returnDate - loanDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return acc + diffDays;
      }, 0) / loans.length) : 0;

    const avgOverdueDays = overdueLoans.length > 0 ?
      Math.round(overdueLoans.reduce((acc, loan) => {
        const currentDate = new Date();
        const returnDate = new Date(loan.returnDate);
        const diffTime = currentDate - returnDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return acc + diffDays;
      }, 0) / overdueLoans.length) : 0;

    let topPartner = 'N/A';
    if (loans.length > 0) {
      const partnerCounts = {};
      loans.forEach(loan => {
        partnerCounts[loan.partner] = (partnerCounts[loan.partner] || 0) + 1;
      });
      topPartner = Object.entries(partnerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    }

    const calculateOverdueDays = (returnDate) => {
      const currentDate = new Date();
      const returnDateObj = new Date(returnDate);
      const diffTime = returnDateObj - currentDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays < 0 ? Math.abs(diffDays) : 0;
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
            .email-container { background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
            .header { background: linear-gradient(135deg, #4299e1, #3182ce); color: black; padding: 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 25px; }
            .stats-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
            .stat-card { background-color: #f8fafc; border-radius: 8px; padding: 15px; text-align: center; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); }
            .stat-number { font-size: 24px; font-weight: bold; margin: 10px 0; }
            .stat-active .stat-number { color: #48bb78; }
            .stat-overdue .stat-number { color: #f6ad55; }
            .stat-total .stat-number { color: #4299e1; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { background-color: #f8fafc; font-weight: bold; color: #4a5568; }
            tr:hover { background-color: #f9f9f9; }
            .status-badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
            .status-active { background-color: #e6fffa; color: #2c7a7b; }
            .status-overdue { background-color: #fed7aa; color: #9a3412; }
            .status-returned { background-color: #e2e8f0; color: #4a5568; }
            .footer { background-color: #f7fafc; padding: 15px; text-align: center; font-size: 12px; color: #718096; margin-top: 20px; border-top: 1px solid #e2e8f0; }
            .recommendations { background-color: #f7fafc; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .recommendations h3 { margin-top: 0; color: #4299e1; }
            .recommendations ul { padding-left: 20px; }
            .recommendations li { margin: 5px 0; }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <h1>Reporte de Préstamos de Equipos Showroom</h1>
              <p>Generado el ${today.toLocaleDateString()}</p>
            </div>
            <div class="content">
              <h2>Resumen Ejecutivo</h2>
              <p>Este reporte contiene información detallada sobre los préstamos activos y atrasados en el sistema.</p>
              <div class="stats-container">
                <div class="stat-card stat-total">
                  <div class="stat-label">Total de Préstamos</div>
                  <div class="stat-number">${totalLoans}</div>
                </div>
                <div class="stat-card stat-active">
                  <div class="stat-label">Préstamos Activos</div>
                  <div class="stat-number">${activeCount}</div>
                </div>
                <div class="stat-card stat-overdue">
                  <div class="stat-label">Préstamos Atrasados</div>
                  <div class="stat-number">${overdueCount}</div>
                </div>
              </div>
              <div class="stats-container">
                <div class="stat-card">
                  <div class="stat-label">Promedio de Días de Préstamo</div>
                  <div class="stat-number">${avgLoanDays} días</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Promedio de Días de Atraso</div>
                  <div class="stat-number">${avgOverdueDays} días</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Partner con Más Préstamos</div>
                  <div class="stat-number">${topPartner}</div>
                </div>
              </div>
              <h2>Préstamos Activos</h2>
              ${activeLoans.length > 0 ? `
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Partner</th>
                      <th>Responsable</th>
                      <th>Dispositivos</th>
                      <th>Fecha Préstamo</th>
                      <th>Fecha Devolución</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${activeLoans.slice(0, 10).map(loan => `
                      <tr>
                        <td>${loan.client}</td>
                        <td>${loan.partner}</td>
                        <td>${loan.responsible}</td>
                        <td>${loan.devices.map(d => d.equipmentName).join(', ')}</td>
                        <td>${loan.loanDate}</td>
                        <td>${loan.returnDate}</td>
                        <td>
                          <span class="status-badge ${
                            loan.status === 'activo' ? 'status-active' :
                            loan.status === 'atrasado' ? 'status-overdue' :
                            'status-returned'
                          }">${loan.status}</span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : '<p>No hay préstamos activos.</p>'}
              ${overdueLoans.length > 0 ? `
                <h2>Préstamos Atrasados</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Partner</th>
                      <th>Responsable</th>
                      <th>Dispositivos</th>
                      <th>Fecha Préstamo</th>
                      <th>Fecha Devolución</th>
                      <th>Días de Atraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${overdueLoans.slice(0, 10).map(loan => {
                      const overdueDays = calculateOverdueDays(loan.returnDate);
                      return `
                        <tr>
                          <td>${loan.partner}</td>
                          <td>${loan.responsible}</td>
                          <td>${loan.devices.map(d => d.equipmentName).join(', ')}</td>
                          <td>${loan.loanDate}</td>
                          <td>${loan.returnDate}</td>
                          <td>
                            <span class="status-badge status-overdue">${overdueDays} días</span>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              ` : ''}
              <div class="recommendations">
                <h3>Recomendaciones</h3>
                <ul>
                  <li>Revisar los préstamos atrasados y contactar a los responsables para su devolución.</li>
                  <li>Monitorear los préstamos que están por vencer en los próximos días.</li>
                  <li>Considerar establecer recordatorios automáticos para fechas de devolución.</li>
                <p>Para mayor detalle del reporte y los prestamos, conectate a la red del showroom y dirigete al siguiente link <a href="http://172.24.100.115">Control de prestamos</a> </p>
                  ${overdueCount > 0 ?
                    `<li>Atención especial a los ${overdueCount} préstamos actualmente atrasados.</li>` : ''}
                </ul>
              </div>
            </div>
            <div class="footer">
              <p>Sistema de Gestión de Préstamos de Equipos</p>
              <p>© ${new Date().getFullYear()} Todos los derechos reservados</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: `📊 Reporte de Préstamos - ${today.toLocaleDateString()}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Correo enviado:', info.messageId);

    return { success: true, message: 'Reporte enviado correctamente' };
  } catch (error) {
    console.error('Error detallado al enviar el reporte:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    return { success: false, error: error.message };
  }
};

const validateLoanPayload = (body) => {
  const requiredStringFields = ['client', 'partner', 'responsible', 'loanDate', 'returnDate'];
  for (const field of requiredStringFields) {
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      return { valid: false, error: `El campo "${field}" es obligatorio.` };
    }
  }
  if (!Array.isArray(body.devices) || body.devices.length === 0) {
    return { valid: false, error: 'Debe incluir al menos un dispositivo.' };
  }
  for (const device of body.devices) {
    if (typeof device.equipmentName !== 'string' || device.equipmentName.trim() === '') {
      return { valid: false, error: 'Cada dispositivo debe tener un nombre de equipo.' };
    }
    if (typeof device.equipmentSerial !== 'string' || device.equipmentSerial.trim() === '') {
      return { valid: false, error: 'Cada dispositivo debe tener un serial.' };
    }
  }
  return { valid: true };
};

// ========== RUTAS PARA PRÉSTAMOS ==========

// Obtener todos los préstamos
app.get('/loans', (req, res) => {
  const loans = readLoans();
  res.json(loans);
});

// Crear un nuevo préstamo
app.post('/loans', (req, res) => {
  const validation = validateLoanPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const loans = readLoans();
  const newLoan = {
    id: loans.length > 0 ? Math.max(...loans.map(l => l.id)) + 1 : 1,
    ...req.body,
    status: req.body.status || 'activo'
  };
  loans.push(newLoan);
  saveLoans(loans);
  res.json(newLoan);
});

// Actualizar un préstamo
app.put('/loans/:id', (req, res) => {
  const loans = readLoans();
  const index = loans.findIndex(l => l.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: 'Préstamo no encontrado' });
  }
  const merged = { ...loans[index], ...req.body, id: parseInt(req.params.id) };
  const validation = validateLoanPayload(merged);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  loans[index] = merged;
  saveLoans(loans);
  res.json(loans[index]);
});

// Eliminar un préstamo
app.delete('/loans/:id', (req, res) => {
  const loans = readLoans();
  const loan = loans.find(l => l.id === parseInt(req.params.id));
  
  // Eliminar documento adjunto si existe
  if (loan && loan.document) {
    const filePath = path.join(__dirname, 'uploads', loan.document);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  
  const filtered = loans.filter(l => l.id !== parseInt(req.params.id));
  saveLoans(filtered);
  res.json({ success: true });
});

// ========== RUTAS PARA ARCHIVOS ==========

// Ruta para subir archivos
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }
  console.log('Archivo subido:', req.file.filename);
  res.json({
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`
  });
});

// Ruta para descargar archivos
app.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

// Ruta para eliminar archivos
app.delete('/delete-file/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error al eliminar el archivo' });
      }
      res.json({ success: true });
    });
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

// ========== RUTAS PARA REPORTES ==========

// Ruta para enviar el reporte manualmente
app.post('/send-report', async (req, res) => {
  const { email, loans } = req.body;
  if (!email || !loans) {
    return res.status(400).json({ error: 'Se requiere un correo electrónico y la lista de préstamos' });
  }
  try {
    const result = await sendReportEmail(email, loans);
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error al enviar el reporte:', error);
    res.status(500).json({ error: 'Error al enviar el reporte' });
  }
});

// Variable para almacenar la tarea programada
let scheduledJob = null;
let currentReportConfig = null; // Variable para mantener el estado actual

// Función para iniciar el cron job
const startScheduledReport = (config) => {
  // Detener cualquier job anterior
  if (scheduledJob) {
    scheduledJob.stop();
  }

  let schedule;
  switch (config.frequency) {
    case 'daily':
      schedule = '0 9 * * *'; // 9:00 AM todos los días
      break;
    case 'weekly':
      schedule = '0 9 * * 1'; // 9:00 AM todos los lunes
      break;
    case 'monthly':
      schedule = '0 9 1 * *'; // 9:00 AM el primer día del mes
      break;
    default:
      schedule = '0 9 * * *';
  }

  scheduledJob = cron.schedule(schedule, async () => {
    console.log(`Enviando reporte programado a ${config.email}`);
    const currentLoans = readLoans();
    await sendReportEmail(config.email, currentLoans);
    
    // Actualizar la última ejecución
    config.lastRun = new Date().toISOString();
    saveReportConfig(config);
  });

  currentReportConfig = config;
  console.log(`Reporte programado iniciado: ${config.frequency} a ${config.email}`);
};

// Obtener configuración actual de reportes
app.get('/report-config', (req, res) => {
  const config = readReportConfig();
  if (config) {
    res.json(config);
  } else {
    res.json({ isScheduled: false });
  }
});


// Ruta para configurar el envío automático de reportes

app.post('/schedule-report', (req, res) => {
  const { email, frequency } = req.body;
  if (!email || !frequency) {
    return res.status(400).json({ error: 'Se requiere correo electrónico y frecuencia' });
  }

  const config = {
    email,
    frequency,
    isScheduled: true,
    scheduledAt: new Date().toISOString(),
    lastRun: null
  };

  // Guardar configuración
  saveReportConfig(config);
  
  // Iniciar el cron job
  startScheduledReport(config);

  res.json({ 
    success: true, 
    message: 'Programación de reporte configurada correctamente',
    config: config
  });
});


app.post('/stop-report', (req, res) => {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    currentReportConfig = null;
    
    // Actualizar la configuración guardada
    const config = readReportConfig();
    if (config) {
      config.isScheduled = false;
      config.stoppedAt = new Date().toISOString();
      saveReportConfig(config);
    }
    
    res.json({ success: true, message: 'Envío automático de reportes detenido' });
  } else {
    res.status(400).json({ error: 'No hay tareas programadas para detener' });
  }
});


// Restaurar configuración de reportes al iniciar
const savedConfig = readReportConfig();
if (savedConfig && savedConfig.isScheduled) {
  console.log('Restaurando configuración de reportes guardada...');
  startScheduledReport(savedConfig);
}

app.get('/', (req, res) => {
  res.send('Backend de Loan Tracker funcionando correctamente.');
});

// Iniciar el servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor backend corriendo en http://0.0.0.0:${PORT}`);
});
