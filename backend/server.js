const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

// Simple ID generator (no external deps)
function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

// ============== IN-MEMORY DATABASE ==============
const db = {
  users: [],
  services: [
    { id: '1', name: 'Corte de Cabelo', durationMinutes: 30, price: 40.00 },
    { id: '2', name: 'Barba', durationMinutes: 20, price: 25.00 },
    { id: '3', name: 'Cabelo + Barba', durationMinutes: 45, price: 60.00 },
    { id: '4', name: 'Sobrancelha', durationMinutes: 15, price: 15.00 }
  ],
  appointments: [],
  blockedSlots: [], // { date: 'YYYY-MM-DD', time: 'HH:MM' }
  tokens: {} // token -> userId
};

// Seed admin user (password: admin123)
const adminHash = crypto.createHash('sha256').update('admin123').digest('hex');
db.users.push({
  id: 'admin-1',
  name: 'Barbeiro Admin',
  email: 'admin@barbearia.com',
  phone: '11999999999',
  passwordHash: adminHash,
  role: 'admin'
});

// Seed a demo client (password: cliente123)
const clientHash = crypto.createHash('sha256').update('cliente123').digest('hex');
db.users.push({
  id: 'client-1',
  name: 'Cliente Demo',
  email: 'cliente@email.com',
  phone: '11988887777',
  passwordHash: clientHash,
  role: 'client'
});

// ============== CONFIG ==============
const PORT = 3000;
const JWT_SECRET = 'barbearia-secret-key-academic-2026'; // simple for demo
const MIN_CANCEL_HOURS = 2;
const WORK_START = 9; // 09:00
const WORK_END = 18; // 18:00
const SLOT_MINUTES = 30;
const WORK_DAYS = [1, 2, 3, 4, 5, 6]; // Mon-Sat (0=Sun)

// ============== HELPERS ==============
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.tokens[token] = userId;
  return token;
}

function getUserFromToken(token) {
  if (!token) return null;
  const userId = db.tokens[token];
  if (!userId) return null;
  return db.users.find(u => u.id === userId) || null;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJSON(res, status, { error: message });
}

function isWorkingDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return WORK_DAYS.includes(d.getDay());
}

function generateSlots() {
  const slots = [];
  for (let h = WORK_START; h < WORK_END; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push(time);
    }
  }
  return slots;
}

function getAvailableSlots(dateStr) {
  if (!isWorkingDay(dateStr)) return [];
  const allSlots = generateSlots();
  const booked = db.appointments
    .filter(a => a.date === dateStr && a.status === 'confirmed')
    .map(a => a.time);
  const blocked = db.blockedSlots
    .filter(b => b.date === dateStr)
    .map(b => b.time);
  return allSlots.filter(s => !booked.includes(s) && !blocked.includes(s));
}

function canCancel(appointment) {
  const now = new Date();
  const apptDateTime = new Date(`${appointment.date}T${appointment.time}:00`);
  const diffHours = (apptDateTime - now) / (1000 * 60 * 60);
  return diffHours >= MIN_CANCEL_HOURS;
}

// ============== ROUTES ==============
async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // Auth helper
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const currentUser = getUserFromToken(token);

  try {
    // ===== PUBLIC =====
    if (method === 'POST' && pathname === '/api/register') {
      const body = await parseBody(req);
      const { name, email, phone, password } = body;
      if (!name || !email || !phone || !password) {
        return sendError(res, 400, 'Nome, e-mail, telefone e senha são obrigatórios.');
      }
      if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return sendError(res, 409, 'E-mail já cadastrado.');
      }
      const user = {
        id: generateId(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        passwordHash: hashPassword(password),
        role: 'client'
      };
      db.users.push(user);
      const newToken = generateToken(user.id);
      return sendJSON(res, 201, {
        message: 'Cadastro realizado com sucesso!',
        token: newToken,
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
      });
    }

    if (method === 'POST' && pathname === '/api/login') {
      const body = await parseBody(req);
      const { email, password } = body;
      if (!email || !password) {
        return sendError(res, 400, 'E-mail e senha são obrigatórios.');
      }
      const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!user || user.passwordHash !== hashPassword(password)) {
        return sendError(res, 401, 'E-mail ou senha inválidos.');
      }
      const newToken = generateToken(user.id);
      return sendJSON(res, 200, {
        message: 'Login realizado com sucesso!',
        token: newToken,
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
      });
    }

    if (method === 'GET' && pathname === '/api/services') {
      return sendJSON(res, 200, db.services);
    }

    if (method === 'GET' && pathname === '/api/available') {
      const date = parsedUrl.query.date;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return sendError(res, 400, 'Parâmetro date (YYYY-MM-DD) é obrigatório.');
      }
      const available = getAvailableSlots(date);
      return sendJSON(res, 200, {
        date,
        isWorkingDay: isWorkingDay(date),
        availableSlots: available
      });
    }

    // ===== AUTHENTICATED =====
    if (!currentUser && pathname.startsWith('/api/') && !['/api/register', '/api/login', '/api/services', '/api/available'].includes(pathname)) {
      // allow public ones already handled
    }

    // Client appointments
    if (method === 'POST' && pathname === '/api/appointments') {
      if (!currentUser) return sendError(res, 401, 'Não autenticado.');
      if (currentUser.role !== 'client') return sendError(res, 403, 'Apenas clientes podem agendar.');
      const body = await parseBody(req);
      const { serviceId, date, time } = body;
      if (!serviceId || !date || !time) {
        return sendError(res, 400, 'serviceId, date e time são obrigatórios.');
      }
      const service = db.services.find(s => s.id === serviceId);
      if (!service) return sendError(res, 404, 'Serviço não encontrado.');
      if (!isWorkingDay(date)) return sendError(res, 400, 'Dia não é de funcionamento.');
      const available = getAvailableSlots(date);
      if (!available.includes(time)) {
        return sendError(res, 409, 'Horário não está disponível.');
      }
      // Check past
      const apptDT = new Date(`${date}T${time}:00`);
      if (apptDT < new Date()) return sendError(res, 400, 'Não é possível agendar no passado.');

      const appointment = {
        id: generateId(),
        userId: currentUser.id,
        serviceId,
        date,
        time,
        status: 'confirmed',
        createdAt: new Date().toISOString()
      };
      db.appointments.push(appointment);
      return sendJSON(res, 201, {
        message: 'Agendamento confirmado!',
        appointment: {
          ...appointment,
          serviceName: service.name,
          servicePrice: service.price
        }
      });
    }

    if (method === 'GET' && pathname === '/api/appointments/me') {
      if (!currentUser) return sendError(res, 401, 'Não autenticado.');
      const mine = db.appointments
        .filter(a => a.userId === currentUser.id)
        .map(a => {
          const service = db.services.find(s => s.id === a.serviceId);
          return {
            ...a,
            serviceName: service ? service.name : '?',
            servicePrice: service ? service.price : 0,
            canCancel: a.status === 'confirmed' && canCancel(a)
          };
        })
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return sendJSON(res, 200, mine);
    }

    if (method === 'DELETE' && pathname.startsWith('/api/appointments/')) {
      if (!currentUser) return sendError(res, 401, 'Não autenticado.');
      const id = pathname.split('/').pop();
      const appt = db.appointments.find(a => a.id === id);
      if (!appt) return sendError(res, 404, 'Agendamento não encontrado.');
      if (appt.userId !== currentUser.id && currentUser.role !== 'admin') {
        return sendError(res, 403, 'Sem permissão.');
      }
      if (appt.status !== 'confirmed') return sendError(res, 400, 'Agendamento já cancelado.');
      if (currentUser.role === 'client' && !canCancel(appt)) {
        return sendError(res, 400, `Cancelamento só é permitido com no mínimo ${MIN_CANCEL_HOURS} horas de antecedência.`);
      }
      appt.status = 'cancelled';
      return sendJSON(res, 200, { message: 'Agendamento cancelado com sucesso.' });
    }

    // ===== ADMIN =====
    if (method === 'GET' && pathname === '/api/admin/appointments') {
      if (!currentUser || currentUser.role !== 'admin') return sendError(res, 403, 'Acesso restrito ao administrador.');
      const date = parsedUrl.query.date || new Date().toISOString().slice(0, 10);
      const list = db.appointments
        .filter(a => a.date === date)
        .map(a => {
          const user = db.users.find(u => u.id === a.userId);
          const service = db.services.find(s => s.id === a.serviceId);
          return {
            ...a,
            clientName: user ? user.name : '?',
            clientPhone: user ? user.phone : '?',
            clientEmail: user ? user.email : '?',
            serviceName: service ? service.name : '?',
            servicePrice: service ? service.price : 0
          };
        })
        .sort((a, b) => a.time.localeCompare(b.time));
      const blocked = db.blockedSlots.filter(b => b.date === date);
      return sendJSON(res, 200, { date, appointments: list, blockedSlots: blocked });
    }

    if (method === 'POST' && pathname === '/api/admin/block') {
      if (!currentUser || currentUser.role !== 'admin') return sendError(res, 403, 'Acesso restrito ao administrador.');
      const body = await parseBody(req);
      const { date, time } = body;
      if (!date || !time) return sendError(res, 400, 'date e time são obrigatórios.');
      if (db.blockedSlots.find(b => b.date === date && b.time === time)) {
        return sendError(res, 409, 'Horário já bloqueado.');
      }
      // Also check if already booked
      if (db.appointments.find(a => a.date === date && a.time === time && a.status === 'confirmed')) {
        return sendError(res, 409, 'Já existe agendamento neste horário. Cancele primeiro.');
      }
      db.blockedSlots.push({ date, time });
      return sendJSON(res, 201, { message: 'Horário bloqueado com sucesso.' });
    }

    if (method === 'DELETE' && pathname === '/api/admin/block') {
      if (!currentUser || currentUser.role !== 'admin') return sendError(res, 403, 'Acesso restrito ao administrador.');
      const body = await parseBody(req);
      const { date, time } = body;
      const idx = db.blockedSlots.findIndex(b => b.date === date && b.time === time);
      if (idx === -1) return sendError(res, 404, 'Bloqueio não encontrado.');
      db.blockedSlots.splice(idx, 1);
      return sendJSON(res, 200, { message: 'Bloqueio removido.' });
    }

    if (method === 'GET' && pathname === '/api/admin/clients') {
      if (!currentUser || currentUser.role !== 'admin') return sendError(res, 403, 'Acesso restrito ao administrador.');
      const clients = db.users
        .filter(u => u.role === 'client')
        .map(u => {
          const appts = db.appointments.filter(a => a.userId === u.id);
          return {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            totalAppointments: appts.length,
            confirmed: appts.filter(a => a.status === 'confirmed').length,
            cancelled: appts.filter(a => a.status === 'cancelled').length
          };
        });
      return sendJSON(res, 200, clients);
    }

    if (method === 'GET' && pathname === '/api/admin/history') {
      if (!currentUser || currentUser.role !== 'admin') return sendError(res, 403, 'Acesso restrito ao administrador.');
      const all = db.appointments
        .map(a => {
          const user = db.users.find(u => u.id === a.userId);
          const service = db.services.find(s => s.id === a.serviceId);
          return {
            ...a,
            clientName: user ? user.name : '?',
            serviceName: service ? service.name : '?'
          };
        })
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      return sendJSON(res, 200, all);
    }

    // ===== SERVE STATIC FRONTEND =====
    if (method === 'GET') {
      let filePath = pathname === '/' ? '/index.html' : pathname;
      // Security: only allow frontend files
      const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
      const fullPath = path.join(__dirname, '..', 'frontend', safePath);

      if (!fullPath.startsWith(path.join(__dirname, '..', 'frontend'))) {
        return sendError(res, 403, 'Forbidden');
      }

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          // Fallback to index for SPA-like
          if (safePath.endsWith('.html') || !path.extname(safePath)) {
            fs.readFile(path.join(__dirname, '..', 'frontend', 'index.html'), (err2, data2) => {
              if (err2) return sendError(res, 404, 'Página não encontrada');
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(data2);
            });
          } else {
            sendError(res, 404, 'Arquivo não encontrado');
          }
          return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        const mime = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon'
        }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      });
      return;
    }

    sendError(res, 404, 'Rota não encontrada.');
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Erro interno do servidor.');
  }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`\n🚀 Servidor da Barbearia rodando em http://localhost:${PORT}`);
  console.log(`\n📌 Contas de teste:`);
  console.log(`   Admin  -> email: admin@barbearia.com | senha: admin123`);
  console.log(`   Cliente-> email: cliente@email.com   | senha: cliente123`);
  console.log(`\n📁 Banco de dados em memória (reinicia ao parar o servidor)\n`);
});
