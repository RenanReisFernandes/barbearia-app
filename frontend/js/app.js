const API = ''; // same origin

let state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  services: [],
  selectedService: null,
  selectedDate: null,
  selectedTime: null
};

// ============== UTILS ==============
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatMoney(v) {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

// ============== AUTH UI ==============
function updateAuthUI() {
  const authArea = document.getElementById('auth-area');
  const userArea = document.getElementById('user-area');
  const navAgenda = document.getElementById('nav-agenda');
  const navMeus = document.getElementById('nav-meus');
  const navAdmin = document.getElementById('nav-admin');

  if (state.user && state.token) {
    authArea.style.display = 'none';
    userArea.style.display = 'flex';
    document.getElementById('user-name').textContent = state.user.name.split(' ')[0];
    navAgenda.style.display = state.user.role === 'client' ? 'inline-block' : 'none';
    navMeus.style.display = state.user.role === 'client' ? 'inline-block' : 'none';
    navAdmin.style.display = state.user.role === 'admin' ? 'inline-block' : 'none';
  } else {
    authArea.style.display = 'flex';
    userArea.style.display = 'none';
    navAgenda.style.display = 'none';
    navMeus.style.display = 'none';
    navAdmin.style.display = 'none';
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateAuthUI();
  showPage('home');
  showToast('Você saiu da conta.');
}

// ============== PAGES ==============
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  // nav active
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === pageId);
  });

  // close mobile menu
  document.getElementById('nav').classList.remove('open');

  // load data when needed
  if (pageId === 'agenda') {
    if (!state.user || state.user.role !== 'client') {
      showToast('Faça login como cliente para agendar.', 'error');
      showPage('login');
      return;
    }
    loadServices();
    // set min date today
    const today = new Date().toISOString().slice(0, 10);
    const dateInput = document.getElementById('agenda-date');
    dateInput.min = today;
    if (!dateInput.value) dateInput.value = today;
    state.selectedDate = dateInput.value;
    state.selectedService = null;
    state.selectedTime = null;
    document.getElementById('summary-card').style.display = 'none';
    document.getElementById('slots-container').innerHTML = '<p class="empty-state">Selecione um serviço e uma data.</p>';
  }

  if (pageId === 'meus') {
    if (!state.user) {
      showPage('login');
      return;
    }
    loadMyAppointments();
  }

  if (pageId === 'admin') {
    if (!state.user || state.user.role !== 'admin') {
      showToast('Acesso restrito ao administrador.', 'error');
      showPage('home');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('admin-date').value = today;
    document.getElementById('block-date').value = today;
    fillBlockTimes();
    loadAdminDay();
    switchAdminTab('today');
  }
}

function goToAgenda() {
  if (state.user && state.user.role === 'client') {
    showPage('agenda');
  } else if (state.user && state.user.role === 'admin') {
    showPage('admin');
  } else {
    showPage('login');
  }
}

// ============== AUTH HANDLERS ==============
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    updateAuthUI();
    showToast(data.message);
    if (data.user.role === 'admin') showPage('admin');
    else showPage('agenda');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;
  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, phone, password })
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    updateAuthUI();
    showToast(data.message);
    showPage('agenda');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============== AGENDA ==============
async function loadServices() {
  try {
    state.services = await api('/api/services');
    const list = document.getElementById('services-list');
    list.innerHTML = state.services.map(s => `
      <div class="service-item" data-id="${s.id}" onclick="selectService('${s.id}')">
        <div class="service-info">
          <h4>${s.name}</h4>
          <span>${s.durationMinutes} min</span>
        </div>
        <div class="service-price">${formatMoney(s.price)}</div>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function selectService(id) {
  state.selectedService = state.services.find(s => s.id === id);
  document.querySelectorAll('.service-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
  state.selectedTime = null;
  loadSlots();
  updateSummary();
}

async function loadSlots() {
  const date = document.getElementById('agenda-date').value;
  state.selectedDate = date;
  if (!date || !state.selectedService) {
    document.getElementById('slots-container').innerHTML = '<p class="empty-state">Selecione um serviço e uma data.</p>';
    return;
  }
  try {
    const data = await api(`/api/available?date=${date}`);
    const container = document.getElementById('slots-container');
    if (!data.isWorkingDay) {
      container.innerHTML = '<p class="empty-state">Este dia não é de funcionamento (apenas seg–sáb).</p>';
      document.getElementById('date-hint').textContent = 'Dia não disponível.';
      return;
    }
    document.getElementById('date-hint').textContent = 'Horários de 09:00 às 18:00, intervalos de 30 min.';
    if (data.availableSlots.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhum horário livre nesta data.</p>';
      return;
    }
    container.innerHTML = data.availableSlots.map(t => `
      <button class="slot-btn ${state.selectedTime === t ? 'selected' : ''}" onclick="selectTime('${t}')">${t}</button>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function selectTime(time) {
  state.selectedTime = time;
  document.querySelectorAll('.slot-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === time);
  });
  updateSummary();
}

function updateSummary() {
  const card = document.getElementById('summary-card');
  if (state.selectedService && state.selectedDate && state.selectedTime) {
    card.style.display = 'block';
    document.getElementById('summary-content').innerHTML = `
      <p><strong>Serviço:</strong> ${state.selectedService.name}</p>
      <p><strong>Data:</strong> ${formatDateBR(state.selectedDate)}</p>
      <p><strong>Horário:</strong> ${state.selectedTime}</p>
      <p><strong>Valor:</strong> ${formatMoney(state.selectedService.price)}</p>
    `;
  } else {
    card.style.display = 'none';
  }
}

async function confirmAppointment() {
  if (!state.selectedService || !state.selectedDate || !state.selectedTime) {
    showToast('Selecione serviço, data e horário.', 'error');
    return;
  }
  try {
    const data = await api('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        serviceId: state.selectedService.id,
        date: state.selectedDate,
        time: state.selectedTime
      })
    });
    showToast(data.message);
    state.selectedTime = null;
    loadSlots();
    updateSummary();
    setTimeout(() => showPage('meus'), 800);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============== MEUS AGENDAMENTOS ==============
async function loadMyAppointments() {
  const container = document.getElementById('my-appointments');
  try {
    const list = await api('/api/appointments/me');
    if (list.length === 0) {
      container.innerHTML = '<p class="empty-state">Você ainda não possui agendamentos.</p>';
      return;
    }
    container.innerHTML = list.map(a => `
      <div class="appt-card">
        <div class="appt-info">
          <h4>${a.serviceName}</h4>
          <div class="appt-meta">${formatDateBR(a.date)} às ${a.time} · ${formatMoney(a.servicePrice)}</div>
          <span class="appt-status ${a.status}">${a.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}</span>
        </div>
        ${a.canCancel ? `<button class="btn btn-danger btn-sm" onclick="cancelAppointment('${a.id}')">Cancelar</button>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

async function cancelAppointment(id) {
  if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
  try {
    const data = await api(`/api/appointments/${id}`, { method: 'DELETE' });
    showToast(data.message);
    loadMyAppointments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============== ADMIN ==============
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('admin-' + tab).classList.add('active');

  if (tab === 'clients') loadClients();
  if (tab === 'history') loadHistory();
  if (tab === 'block') {
    loadBlockedForDate();
  }
}

async function loadAdminDay() {
  const date = document.getElementById('admin-date').value;
  const container = document.getElementById('admin-day-content');
  try {
    const data = await api(`/api/admin/appointments?date=${date}`);
    let html = '';
    if (data.appointments.length === 0 && data.blockedSlots.length === 0) {
      html = '<p class="empty-state">Nenhum agendamento ou bloqueio nesta data.</p>';
    } else {
      if (data.appointments.length) {
        html += '<h3 style="margin-bottom:12px">Agendamentos</h3>';
        html += data.appointments.map(a => `
          <div class="appt-card">
            <div class="appt-info">
              <h4>${a.time} — ${a.serviceName}</h4>
              <div class="appt-meta">${a.clientName} · ${a.clientPhone} · ${formatMoney(a.servicePrice)}</div>
              <span class="appt-status ${a.status}">${a.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}</span>
            </div>
            ${a.status === 'confirmed' ? `<button class="btn btn-danger btn-sm" onclick="adminCancel('${a.id}')">Cancelar</button>` : ''}
          </div>
        `).join('');
      }
      if (data.blockedSlots.length) {
        html += '<h3 style="margin:20px 0 12px">Horários bloqueados</h3>';
        html += '<div class="blocked-list">' + data.blockedSlots.map(b => `
          <span class="blocked-chip">${b.time} <button onclick="unblockSlot('${b.date}','${b.time}')" title="Desbloquear">×</button></span>
        `).join('') + '</div>';
      }
    }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

async function adminCancel(id) {
  if (!confirm('Cancelar este agendamento?')) return;
  try {
    await api(`/api/appointments/${id}`, { method: 'DELETE' });
    showToast('Agendamento cancelado.');
    loadAdminDay();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function fillBlockTimes() {
  const select = document.getElementById('block-time');
  const slots = [];
  for (let h = 9; h < 18; h++) {
    for (let m of [0, 30]) {
      slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
  }
  select.innerHTML = slots.map(t => `<option value="${t}">${t}</option>`).join('');
}

async function blockSlot() {
  const date = document.getElementById('block-date').value;
  const time = document.getElementById('block-time').value;
  if (!date || !time) {
    showToast('Selecione data e horário.', 'error');
    return;
  }
  try {
    await api('/api/admin/block', {
      method: 'POST',
      body: JSON.stringify({ date, time })
    });
    showToast('Horário bloqueado.');
    loadBlockedForDate();
    if (document.getElementById('admin-date').value === date) loadAdminDay();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function unblockSlot(date, time) {
  try {
    await api('/api/admin/block', {
      method: 'DELETE',
      body: JSON.stringify({ date, time })
    });
    showToast('Bloqueio removido.');
    loadBlockedForDate();
    if (document.getElementById('admin-date').value === date) loadAdminDay();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadBlockedForDate() {
  const date = document.getElementById('block-date').value;
  if (!date) return;
  try {
    const data = await api(`/api/admin/appointments?date=${date}`);
    const list = document.getElementById('blocked-list');
    if (data.blockedSlots.length === 0) {
      list.innerHTML = '<p class="empty-state" style="padding:12px 0">Nenhum horário bloqueado nesta data.</p>';
    } else {
      list.innerHTML = data.blockedSlots.map(b => `
        <span class="blocked-chip">${b.time} <button onclick="unblockSlot('${b.date}','${b.time}')">×</button></span>
      `).join('');
    }
  } catch (err) {
    // ignore
  }
}

async function loadClients() {
  const container = document.getElementById('clients-list');
  try {
    const clients = await api('/api/admin/clients');
    if (clients.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhum cliente cadastrado ainda.</p>';
      return;
    }
    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Telefone</th>
            <th>Confirmados</th>
            <th>Cancelados</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${clients.map(c => `
            <tr>
              <td>${c.name}</td>
              <td>${c.email}</td>
              <td>${c.phone}</td>
              <td>${c.confirmed}</td>
              <td>${c.cancelled}</td>
              <td>${c.totalAppointments}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

async function loadHistory() {
  const container = document.getElementById('history-list');
  try {
    const list = await api('/api/admin/history');
    if (list.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhum histórico ainda.</p>';
      return;
    }
    container.innerHTML = list.map(a => `
      <div class="appt-card">
        <div class="appt-info">
          <h4>${a.serviceName} — ${a.clientName}</h4>
          <div class="appt-meta">${formatDateBR(a.date)} às ${a.time}</div>
          <span class="appt-status ${a.status}">${a.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

// ============== INIT ==============
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();

  // date change for agenda
  const dateInput = document.getElementById('agenda-date');
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      state.selectedTime = null;
      loadSlots();
      updateSummary();
    });
  }

  // block date change
  const blockDate = document.getElementById('block-date');
  if (blockDate) {
    blockDate.addEventListener('change', loadBlockedForDate);
  }

  // mobile menu
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('nav').classList.toggle('open');
  });

  // nav links
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  // if already logged in, stay on home or go to appropriate
  if (state.user) {
    // keep on home initially
  }
});
