const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
      const config = JSON.parse(data);
      // Migración: configuraciones guardadas antes de soportar múltiples destinatarios tenían "email" (string)
      if (!config.emails && config.email) {
        config.emails = [config.email];
      }
      return config;
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

// ========== AUTENTICACIÓN ==========
const AUTH_CONFIG_FILE = path.join(__dirname, 'authConfig.json');

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, passwordHash };
};

const verifyPassword = (password, salt, passwordHash) => {
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(passwordHash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
};

const readAuthConfig = () => {
  try {
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error leyendo authConfig:', error);
  }
  return null;
};

const saveAuthConfig = (config) => {
  fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(config, null, 2));
};

// Primera vez: sembrar la contraseña desde ADMIN_PASSWORD (credenciales.env)
if (!readAuthConfig()) {
  if (process.env.ADMIN_PASSWORD) {
    saveAuthConfig(hashPassword(process.env.ADMIN_PASSWORD));
    console.log('authConfig.json creado a partir de ADMIN_PASSWORD.');
  } else {
    console.warn('Sin authConfig.json ni ADMIN_PASSWORD: el login de administrador queda deshabilitado hasta configurarlo.');
  }
}

// Sesiones en memoria: reiniciar el servidor cierra todas las sesiones (aceptado en el diseño)
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// Bloqueo por fuerza bruta (contador global: herramienta de un solo admin)
let failedLoginCount = 0;
let loginLockedUntil = 0;

const requireAdmin = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.authToken = token;
  next();
};

app.post('/auth/login', (req, res) => {
  if (Date.now() < loginLockedUntil) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera un minuto e intenta de nuevo.' });
  }
  const config = readAuthConfig();
  if (!config) {
    return res.status(503).json({ error: 'Autenticación no configurada en el servidor' });
  }
  const { password } = req.body || {};
  if (typeof password !== 'string' || !verifyPassword(password, config.salt, config.passwordHash)) {
    failedLoginCount += 1;
    if (failedLoginCount >= 5) {
      loginLockedUntil = Date.now() + 60 * 1000;
      failedLoginCount = 0;
    }
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  failedLoginCount = 0;
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  res.json({ token });
});

app.post('/auth/logout', requireAdmin, (req, res) => {
  sessions.delete(req.authToken);
  res.json({ success: true });
});

app.get('/auth/verify', requireAdmin, (req, res) => {
  res.json({ valid: true });
});

app.post('/auth/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const config = readAuthConfig();
  if (!config || typeof currentPassword !== 'string' || !verifyPassword(currentPassword, config.salt, config.passwordHash)) {
    return res.status(403).json({ error: 'La contraseña actual no es correcta' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  saveAuthConfig(hashPassword(newPassword));
  // Cerrar todas las demás sesiones; la del solicitante sigue viva
  for (const token of sessions.keys()) {
    if (token !== req.authToken) sessions.delete(token);
  }
  res.json({ success: true });
});

// ========== MARCA (BRANDING) ==========
const BRANDING_CONFIG_FILE = path.join(__dirname, 'brandingConfig.json');
const BRANDING_DIR = path.join(__dirname, 'branding');

const readBrandingConfig = () => {
  try {
    if (fs.existsSync(BRANDING_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(BRANDING_CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error leyendo brandingConfig:', error);
  }
  return { title: 'Control de Préstamos', logoFile: null };
};

const saveBrandingConfig = (config) => {
  fs.writeFileSync(BRANDING_CONFIG_FILE, JSON.stringify(config, null, 2));
};

const LOGO_MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(BRANDING_DIR)) fs.mkdirSync(BRANDING_DIR, { recursive: true });
    cb(null, BRANDING_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `logo${LOGO_MIME_EXT[file.mimetype]}`);
  }
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (LOGO_MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error('Formato no permitido. Usa PNG, JPG o WebP.'));
  }
});

app.get('/branding', (req, res) => {
  const config = readBrandingConfig();
  let logoVersion = null;
  if (config.logoFile) {
    const logoPath = path.join(BRANDING_DIR, config.logoFile);
    if (fs.existsSync(logoPath)) logoVersion = fs.statSync(logoPath).mtimeMs;
  }
  res.json({ title: config.title, hasLogo: logoVersion !== null, logoVersion });
});

app.get('/branding/logo', (req, res) => {
  const config = readBrandingConfig();
  const logoPath = config.logoFile && path.join(BRANDING_DIR, config.logoFile);
  if (logoPath && fs.existsSync(logoPath)) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(logoPath);
  } else {
    res.status(404).json({ error: 'No hay logo configurado' });
  }
});

app.put('/branding', requireAdmin, (req, res) => {
  const { title } = req.body || {};
  if (typeof title !== 'string' || title.trim() === '' || title.trim().length > 80) {
    return res.status(400).json({ error: 'El título es obligatorio y debe tener máximo 80 caracteres' });
  }
  const config = readBrandingConfig();
  config.title = title.trim();
  saveBrandingConfig(config);
  res.json(config);
});

app.post('/branding/logo', requireAdmin, (req, res) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'El logo no puede superar 2 MB' : err.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }
    const config = readBrandingConfig();
    if (config.logoFile && config.logoFile !== req.file.filename) {
      const oldPath = path.join(BRANDING_DIR, config.logoFile);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    config.logoFile = req.file.filename;
    saveBrandingConfig(config);
    res.json({ success: true });
  });
});

app.delete('/branding/logo', requireAdmin, (req, res) => {
  const config = readBrandingConfig();
  if (config.logoFile) {
    const logoPath = path.join(BRANDING_DIR, config.logoFile);
    if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    config.logoFile = null;
    saveBrandingConfig(config);
  }
  res.json({ success: true });
});

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
const sendReportEmail = async (toEmails, loans) => {
  try {
    const today = new Date();
    // Segregación estricta: activos y atrasados nunca se solapan (antes "activos" incluía atrasados)
    const activeLoans = loans.filter(loan => loan.status === 'activo');
    const overdueLoans = loans.filter(loan => loan.status === 'atrasado');

    const totalLoans = loans.length;
    const activeCount = activeLoans.length;
    const overdueCount = overdueLoans.length;

    // Devoluciones del mes calendario anterior al envío (ej: reporte del 1 de agosto -> muestra julio)
    const previousMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const previousMonthStart = previousMonthDate;
    const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 1);
    const previousMonthLabel = previousMonthDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    const returnedPreviousMonth = loans.filter(loan => {
      if (loan.status !== 'devuelto' || !loan.returnedAt) return false;
      const returnedAt = new Date(loan.returnedAt);
      return returnedAt >= previousMonthStart && returnedAt < previousMonthEnd;
    });

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
              <h2>Devoluciones de ${previousMonthLabel}</h2>
              ${returnedPreviousMonth.length > 0 ? `
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Partner</th>
                      <th>Responsable</th>
                      <th>Dispositivos</th>
                      <th>Fecha de devolución</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${returnedPreviousMonth.map(loan => `
                      <tr>
                        <td>${loan.client}</td>
                        <td>${loan.partner}</td>
                        <td>${loan.responsible}</td>
                        <td>${(loan.devices || []).map(d => d.equipmentName).join(', ')}</td>
                        <td>${new Date(loan.returnedAt).toLocaleDateString('es-CO')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : `<p>No se registraron devoluciones en ${previousMonthLabel}.</p>`}
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
      to: toEmails.join(', '),
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
app.post('/loans', requireAdmin, (req, res) => {
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
app.put('/loans/:id', requireAdmin, (req, res) => {
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
  // Registrar la fecha real de devolución al pasar a "devuelto"; limpiarla si se revierte el estado
  if (merged.status === 'devuelto' && loans[index].status !== 'devuelto') {
    merged.returnedAt = new Date().toISOString();
  } else if (merged.status !== 'devuelto') {
    merged.returnedAt = null;
  }
  loans[index] = merged;
  saveLoans(loans);
  res.json(loans[index]);
});

// Eliminar un préstamo
app.delete('/loans/:id', requireAdmin, (req, res) => {
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
app.post('/upload', requireAdmin, upload.single('file'), (req, res) => {
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
app.get('/download/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

// Ruta para eliminar archivos
app.delete('/delete-file/:filename', requireAdmin, (req, res) => {
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

// ========== INVENTARIO: SITIOS, LOCACIONES, RACKS ==========
const SITES_FILE = path.join(__dirname, 'sites.json');

const readSites = () => {
  try {
    if (fs.existsSync(SITES_FILE)) {
      return JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
    }
    return [];
  } catch (error) {
    console.error('Error leyendo sitios:', error);
    return [];
  }
};

const saveSites = (sites) => {
  fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2));
};

const nextId = (items) => (items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1);

const namesCollide = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

app.get('/sites', requireAdmin, (req, res) => {
  res.json(readSites());
});

app.post('/sites', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del sitio es obligatorio' });
  }
  const sites = readSites();
  if (sites.some(site => namesCollide(site.name, name))) {
    return res.status(400).json({ error: 'Ya existe un sitio con ese nombre' });
  }
  const newSite = { id: nextId(sites), name: name.trim(), locations: [] };
  sites.push(newSite);
  saveSites(sites);
  res.json(newSite);
});

app.put('/sites/:id', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del sitio es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  if (sites.some(s => s.id !== site.id && namesCollide(s.name, name))) {
    return res.status(400).json({ error: 'Ya existe un sitio con ese nombre' });
  }
  site.name = name.trim();
  saveSites(sites);
  res.json(site);
});

app.delete('/sites/:id', requireAdmin, (req, res) => {
  const siteId = parseInt(req.params.id);
  const sites = readSites();
  const index = sites.findIndex(s => s.id === siteId);
  if (index === -1) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const blockingCount = readEquipment().filter(item => item.siteId === siteId).length;
  if (blockingCount > 0) {
    return res.status(400).json({ error: `No se puede eliminar: ${blockingCount} equipo(s) están asignados a este sitio` });
  }
  sites.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});

app.post('/sites/:id/locations', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre de la locación es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  if (site.locations.some(loc => namesCollide(loc.name, name))) {
    return res.status(400).json({ error: 'Ya existe una locación con ese nombre en este sitio' });
  }
  const newLocation = { id: nextId(site.locations), name: name.trim(), racks: [] };
  site.locations.push(newLocation);
  saveSites(sites);
  res.json(newLocation);
});

app.put('/sites/:id/locations/:locationId', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre de la locación es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === parseInt(req.params.locationId));
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  if (site.locations.some(l => l.id !== location.id && namesCollide(l.name, name))) {
    return res.status(400).json({ error: 'Ya existe una locación con ese nombre en este sitio' });
  }
  location.name = name.trim();
  saveSites(sites);
  res.json(location);
});

app.delete('/sites/:id/locations/:locationId', requireAdmin, (req, res) => {
  const siteId = parseInt(req.params.id);
  const locationId = parseInt(req.params.locationId);
  const sites = readSites();
  const site = sites.find(s => s.id === siteId);
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const index = site.locations.findIndex(l => l.id === locationId);
  if (index === -1) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  const blockingCount = readEquipment().filter(item => item.siteId === siteId && item.locationId === locationId).length;
  if (blockingCount > 0) {
    return res.status(400).json({ error: `No se puede eliminar: ${blockingCount} equipo(s) están asignados a esta locación` });
  }
  site.locations.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});

app.post('/sites/:id/locations/:locationId/racks', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del rack es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === parseInt(req.params.locationId));
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  if (location.racks.some(rack => namesCollide(rack.name, name))) {
    return res.status(400).json({ error: 'Ya existe un rack con ese nombre en esta locación' });
  }
  const newRack = { id: nextId(location.racks), name: name.trim() };
  location.racks.push(newRack);
  saveSites(sites);
  res.json(newRack);
});

app.put('/sites/:id/locations/:locationId/racks/:rackId', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del rack es obligatorio' });
  }
  const sites = readSites();
  const site = sites.find(s => s.id === parseInt(req.params.id));
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === parseInt(req.params.locationId));
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  const rack = location.racks.find(r => r.id === parseInt(req.params.rackId));
  if (!rack) {
    return res.status(404).json({ error: 'Rack no encontrado' });
  }
  if (location.racks.some(r => r.id !== rack.id && namesCollide(r.name, name))) {
    return res.status(400).json({ error: 'Ya existe un rack con ese nombre en esta locación' });
  }
  rack.name = name.trim();
  saveSites(sites);
  res.json(rack);
});

app.delete('/sites/:id/locations/:locationId/racks/:rackId', requireAdmin, (req, res) => {
  const siteId = parseInt(req.params.id);
  const locationId = parseInt(req.params.locationId);
  const rackId = parseInt(req.params.rackId);
  const sites = readSites();
  const site = sites.find(s => s.id === siteId);
  if (!site) {
    return res.status(404).json({ error: 'Sitio no encontrado' });
  }
  const location = site.locations.find(l => l.id === locationId);
  if (!location) {
    return res.status(404).json({ error: 'Locación no encontrada' });
  }
  const index = location.racks.findIndex(r => r.id === rackId);
  if (index === -1) {
    return res.status(404).json({ error: 'Rack no encontrado' });
  }
  const blockingCount = readEquipment().filter(item => item.siteId === siteId && item.locationId === locationId && item.rackId === rackId).length;
  if (blockingCount > 0) {
    return res.status(400).json({ error: `No se puede eliminar: ${blockingCount} equipo(s) están asignados a este rack` });
  }
  location.racks.splice(index, 1);
  saveSites(sites);
  res.json({ success: true });
});

// ========== INVENTARIO: EQUIPOS ==========
const EQUIPMENT_FILE = path.join(__dirname, 'equipment.json');

const readEquipment = () => {
  try {
    if (fs.existsSync(EQUIPMENT_FILE)) {
      return JSON.parse(fs.readFileSync(EQUIPMENT_FILE, 'utf8'));
    }
    return [];
  } catch (error) {
    console.error('Error leyendo equipos:', error);
    return [];
  }
};

const saveEquipment = (equipment) => {
  fs.writeFileSync(EQUIPMENT_FILE, JSON.stringify(equipment, null, 2));
};

// ¿Este equipo está vinculado a un préstamo que aún no se devuelve?
const computeEquipmentStatus = (equipmentId, loans) => {
  const isPrestado = loans.some(loan =>
    loan.status !== 'devuelto' &&
    (loan.devices || []).some(device => device.inventoryEquipmentId === equipmentId)
  );
  return isPrestado ? 'prestado' : 'disponible';
};

// Valida que siteId/locationId/rackId formen una cadena real dentro del árbol de sitios
const resolveSiteLocationRack = (sites, siteId, locationId, rackId) => {
  const site = sites.find(s => s.id === siteId);
  if (!site) return { error: 'El sitio indicado no existe' };
  if (locationId == null) {
    if (rackId != null) return { error: 'No puedes indicar un rack sin indicar la locación' };
    return { site, location: null, rack: null };
  }
  const location = site.locations.find(l => l.id === locationId);
  if (!location) return { error: 'La locación indicada no pertenece a ese sitio' };
  if (rackId == null) {
    return { site, location, rack: null };
  }
  const rack = location.racks.find(r => r.id === rackId);
  if (!rack) return { error: 'El rack indicado no pertenece a esa locación' };
  return { site, location, rack };
};

const validateEquipmentPayload = (body, sites) => {
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return { valid: false, error: 'El nombre del equipo es obligatorio' };
  }
  if (typeof body.serial !== 'string' || body.serial.trim() === '') {
    return { valid: false, error: 'El serial es obligatorio' };
  }
  if (typeof body.siteId !== 'number') {
    return { valid: false, error: 'Debes indicar el sitio' };
  }
  const resolved = resolveSiteLocationRack(sites, body.siteId, body.locationId ?? null, body.rackId ?? null);
  if (resolved.error) {
    return { valid: false, error: resolved.error };
  }
  return { valid: true };
};

app.get('/equipment', requireAdmin, (req, res) => {
  const equipment = readEquipment();
  const loans = readLoans();
  res.json(equipment.map(item => ({ ...item, status: computeEquipmentStatus(item.id, loans) })));
});

app.get('/equipment/search', requireAdmin, (req, res) => {
  const query = (req.query.q || '').toString().trim().toLowerCase();
  const equipment = readEquipment();
  const loans = readLoans();
  const matches = equipment
    .filter(item =>
      query === '' ||
      item.name.toLowerCase().includes(query) ||
      item.serial.toLowerCase().includes(query) ||
      (item.mac || '').toLowerCase().includes(query)
    )
    .slice(0, 20)
    .map(item => ({ ...item, status: computeEquipmentStatus(item.id, loans) }));
  res.json(matches);
});

app.post('/equipment', requireAdmin, (req, res) => {
  const sites = readSites();
  const validation = validateEquipmentPayload(req.body, sites);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const equipment = readEquipment();
  const serial = req.body.serial.trim();
  if (equipment.some(item => item.serial.toLowerCase() === serial.toLowerCase())) {
    return res.status(400).json({ error: 'Ya existe un equipo con ese serial' });
  }
  const newEquipment = {
    id: nextId(equipment),
    name: req.body.name.trim(),
    serial,
    mac: req.body.mac || '',
    partNumber: req.body.partNumber || '',
    manufacturer: req.body.manufacturer || '',
    category: req.body.category || '',
    owner: req.body.owner || '',
    siteId: req.body.siteId,
    locationId: req.body.locationId ?? null,
    rackId: req.body.rackId ?? null,
  };
  equipment.push(newEquipment);
  saveEquipment(equipment);
  res.json(newEquipment);
});

app.put('/equipment/:id', requireAdmin, (req, res) => {
  const sites = readSites();
  const validation = validateEquipmentPayload(req.body, sites);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const equipment = readEquipment();
  const index = equipment.findIndex(item => item.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: 'Equipo no encontrado' });
  }
  const serial = req.body.serial.trim();
  if (equipment.some(item => item.id !== equipment[index].id && item.serial.toLowerCase() === serial.toLowerCase())) {
    return res.status(400).json({ error: 'Ya existe un equipo con ese serial' });
  }
  equipment[index] = {
    ...equipment[index],
    name: req.body.name.trim(),
    serial,
    mac: req.body.mac || '',
    partNumber: req.body.partNumber || '',
    manufacturer: req.body.manufacturer || '',
    category: req.body.category || '',
    owner: req.body.owner || '',
    siteId: req.body.siteId,
    locationId: req.body.locationId ?? null,
    rackId: req.body.rackId ?? null,
  };
  saveEquipment(equipment);
  res.json(equipment[index]);
});

app.delete('/equipment/:id', requireAdmin, (req, res) => {
  const equipmentId = parseInt(req.params.id);
  const equipment = readEquipment();
  const filtered = equipment.filter(item => item.id !== equipmentId);
  saveEquipment(filtered);

  // Evita que un ID de equipo reciclado herede por error el vínculo de un préstamo antiguo
  const loans = readLoans();
  let loansChanged = false;
  const updatedLoans = loans.map(loan => {
    if (!(loan.devices || []).some(device => device.inventoryEquipmentId === equipmentId)) {
      return loan;
    }
    loansChanged = true;
    return {
      ...loan,
      devices: loan.devices.map(device =>
        device.inventoryEquipmentId === equipmentId ? { ...device, inventoryEquipmentId: null } : device
      ),
    };
  });
  if (loansChanged) {
    saveLoans(updatedLoans);
  }

  res.json({ success: true });
});

// ========== INVENTARIO: OPCIONES DE EQUIPO (FABRICANTES, CATEGORÍAS, DUEÑOS) ==========
const EQUIPMENT_OPTIONS_FILE = path.join(__dirname, 'equipmentOptions.json');
const EQUIPMENT_OPTION_KINDS = ['manufacturers', 'categories', 'owners'];

const readEquipmentOptions = () => {
  try {
    if (fs.existsSync(EQUIPMENT_OPTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(EQUIPMENT_OPTIONS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error leyendo opciones de equipo:', error);
  }
  return { manufacturers: [], categories: [], owners: [] };
};

const saveEquipmentOptions = (options) => {
  fs.writeFileSync(EQUIPMENT_OPTIONS_FILE, JSON.stringify(options, null, 2));
};

app.get('/equipment-options', requireAdmin, (req, res) => {
  res.json(readEquipmentOptions());
});

app.post('/equipment-options/:kind', requireAdmin, (req, res) => {
  const { kind } = req.params;
  if (!EQUIPMENT_OPTION_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Tipo de lista no válido' });
  }
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  const options = readEquipmentOptions();
  const list = options[kind];
  if (list.some(item => namesCollide(item.name, name))) {
    return res.status(400).json({ error: 'Ese valor ya existe en la lista' });
  }
  const newItem = { id: nextId(list), name: name.trim() };
  list.push(newItem);
  saveEquipmentOptions(options);
  res.json(newItem);
});

app.delete('/equipment-options/:kind/:id', requireAdmin, (req, res) => {
  const { kind } = req.params;
  if (!EQUIPMENT_OPTION_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Tipo de lista no válido' });
  }
  const options = readEquipmentOptions();
  options[kind] = options[kind].filter(item => item.id !== parseInt(req.params.id));
  saveEquipmentOptions(options);
  res.json({ success: true });
});

// ========== RUTAS PARA REPORTES ==========

// Ruta para enviar el reporte manualmente
app.post('/send-report', requireAdmin, async (req, res) => {
  const { emails, loans } = req.body;
  if (!Array.isArray(emails) || emails.length === 0 || !loans) {
    return res.status(400).json({ error: 'Se requiere al menos un correo electrónico y la lista de préstamos' });
  }
  try {
    const result = await sendReportEmail(emails, loans);
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
    console.log(`Enviando reporte programado a ${config.emails.join(', ')}`);
    const currentLoans = readLoans();
    await sendReportEmail(config.emails, currentLoans);

    // Actualizar la última ejecución
    config.lastRun = new Date().toISOString();
    saveReportConfig(config);
  });

  currentReportConfig = config;
  console.log(`Reporte programado iniciado: ${config.frequency} a ${config.emails.join(', ')}`);
};

// Obtener configuración actual de reportes
app.get('/report-config', requireAdmin, (req, res) => {
  const config = readReportConfig();
  if (config) {
    res.json(config);
  } else {
    res.json({ isScheduled: false });
  }
});


// Ruta para configurar el envío automático de reportes

app.post('/schedule-report', requireAdmin, (req, res) => {
  const { emails, frequency } = req.body;
  if (!Array.isArray(emails) || emails.length === 0 || !frequency) {
    return res.status(400).json({ error: 'Se requiere al menos un correo electrónico y la frecuencia' });
  }

  const config = {
    emails,
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


app.post('/stop-report', requireAdmin, (req, res) => {
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
