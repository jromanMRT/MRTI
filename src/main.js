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
  if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
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
    <section class="hero"><div class="eyebrow"><span></span> Centro de operaciones</div><h1>Todo tu entorno TI,<br><em>en un solo lugar.</em></h1>
      <p>${profile.access_area_name ? `Área asignada: ${escapeHtml(profile.access_area_name)}.` : 'Accede de forma centralizada a las herramientas internas de MRTI.'}</p></section>
    <section class="applications"><div class="section-heading"><div><p class="section-label">Aplicaciones</p><h2>Herramientas disponibles</h2></div><span class="app-count">${available.length} ${available.length === 1 ? 'aplicación' : 'aplicaciones'}</span></div>
      <div class="app-grid">${available.length ? available.map(cardMarkup).join('') : empty}</div></section>`);
  bindShell(profile);
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
    const userItems = data.users.map((user) => {
      const identifier = userIdentifier(user.user_number);
      const searchValue = `${identifier} ${user.full_name} ${user.email} ${roleName(user.role)} ${user.access_area_name || ''}`.toLocaleLowerCase('es-MX');
      if (user.id === profile.id) {
        return `<details class="user-list-item" data-user-search="${escapeHtml(searchValue)}" data-user-status="active"><summary>
          <span class="user-number">${identifier}</span><span class="user-summary-name"><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.email)}</small></span>
          <span class="user-summary-meta">${escapeHtml(roleName(user.role))}</span><span class="user-summary-meta">Acceso total</span><span class="status-badge active">Activo</span><span class="summary-chevron">⌄</span>
        </summary><form class="own-user own-location-editor" data-user-id="${user.id}"><p>Modifica tus datos personales y contraseña desde “Mi cuenta”. Aquí puedes mantener tu contexto físico.</p><div class="user-fields">
          <label>Ubicación física<select class="physical-area-select" name="physical_area_id">${physicalAreaOptions(user.physical_area_id || '')}</select></label>
          <label>Equipo habitual<select class="primary-device-select" name="primary_device_id">${deviceOptions(data.devices.find((device) => device.assigned_user_id === user.id && device.is_primary_user_device)?.id || '', user.id)}</select></label>
        </div><button class="secondary-button" type="submit">Guardar ubicación</button></form></details>`;
      }
      return `<details class="user-list-item" data-user-search="${escapeHtml(searchValue)}" data-user-status="${user.is_active ? 'active' : 'inactive'}"><summary>
        <span class="user-number">${identifier}</span><span class="user-summary-name"><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.email)}</small></span>
        <span class="user-summary-meta">${escapeHtml(roleName(user.role))}</span><span class="user-summary-meta">${escapeHtml(user.physical_area_name || 'Sin ubicación')}</span>
        <span class="status-badge ${user.is_active ? 'active' : 'inactive'}">${user.is_active ? 'Activo' : 'Inactivo'}</span><span class="summary-chevron">⌄</span>
      </summary><form class="user-editor" data-user-id="${user.id}">
        <div class="user-detail-heading"><strong>Datos de ${identifier}</strong><small>ID interno: ${escapeHtml(user.id)}</small></div>
        <div class="user-fields"><label>Nombre<input name="full_name" value="${escapeHtml(user.full_name)}" required></label><label>Correo<input name="email" type="email" value="${escapeHtml(user.email)}" required></label>
          <label>Rol<select name="role">${roleOptions(user.role)}</select></label><label>Área de acceso<select name="access_area_id">${areaOptions(user.access_area_id || '')}</select></label>
          <label>Ubicación física<select class="physical-area-select" name="physical_area_id">${physicalAreaOptions(user.physical_area_id || '')}</select></label><label>Equipo habitual<select class="primary-device-select" name="primary_device_id">${deviceOptions(data.devices.find((device) => device.assigned_user_id === user.id && device.is_primary_user_device)?.id || '', user.id)}</select></label>
          <label>Nueva contraseña <small>(opcional)</small><input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" placeholder="Mínimo 10 caracteres"></label>
          <label>Confirmar contraseña<input name="confirmation" type="password" minlength="10" maxlength="128" autocomplete="new-password"></label></div>
        <div class="user-actions"><label class="active-toggle"><input name="is_active" type="checkbox" ${user.is_active ? 'checked' : ''}> Cuenta activa</label><button class="secondary-button" type="submit">Guardar usuario</button></div>
      </form></details>`;
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
    document.querySelectorAll('#create-user, .user-editor, .own-location-editor').forEach((container) => {
      syncDeviceOptions(container);
      container.querySelector('.physical-area-select')?.addEventListener('change', () => syncDeviceOptions(container));
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
    document.querySelectorAll('.user-editor').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault(); const values = new FormData(form); const password = String(values.get('password') || '');
      if (password !== String(values.get('confirmation') || '')) return window.alert('Las contraseñas no coinciden.');
      const payload = { full_name: values.get('full_name'), email: values.get('email'), role: values.get('role'), is_active: values.get('is_active') === 'on' };
      if (password) payload.password = password;
      try {
        await api(`/api/auth/users/${form.dataset.userId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        await api(`/api/auth/users/${form.dataset.userId}/access-area`, { method: 'PATCH', body: JSON.stringify({ access_area_id: values.get('access_area_id') || null }) });
        await api(`/api/auth/users/${form.dataset.userId}/location`, { method: 'PATCH', body: JSON.stringify({ physical_area_id: values.get('physical_area_id') || null, primary_device_id: values.get('primary_device_id') || null }) });
        await renderControlCenter(profile, 'Usuario actualizado correctamente.');
      } catch (error) { window.alert(error.message); }
    }));
    document.querySelector('.own-location-editor')?.addEventListener('submit', async (event) => {
      event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
      try {
        await api(`/api/auth/users/${form.dataset.userId}/location`, { method: 'PATCH', body: JSON.stringify({ physical_area_id: values.get('physical_area_id') || null, primary_device_id: values.get('primary_device_id') || null }) });
        await renderControlCenter(profile, 'Ubicación actualizada correctamente.');
      } catch (error) { window.alert(error.message); }
    });
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
