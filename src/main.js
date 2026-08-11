import './style.css';

const app = document.querySelector('#app');
const MODULES = [
  {
    code: 'mrti-infra', title: 'MRTI Infra', href: '/mrti-infra/',
    description: 'Administración, inventario y monitoreo centralizado de la infraestructura tecnológica.',
    features: ['Inventario', 'Monitoreo', 'Alertas'],
  },
  {
    code: 'tickets', title: 'MRTI Tickets', href: '/tickets/',
    description: 'Gestión centralizada de solicitudes, asignaciones, prioridades y niveles de servicio.',
    features: ['Tickets', 'Asignaciones', 'SLA'],
  },
  {
    code: 'agent-core', title: 'MRTI Agent Core', href: '/agent-core/',
    description: 'Telemetría, estado en vivo y descargas para los agentes instalados en los equipos.',
    features: ['Agentes', 'Telemetría', 'Alertas'],
  },
  {
    code: 'activos', title: 'MRTI Activos', href: '/activos/',
    description: 'Inventario de activos de TI: equipos, asignaciones, licencias y accesos.',
    features: ['Inventario', 'Asignaciones', 'Licencias'],
  },
  {
    code: 'rh', title: 'MRTI RH', href: '/rh/',
    description: 'Directorio de empleados, organigrama, vacaciones y expedientes documentales.',
    features: ['Directorio', 'Organigrama', 'Vacaciones'],
  },
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function token() {
  return localStorage.getItem('auth_token');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Error ${response.status}`);
    error.status = response.status;
    error.code = body.code;
    throw error;
  }
  return body;
}

function isAdministrator(profile) {
  return profile?.role === 'administrator';
}

function canOpen(profile, moduleCode) {
  return isAdministrator(profile) || profile?.allowed_modules?.includes(moduleCode);
}

function roleName(role) {
  return ({ administrator: 'Administrador', supervisor: 'Supervisor', technician: 'Técnico', viewer: 'Consulta' })[role] || role;
}

function userIdentifier(userNumber) {
  return `USR-${String(userNumber || 0).padStart(6, '0')}`;
}

function brandMarkup() {
  return `<a class="brand" href="/" aria-label="MRTI, inicio">
    <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M8 11.5 20 5l12 6.5v17L20 35 8 28.5v-17Z"/><path d="m14 15 6-3.2 6 3.2v10l-6 3.2-6-3.2V15Z"/></svg></span>
    <span><strong>MRTI</strong><small>Portal</small></span>
  </a>`;
}

function shellMarkup(profile, content) {
  return `<div class="page-shell">
    <div class="ambient ambient-one" aria-hidden="true"></div><div class="ambient ambient-two" aria-hidden="true"></div>
    <header class="topbar">
      ${brandMarkup()}
      <div class="topbar-actions">
        <button class="nav-button" id="account-button" type="button">Mi cuenta</button>
        ${isAdministrator(profile) ? '<button class="nav-button" id="control-button" type="button">Centro de control</button>' : ''}
        <span class="session-user"><strong>${escapeHtml(profile.full_name)}</strong><small>${escapeHtml(roleName(profile.role))}</small></span>
        <button class="logout-button" id="logout-button" type="button">Cerrar sesión</button>
      </div>
    </header>
    <main>${content}</main>
    <footer><span>MRTI</span><span class="footer-separator"></span><span>Infraestructura tecnológica</span><span class="copyright">© ${new Date().getFullYear()} MRTI</span></footer>
  </div>`;
}

function bindShell(profile) {
  document.querySelector('#account-button')?.addEventListener('click', () => renderAccount(profile));
  document.querySelector('#control-button')?.addEventListener('click', () => renderControlCenter(profile));
  document.querySelector('#logout-button')?.addEventListener('click', () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_profile');
    window.history.replaceState({}, '', '/');
    renderLogin();
  });
}

function cardMarkup(module) {
  const target = module.code === 'agent-core'
    ? `${module.href}#token=${encodeURIComponent(token() || '')}`
    : module.href;
  return `<article class="app-card">
    <div class="card-glow" aria-hidden="true"></div>
    <div class="app-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h7M7 17h4"/></svg></div>
    <div class="card-copy"><div class="card-title-row"><h3>${module.title}</h3><span class="available">Disponible</span></div>
      <p>${module.description}</p><ul>${module.features.map((item) => `<li>${item}</li>`).join('')}</ul></div>
    <a class="open-app" href="${target}">Abrir aplicación <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
  </article>`;
}

function renderPortal(profile) {
  const available = MODULES.filter((module) => canOpen(profile, module.code));
  const deniedCode = new URLSearchParams(window.location.search).get('accessDenied');
  const deniedModule = MODULES.find((module) => module.code === deniedCode);
  window.history.replaceState({}, '', '/');
  const banner = deniedModule
    ? `<div class="notice error">Tu área no tiene permiso para entrar a <strong>${deniedModule.title}</strong>. Si lo necesitas, solicítalo a un administrador.</div>`
    : '';
  const empty = `<div class="empty-state"><h3>Aún no tienes módulos asignados</h3><p>Un administrador debe asignarte un área desde el Centro de control.</p></div>`;
  app.innerHTML = shellMarkup(profile, `
    ${banner}
    <section class="hero personal-hero"><div class="eyebrow"><span></span> Portal personal</div><h1>Hola, ${escapeHtml(profile.full_name.split(' ')[0])}.<br><em>Este es tu espacio.</em></h1>
      <p>Consulta tu información y realiza gestiones personales sin entrar a los módulos administrativos.</p></section>
    <section class="personal-dashboard notifications-section"><div id="notifications-dashboard" class="personal-loading">Buscando novedades…</div></section>
    <section class="personal-dashboard"><div class="section-heading"><div><p class="section-label">Mi dashboard</p><h2>Información y acciones personales</h2></div><span class="app-count">${escapeHtml(userIdentifier(profile.user_number))}</span></div>
      <div id="employee-dashboard" class="personal-loading">Cargando tu información de Recursos Humanos…</div>
      <div id="assets-dashboard" class="personal-loading">Cargando tu equipo asignado…</div>
      <div id="tickets-dashboard" class="personal-loading">Cargando tus tickets…</div></section>
    <section class="applications"><div class="section-heading"><div><p class="section-label">Aplicaciones</p><h2>Herramientas disponibles</h2></div><span class="app-count">${available.length} ${available.length === 1 ? 'aplicación' : 'aplicaciones'}</span></div>
      <div class="app-grid">${available.length ? available.map(cardMarkup).join('') : empty}</div></section>`);
  bindShell(profile);
  // Cada widget corre por separado: si Activos o Tickets no responden, el
  // dashboard de RH y el resto de la página no se ven afectados.
  void loadEmployeeDashboard(profile);
  void loadAssetsDashboard(profile);
  void loadTicketsDashboard(profile);
  void loadNotifications(profile);
}

const LEAVE_STATUS = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada' };

function shortDate(value) {
  return value ? String(value).slice(0, 10) : '—';
}

async function loadEmployeeDashboard(profile, flash = '') {
  const container = document.querySelector('#employee-dashboard');
  if (!container) return;
  try {
    const year = new Date().getFullYear();
    const { data: employee } = await api('/rh-api/api/rh-self/me');
    const [{ data: balances }, { data: requests }, { data: leaveTypes }] = await Promise.all([
      api(`/rh-api/api/rh-self/me/leave-balances?year=${year}`),
      api('/rh-api/api/rh-self/me/leave-requests'),
      api('/rh-api/api/rh-self/leave-types'),
    ]);
    const balanceCards = balances.filter((item) => item.requires_balance).map((item) => `<div class="personal-metric"><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.days_available)} días</strong><small>${escapeHtml(item.days_used)} usados de ${escapeHtml(item.days_granted)}</small></div>`).join('');
    const requestRows = requests.slice(0, 6).map((request) => `<tr><td><strong>${escapeHtml(request.leave_type_name)}</strong><small>${shortDate(request.start_date)} a ${shortDate(request.end_date)}</small></td><td>${escapeHtml(request.business_days)}</td><td><span class="request-status ${escapeHtml(request.status)}">${escapeHtml(LEAVE_STATUS[request.status] || request.status)}</span></td><td>${request.status === 'pending' ? `<button class="personal-link cancel-own-request" type="button" data-request-id="${request.id}">Cancelar</button>` : ''}</td></tr>`).join('');
    container.className = 'personal-grid';
    container.innerHTML = `
      <article class="personal-card identity-card"><div class="personal-card-heading"><span class="personal-icon">ID</span><div><p>Mi información laboral</p><h3>${escapeHtml(employee.first_name)} ${escapeHtml(employee.last_name_p)} ${escapeHtml(employee.last_name_m || '')}</h3></div></div>
        <dl class="identity-details"><div><dt>Número</dt><dd>${escapeHtml(employee.employee_number)}</dd></div><div><dt>Puesto</dt><dd>${escapeHtml(employee.job_title || '—')}</dd></div><div><dt>Departamento</dt><dd>${escapeHtml(employee.department_name || '—')}</dd></div><div><dt>Jefe directo</dt><dd>${escapeHtml(employee.manager_name || '—')}</dd></div><div><dt>Correo</dt><dd>${escapeHtml(employee.work_email || profile.email)}</dd></div><div><dt>Ingreso</dt><dd>${shortDate(employee.hire_date)}</dd></div></dl></article>
      <article class="personal-card balance-card"><div class="personal-card-title"><div><p>Vacaciones y permisos</p><h3>Mis saldos ${year}</h3></div></div><div class="personal-metrics">${balanceCards || '<p class="personal-empty">RH aún no ha asignado saldos.</p>'}</div></article>
      <article class="personal-card leave-form-card"><div class="personal-card-title"><div><p>Acción rápida</p><h3>Solicitar vacaciones o permiso</h3></div></div>${flash ? `<div class="personal-flash">${escapeHtml(flash)}</div>` : ''}
        <form id="employee-leave-form" class="personal-form"><label>Tipo<select name="leave_type_id" required><option value="">Selecciona…</option>${leaveTypes.map((type) => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join('')}</select></label><div class="personal-form-dates"><label>Desde<input name="start_date" type="date" required></label><label>Hasta<input name="end_date" type="date" required></label></div><label>Motivo<textarea name="reason" rows="2" placeholder="Opcional"></textarea></label><div class="personal-form-message" id="employee-leave-message" hidden></div><button class="personal-submit" type="submit">Enviar a Recursos Humanos</button></form></article>
      <article class="personal-card requests-card"><div class="personal-card-title"><div><p>Seguimiento</p><h3>Mis solicitudes recientes</h3></div></div><div class="personal-table-scroll"><table><thead><tr><th>Solicitud</th><th>Días</th><th>Estatus</th><th></th></tr></thead><tbody>${requestRows || '<tr><td colspan="4" class="personal-empty">Aún no tienes solicitudes.</td></tr>'}</tbody></table></div></article>`;
    bindEmployeeDashboard(profile);
  } catch (error) {
    if (error.code === 'EMPLOYEE_NOT_LINKED' || error.status === 404) {
      container.className = 'personal-unlinked';
      container.innerHTML = `<div class="personal-unlinked-icon">RH</div><div><h3>Vinculación pendiente</h3><p>${escapeHtml(error.message)}</p><small>Tu acceso a las aplicaciones asignadas continúa disponible debajo.</small></div>`;
      return;
    }
    container.className = 'notice error';
    container.textContent = error.message;
  }
}

function bindEmployeeDashboard(profile) {
  const form = document.querySelector('#employee-leave-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const message = document.querySelector('#employee-leave-message');
    const values = new FormData(form);
    button.disabled = true; button.textContent = 'Enviando…'; message.hidden = true;
    try {
      await api('/rh-api/api/rh-self/me/leave-requests', { method: 'POST', body: JSON.stringify({ leave_type_id: values.get('leave_type_id'), start_date: values.get('start_date'), end_date: values.get('end_date'), reason: values.get('reason') }) });
      await loadEmployeeDashboard(profile, 'Solicitud enviada correctamente. RH ya puede revisarla.');
    } catch (error) {
      message.textContent = error.message; message.hidden = false; button.disabled = false; button.textContent = 'Enviar a Recursos Humanos';
    }
  });
  document.querySelectorAll('.cancel-own-request').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('¿Cancelar esta solicitud pendiente?')) return;
    try {
      await api(`/rh-api/api/rh-self/me/leave-requests/${button.dataset.requestId}/cancel`, { method: 'PATCH', body: '{}' });
      await loadEmployeeDashboard(profile, 'Solicitud cancelada.');
    } catch (error) { window.alert(error.message); }
  }));
}

async function loadAssetsDashboard() {
  const container = document.querySelector('#assets-dashboard');
  if (!container) return;
  try {
    const { data: assets } = await api('/activos-api/api/activos-self/me');
    container.className = 'personal-grid';
    if (!assets.length) {
      container.innerHTML = `<article class="personal-card"><div class="personal-card-title"><div><p>Activos</p><h3>Mi equipo asignado</h3></div></div><p class="personal-empty">Aún no tienes equipo asignado en MRTI Activos.</p></article>`;
      return;
    }
    const rows = assets.map((asset) => `<tr><td><strong>${escapeHtml(asset.cod_activo_fijo || asset.numero_serie || '—')}</strong><small>${escapeHtml(asset.descripcion || asset.tipo || '')}</small></td><td>${escapeHtml(asset.marca || '—')} ${escapeHtml(asset.modelo || '')}</td><td><span class="request-status ${asset.estado === 'Activo' ? 'approved' : 'pending'}">${escapeHtml(asset.estado || '—')}</span></td></tr>`).join('');
    container.innerHTML = `<article class="personal-card requests-card"><div class="personal-card-title"><div><p>Activos</p><h3>Mi equipo asignado</h3></div></div><div class="personal-table-scroll"><table><thead><tr><th>Equipo</th><th>Marca/modelo</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
  } catch (error) {
    container.className = 'notice error';
    container.textContent = error.message;
  }
}

const TICKET_STATUS_CLASS = {
  NEW: 'pending', OPEN: 'pending', ASSIGNED: 'pending', IN_DIAGNOSIS: 'pending',
  IN_PROGRESS: 'pending', ON_HOLD_USER: 'pending', ON_HOLD_VENDOR: 'pending', REOPENED: 'pending',
  RESOLVED: 'approved', CLOSED: 'approved', CANCELLED: 'rejected',
};
const TICKET_OPEN_STATUSES = ['NEW', 'OPEN', 'ASSIGNED', 'IN_DIAGNOSIS', 'IN_PROGRESS', 'ON_HOLD_USER', 'ON_HOLD_VENDOR', 'REOPENED'];

async function loadTicketsDashboard() {
  const container = document.querySelector('#tickets-dashboard');
  if (!container) return;
  try {
    const { data: tickets } = await api('/tickets-api/api/tickets-self/me');
    container.className = 'personal-grid';
    if (!tickets.length) {
      container.innerHTML = `<article class="personal-card"><div class="personal-card-title"><div><p>Tickets</p><h3>Mis tickets</h3></div></div><p class="personal-empty">No tienes tickets creados ni asignados.</p></article>`;
      return;
    }
    const rows = tickets.slice(0, 6).map((ticket) => `<tr><td><strong>${escapeHtml(ticket.folio)}</strong><small>${escapeHtml(ticket.title)}</small></td><td>${escapeHtml(ticket.priority_name || ticket.priority_code || '—')}</td><td><span class="request-status ${TICKET_STATUS_CLASS[ticket.status_code] || 'pending'}">${escapeHtml(ticket.status_name || ticket.status_code)}</span></td></tr>`).join('');
    container.innerHTML = `<article class="personal-card requests-card"><div class="personal-card-title"><div><p>Tickets</p><h3>Mis tickets</h3></div></div><div class="personal-table-scroll"><table><thead><tr><th>Ticket</th><th>Prioridad</th><th>Estatus</th></tr></thead><tbody>${rows}</tbody></table></div><a class="personal-link" href="/tickets/">Ver todos en MRTI Tickets →</a></article>`;
  } catch (error) {
    container.className = 'notice error';
    container.textContent = error.message;
  }
}

// Notificaciones consolidadas (Fase 7, último ítem del checklist): no hay
// tabla ni estado de leído/no leído — se derivan al vuelo de los mismos
// datos que ya muestran los widgets de RH/Tickets, con un enlace a la app
// correspondiente sólo si el usuario tiene permiso de abrirla. Cada fuente
// se resuelve con Promise.allSettled: si una falla, la otra igual se
// muestra (mismo principio de widgets independientes).
async function loadNotifications(profile) {
  const container = document.querySelector('#notifications-dashboard');
  if (!container) return;
  const [leaveResult, ticketsResult] = await Promise.allSettled([
    api('/rh-api/api/rh-self/me/leave-requests'),
    api('/tickets-api/api/tickets-self/me'),
  ]);

  const items = [];
  if (leaveResult.status === 'fulfilled') {
    leaveResult.value.data
      .filter((request) => request.status === 'approved' || request.status === 'rejected')
      .slice(0, 3)
      .forEach((request) => {
        items.push({
          icon: 'RH',
          text: `Tu solicitud de <strong>${escapeHtml(request.leave_type_name)}</strong> (${shortDate(request.start_date)} a ${shortDate(request.end_date)}) fue <strong>${escapeHtml(LEAVE_STATUS[request.status] || request.status).toLowerCase()}</strong>.`,
          href: null,
        });
      });
  }
  if (ticketsResult.status === 'fulfilled') {
    ticketsResult.value.data
      .filter((ticket) => ticket.assigned_to === profile.id && TICKET_OPEN_STATUSES.includes(ticket.status_code))
      .slice(0, 3)
      .forEach((ticket) => {
        items.push({
          icon: 'TK',
          text: `Tienes asignado el ticket <strong>${escapeHtml(ticket.folio)}</strong>: ${escapeHtml(ticket.title)} (${escapeHtml(ticket.status_name)}).`,
          href: canOpen(profile, 'tickets') ? '/tickets/' : null,
        });
      });
  }

  container.className = 'personal-grid';
  if (!items.length) {
    container.innerHTML = `<article class="personal-card"><div class="personal-card-title"><div><p>Novedades</p><h3>Notificaciones</h3></div></div><p class="personal-empty">Sin novedades por ahora.</p></article>`;
    return;
  }
  const rows = items.map((item) => `<li class="notification-item"><span class="personal-icon">${item.icon}</span><span>${item.text}</span>${item.href ? `<a class="personal-link" href="${item.href}">Abrir →</a>` : ''}</li>`).join('');
  container.innerHTML = `<article class="personal-card notifications-card"><div class="personal-card-title"><div><p>Novedades</p><h3>Notificaciones</h3></div></div><ul class="notification-list">${rows}</ul></article>`;
}

function renderAccount(profile) {
  app.innerHTML = shellMarkup(profile, `<section class="workspace-panel narrow-panel">
    <button class="back-button" id="back-portal" type="button">← Volver al portal</button>
    <p class="section-label">Mi cuenta</p><h1>Cambiar contraseña</h1>
    <p class="panel-copy">Actualiza tu contraseña de acceso central. El cambio aplica automáticamente a todos los módulos.</p>
    <form class="control-form" id="password-form">
      <label>Contraseña actual<input name="current_password" type="password" autocomplete="current-password" required></label>
      <label>Nueva contraseña<input name="new_password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></label>
      <label>Confirmar nueva contraseña<input name="confirmation" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></label>
      <div class="form-message" id="password-message" hidden></div>
      <button class="primary-button" type="submit">Guardar nueva contraseña</button>
    </form>
  </section>`);
  bindShell(profile);
  document.querySelector('#back-portal').addEventListener('click', () => renderPortal(profile));
  const form = document.querySelector('#password-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const message = document.querySelector('#password-message');
    if (data.get('new_password') !== data.get('confirmation')) {
      message.className = 'form-message error'; message.textContent = 'Las contraseñas nuevas no coinciden.'; message.hidden = false; return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/auth/profile/password', { method: 'PATCH', body: JSON.stringify({ current_password: data.get('current_password'), new_password: data.get('new_password') }) });
      form.reset(); message.className = 'form-message success'; message.textContent = 'Contraseña actualizada correctamente.'; message.hidden = false;
    } catch (error) {
      message.className = 'form-message error'; message.textContent = error.message; message.hidden = false;
    } finally { button.disabled = false; }
  });
}

function moduleChecks(modules, selected = []) {
  return modules.map((module) => `<label class="check-option"><input type="checkbox" value="${module.code}" ${selected.includes(module.code) ? 'checked' : ''}>${escapeHtml(module.name)}</label>`).join('');
}

async function renderControlCenter(profile, flash = '') {
  if (!isAdministrator(profile)) return renderPortal(profile);
  app.innerHTML = shellMarkup(profile, '<section class="workspace-panel"><p>Cargando centro de control…</p></section>');
  bindShell(profile);
  try {
    const data = await api('/api/auth/access-control');
    const activeAreas = data.areas.filter((area) => area.is_active);
    const areaCards = data.areas.map((area) => `<form class="area-card" data-area-id="${area.id}">
      <div class="area-heading"><input class="area-name" name="name" value="${escapeHtml(area.name)}" required><label class="active-toggle"><input name="is_active" type="checkbox" ${area.is_active ? 'checked' : ''}> Activa</label></div>
      <input name="description" value="${escapeHtml(area.description || '')}" placeholder="Descripción del área">
      <div class="module-options">${moduleChecks(data.modules, area.module_codes)}</div>
      <button class="secondary-button" type="submit">Guardar área</button></form>`).join('');
    const roleOptions = (selected = 'viewer') => ['administrator', 'supervisor', 'technician', 'viewer']
      .map((role) => `<option value="${role}" ${role === selected ? 'selected' : ''}>${escapeHtml(roleName(role))}</option>`).join('');
    const areaOptions = (selected = '') => `<option value="">Sin área</option>${activeAreas
      .map((area) => `<option value="${area.id}" ${area.id === selected ? 'selected' : ''}>${escapeHtml(area.name)}</option>`).join('')}`;
    const physicalAreaOptions = (selected = '') => `<option value="">Sin ubicación física</option>${data.physical_areas
      .map((area) => `<option value="${area.id}" ${area.id === selected ? 'selected' : ''}>${escapeHtml(`${area.site_name} · ${area.building_name} · ${area.floor_name} · ${area.name}`)}</option>`).join('')}`;
    const deviceOptions = (selected = '', ownerId = '') => `<option value="">Sin equipo habitual</option>${data.devices
      .map((device) => `<option value="${device.id}" data-area-id="${device.area_id || ''}" data-owner-id="${device.assigned_user_id || ''}" ${device.id === selected ? 'selected' : ''} ${device.assigned_user_id && device.assigned_user_id !== ownerId ? 'disabled' : ''}>${escapeHtml(`${device.internal_id} · ${device.name}${device.assigned_user_id && device.assigned_user_id !== ownerId ? ' · asignado' : ''}`)}</option>`).join('')}`;
    function ownUserFormMarkup(user) {
      return `<form class="own-user own-location-editor" data-user-id="${user.id}"><p>Modifica tus datos personales y contraseña desde “Mi cuenta”. Aquí puedes mantener tu contexto físico.</p><div class="user-fields">
        <label>Ubicación física<select class="physical-area-select" name="physical_area_id">${physicalAreaOptions(user.physical_area_id || '')}</select></label>
        <label>Equipo habitual<select class="primary-device-select" name="primary_device_id">${deviceOptions(data.devices.find((device) => device.assigned_user_id === user.id && device.is_primary_user_device)?.id || '', user.id)}</select></label>
      </div><button class="secondary-button" type="submit">Guardar ubicación</button></form>`;
    }
    function otherUserFormMarkup(user) {
      const identifier = userIdentifier(user.user_number);
      return `<form class="user-editor" data-user-id="${user.id}">
        <div class="user-detail-heading"><strong>Datos de ${identifier}</strong><small>ID interno: ${escapeHtml(user.id)}</small></div>
        <div class="user-fields"><label>Nombre<input name="full_name" value="${escapeHtml(user.full_name)}" required></label><label>Correo<input name="email" type="email" value="${escapeHtml(user.email)}" required></label>
          <label>Rol<select name="role">${roleOptions(user.role)}</select></label><label>Área de acceso<select name="access_area_id">${areaOptions(user.access_area_id || '')}</select></label>
          <label>Ubicación física<select class="physical-area-select" name="physical_area_id">${physicalAreaOptions(user.physical_area_id || '')}</select></label><label>Equipo habitual<select class="primary-device-select" name="primary_device_id">${deviceOptions(data.devices.find((device) => device.assigned_user_id === user.id && device.is_primary_user_device)?.id || '', user.id)}</select></label>
          <label>Nueva contraseña <small>(opcional)</small><input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" placeholder="Mínimo 10 caracteres"></label>
          <label>Confirmar contraseña<input name="confirmation" type="password" minlength="10" maxlength="128" autocomplete="new-password"></label></div>
        <div class="user-actions"><label class="active-toggle"><input name="is_active" type="checkbox" ${user.is_active ? 'checked' : ''}> Cuenta activa</label><button class="secondary-button" type="submit">Guardar usuario</button></div>
      </form>`;
    }
    // El cuerpo (formulario + <select> de equipos/áreas) de cada usuario se construye
    // bajo demanda al abrir su <details> — con listas grandes de usuarios/equipos,
    // pre-renderizarlas todas de una vez es O(usuarios × equipos) de DOM inútil.
    const userItems = data.users.map((user) => {
      const identifier = userIdentifier(user.user_number);
      const searchValue = `${identifier} ${user.full_name} ${user.email} ${roleName(user.role)} ${user.access_area_name || ''}`.toLocaleLowerCase('es-MX');
      const isSelf = user.id === profile.id;
      const status = isSelf ? 'active' : (user.is_active ? 'active' : 'inactive');
      const locationMeta = isSelf ? 'Acceso total' : escapeHtml(user.physical_area_name || 'Sin ubicación');
      return `<details class="user-list-item" data-user-id="${user.id}" data-user-search="${escapeHtml(searchValue)}" data-user-status="${status}"><summary>
        <span class="user-number">${identifier}</span><span class="user-summary-name"><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.email)}</small></span>
        <span class="user-summary-meta">${escapeHtml(roleName(user.role))}</span><span class="user-summary-meta">${locationMeta}</span>
        <span class="status-badge ${status}">${status === 'active' ? 'Activo' : 'Inactivo'}</span><span class="summary-chevron">⌄</span>
      </summary><div class="details-body"></div></details>`;
    }).join('');
    app.innerHTML = shellMarkup(profile, `<section class="workspace-panel control-center">
      <button class="back-button" id="back-portal" type="button">← Volver al portal</button><p class="section-label">Administración</p><h1>Centro de control</h1>
      <p class="panel-copy">Administra usuarios, áreas y permisos desde un solo lugar. Sólo los administradores pueden crear cuentas y conservan acceso total.</p>
      ${flash ? `<div class="notice success">${escapeHtml(flash)}</div>` : ''}
      ${data.physical_areas.length ? '' : '<div class="notice">Aún no hay ubicaciones físicas. Créelas en <a href="/mrti-infra/sites"><strong>MRTI Infra → Sitios</strong></a> y asigna un área a cada equipo del inventario.</div>'}
      <div class="control-section"><h2>Crear usuario</h2><form class="create-user-form" id="create-user">
        <label>Nombre completo<input name="full_name" required></label><label>Correo electrónico<input name="email" type="email" required></label>
        <label>Contraseña temporal<input name="password" type="password" minlength="10" maxlength="128" required></label><label>Confirmar contraseña<input name="confirmation" type="password" minlength="10" maxlength="128" required></label>
        <label>Rol<select name="role">${roleOptions()}</select></label><label>Área de acceso<select name="access_area_id">${areaOptions()}</select></label>
        <label>Ubicación física<select class="physical-area-select" name="physical_area_id">${physicalAreaOptions()}</select></label><label>Equipo habitual<select class="primary-device-select" name="primary_device_id">${deviceOptions()}</select></label>
        <label class="active-toggle"><input name="is_active" type="checkbox" checked> Crear cuenta activa</label><button class="primary-button" type="submit">Crear usuario</button>
      </form><p class="field-help">El usuario deberá cambiar su contraseña temporal desde “Mi cuenta”.</p></div>
      <div class="control-section"><h2>Nueva área</h2><form class="create-area-form" id="create-area"><input name="name" placeholder="Nombre del área" required><input name="description" placeholder="Descripción"><div class="module-options">${moduleChecks(data.modules)}</div><button class="primary-button" type="submit">Crear área</button></form></div>
      <div class="control-section"><h2>Áreas y módulos</h2><div class="areas-grid">${areaCards || '<p>No hay áreas creadas.</p>'}</div></div>
      <div class="control-section"><div class="users-heading"><div><h2>Usuarios</h2><span id="users-visible-count">${data.users.length} registros</span></div><div class="user-filters"><input id="user-search" type="search" placeholder="Buscar por número, nombre o correo…"><select id="user-status-filter"><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></div></div><div class="users-list">${userItems}</div><p class="empty-users" id="empty-users" hidden>No se encontraron usuarios.</p></div>
    </section>`);
    bindShell(profile);
    document.querySelector('#back-portal').addEventListener('click', () => renderPortal(profile));
    const filterUsers = () => {
      const term = document.querySelector('#user-search').value.trim().toLocaleLowerCase('es-MX');
      const status = document.querySelector('#user-status-filter').value;
      let visible = 0;
      document.querySelectorAll('.user-list-item').forEach((item) => {
        const matchesText = !term || item.dataset.userSearch.includes(term);
        const matchesStatus = status === 'all' || item.dataset.userStatus === status;
        item.hidden = !(matchesText && matchesStatus);
        if (!item.hidden) visible += 1;
      });
      document.querySelector('#users-visible-count').textContent = `${visible} ${visible === 1 ? 'registro' : 'registros'}`;
      document.querySelector('#empty-users').hidden = visible !== 0;
    };
    document.querySelector('#user-search').addEventListener('input', filterUsers);
    document.querySelector('#user-status-filter').addEventListener('change', filterUsers);
    const syncDeviceOptions = (container) => {
      const areaSelect = container.querySelector('.physical-area-select');
      const deviceSelect = container.querySelector('.primary-device-select');
      if (!areaSelect || !deviceSelect) return;
      [...deviceSelect.options].forEach((option) => {
        if (!option.value) return;
        const matchesArea = Boolean(areaSelect.value) && option.dataset.areaId === areaSelect.value;
        option.hidden = !matchesArea;
        if (!matchesArea && option.selected) deviceSelect.value = '';
      });
    };
    const createUserForm = document.querySelector('#create-user');
    syncDeviceOptions(createUserForm);
    createUserForm.querySelector('.physical-area-select')?.addEventListener('change', () => syncDeviceOptions(createUserForm));
    async function handleUserEditorSubmit(event) {
      event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const password = String(values.get('password') || '');
      if (password !== String(values.get('confirmation') || '')) return window.alert('Las contraseñas no coinciden.');
      const payload = { full_name: values.get('full_name'), email: values.get('email'), role: values.get('role'), is_active: values.get('is_active') === 'on' };
      if (password) payload.password = password;
      try {
        await api(`/api/auth/users/${form.dataset.userId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        await api(`/api/auth/users/${form.dataset.userId}/access-area`, { method: 'PATCH', body: JSON.stringify({ access_area_id: values.get('access_area_id') || null }) });
        await api(`/api/auth/users/${form.dataset.userId}/location`, { method: 'PATCH', body: JSON.stringify({ physical_area_id: values.get('physical_area_id') || null, primary_device_id: values.get('primary_device_id') || null }) });
        await renderControlCenter(profile, 'Usuario actualizado correctamente.');
      } catch (error) { window.alert(error.message); }
    }
    async function handleOwnLocationSubmit(event) {
      event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
      try {
        await api(`/api/auth/users/${form.dataset.userId}/location`, { method: 'PATCH', body: JSON.stringify({ physical_area_id: values.get('physical_area_id') || null, primary_device_id: values.get('primary_device_id') || null }) });
        await renderControlCenter(profile, 'Ubicación actualizada correctamente.');
      } catch (error) { window.alert(error.message); }
    }
    document.querySelectorAll('.user-list-item').forEach((details) => {
      details.addEventListener('toggle', () => {
        if (!details.open || details.dataset.built) return;
        details.dataset.built = '1';
        const user = data.users.find((item) => item.id === details.dataset.userId);
        if (!user) return;
        const isSelf = user.id === profile.id;
        const body = details.querySelector('.details-body');
        body.innerHTML = isSelf ? ownUserFormMarkup(user) : otherUserFormMarkup(user);
        syncDeviceOptions(body);
        body.querySelector('.physical-area-select')?.addEventListener('change', () => syncDeviceOptions(body));
        body.querySelector('form').addEventListener('submit', isSelf ? handleOwnLocationSubmit : handleUserEditorSubmit);
      });
    });
    document.querySelector('#create-user').addEventListener('submit', async (event) => {
      event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
      if (values.get('password') !== values.get('confirmation')) return window.alert('Las contraseñas no coinciden.');
      try {
        const created = await api('/api/auth/users', { method: 'POST', body: JSON.stringify({ full_name: values.get('full_name'), email: values.get('email'), password: values.get('password'), role: values.get('role'), access_area_id: values.get('access_area_id') || null, is_active: values.get('is_active') === 'on' }) });
        await api(`/api/auth/users/${created.profile.id}/location`, { method: 'PATCH', body: JSON.stringify({ physical_area_id: values.get('physical_area_id') || null, primary_device_id: values.get('primary_device_id') || null }) });
        await renderControlCenter(profile, 'Usuario creado correctamente.');
      } catch (error) { window.alert(error.message); }
    });
    document.querySelector('#create-area').addEventListener('submit', async (event) => {
      event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
      try { await api('/api/auth/access-areas', { method: 'POST', body: JSON.stringify({ name: values.get('name'), description: values.get('description'), module_codes: [...form.querySelectorAll('input[type="checkbox"]:checked')].map((item) => item.value) }) }); await renderControlCenter(profile, 'Área creada correctamente.'); }
      catch (error) { window.alert(error.message); }
    });
    document.querySelectorAll('.area-card').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault(); const values = new FormData(form);
      try { await api(`/api/auth/access-areas/${form.dataset.areaId}`, { method: 'PATCH', body: JSON.stringify({ name: values.get('name'), description: values.get('description'), is_active: values.get('is_active') === 'on', module_codes: [...form.querySelectorAll('.module-options input:checked')].map((item) => item.value) }) }); await renderControlCenter(profile, 'Área actualizada.'); }
      catch (error) { window.alert(error.message); }
    }));
  } catch (error) {
    app.innerHTML = shellMarkup(profile, `<section class="workspace-panel"><div class="notice error">${escapeHtml(error.message)}</div><button class="back-button" id="back-portal">← Volver al portal</button></section>`);
    bindShell(profile); document.querySelector('#back-portal').addEventListener('click', () => renderPortal(profile));
  }
}

function loginMarkup() {
  return `<main class="core-login"><div class="ambient ambient-one"></div><div class="ambient ambient-two"></div><section class="login-panel">
    <div class="brand login-brand">${brandMarkup().replace('<a ', '<span ').replace('</a>', '</span>')}</div>
    <p class="login-eyebrow">Acceso central</p><h1>Inicia sesión una sola vez.</h1><p class="login-copy">Tu sesión se comparte con todos los módulos autorizados.</p>
    <form id="login-form" class="login-form"><label>Correo electrónico<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><div class="login-error" id="login-error" hidden></div><button class="login-button" type="submit">Iniciar sesión</button></form>
    <p class="register-link">Las cuentas nuevas son creadas por un administrador.</p></section></main>`;
}

function requestedDestination() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('accessDenied')) return null;
  const value = params.get('returnTo');
  if (!value) return null;
  try { const destination = new URL(value, window.location.origin); return destination.origin === window.location.origin ? `${destination.pathname}${destination.search}${destination.hash}` : null; }
  catch { return null; }
}

function renderLogin(message = '') {
  app.innerHTML = loginMarkup();
  const form = document.querySelector('#login-form'); const errorElement = document.querySelector('#login-error');
  if (message) { errorElement.textContent = message; errorElement.hidden = false; }
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('button'); const data = new FormData(form); button.disabled = true; button.textContent = 'Ingresando…'; errorElement.hidden = true;
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      const body = await response.json(); if (!response.ok || !body.token) throw new Error(body.error || 'No se pudo iniciar sesión');
      localStorage.setItem('auth_token', body.token); localStorage.setItem('auth_profile', JSON.stringify(body.profile || {}));
      const destination = requestedDestination(); if (destination && destination !== '/') window.location.replace(destination); else renderPortal(body.profile);
    } catch (error) { errorElement.textContent = error.message || 'No se pudo iniciar sesión'; errorElement.hidden = false; button.disabled = false; button.textContent = 'Iniciar sesión'; }
  });
}

async function initialize() {
  if (!token()) return renderLogin();
  try {
    const { profile } = await api('/api/auth/me'); localStorage.setItem('auth_profile', JSON.stringify(profile || {}));
    const destination = requestedDestination();
    if (destination && destination !== '/') {
      const destinationModule = MODULES.find((module) => destination.startsWith(module.href));
      if (!destinationModule || canOpen(profile, destinationModule.code)) return window.location.replace(destination);
    }
    renderPortal(profile);
  } catch { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_profile'); renderLogin('Tu sesión expiró. Inicia sesión nuevamente.'); }
}

void initialize();
