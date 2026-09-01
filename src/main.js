import './style.css';
import './ticket-self-service.css';

const app = document.querySelector('#app');
const FALLBACK_MODULES = [
  {
    code: 'mrti-obs', title: 'MRTI Monitor', href: '/mrti-obs/',
    description: 'Observabilidad, topología, disponibilidad y alertas de la infraestructura tecnológica.',
    features: ['Monitoreo', 'Topología', 'Alertas'],
  },
  {
    code: 'tickets', title: 'MRTI Tickets', href: '/tickets/',
    description: 'Gestión centralizada de tickets, asignaciones, prioridades y niveles de servicio.',
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
let portalApplications = [...FALLBACK_MODULES];
const DEFAULT_BRAND_APPEARANCE = {
  portal_logo: { asset_id: null, content_url: '/company-logo.svg' },
  login_background: { asset_id: null, content_url: null },
};
let brandAppearance = structuredClone(DEFAULT_BRAND_APPEARANCE);
const DEFAULT_USER_PREFERENCES = {
  theme: 'system', density: 'comfortable', show_notifications: true,
  show_rh: true, show_assets: true, show_tickets: true,
};
let userPreferences = { ...DEFAULT_USER_PREFERENCES };
let avatarObjectUrl = null;
let notificationRefreshTimer = null;
let notificationPanelController = null;

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
    const error = new Error(body.error?.message || body.error || `Error ${response.status}`);
    error.status = response.status;
    error.code = body.error?.code || body.code;
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

async function refreshApplications() {
  try {
    const { data } = await api('/api/portal/v1/applications');
    portalApplications = data.map((application) => ({
      ...application,
      title: application.name,
      href: application.url,
      features: Array.isArray(application.features) ? application.features : [],
    }));
  } catch {
    // Compatibilidad de despliegue: si la Etapa 2 aún no está disponible,
    // el portal conserva el catálogo conocido en vez de quedar inutilizable.
    portalApplications = [...FALLBACK_MODULES];
  }
}

async function refreshPreferences() {
  try {
    const { preferences } = await api('/api/auth/profile/preferences');
    userPreferences = { ...DEFAULT_USER_PREFERENCES, ...preferences };
  } catch {
    userPreferences = { ...DEFAULT_USER_PREFERENCES };
  }
  if (userPreferences.theme === 'system') localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, userPreferences.theme);
  applyTheme(currentTheme());
  document.documentElement.dataset.density = userPreferences.density;
  return userPreferences;
}

async function refreshAvatar(profile) {
  if (avatarObjectUrl) {
    URL.revokeObjectURL(avatarObjectUrl);
    avatarObjectUrl = null;
  }
  if (!profile?.avatar_url) return null;
  try {
    const response = await fetch(profile.avatar_url, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    avatarObjectUrl = URL.createObjectURL(await response.blob());
  } catch {
    avatarObjectUrl = null;
  }
  return avatarObjectUrl;
}

async function refreshBrandAppearance() {
  try {
    const response = await fetch('/api/portal/v1/brand-appearance', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    const { data } = await response.json();
    brandAppearance = {
      portal_logo: data.portal_logo?.content_url ? data.portal_logo : DEFAULT_BRAND_APPEARANCE.portal_logo,
      login_background: data.login_background || DEFAULT_BRAND_APPEARANCE.login_background,
    };
  } catch {
    brandAppearance = structuredClone(DEFAULT_BRAND_APPEARANCE);
  }
  return brandAppearance;
}

function roleName(role) {
  return ({ administrator: 'Administrador', supervisor: 'Supervisor', technician: 'Técnico', viewer: 'Consulta' })[role] || role;
}

function userIdentifier(userNumber) {
  return `USR-${String(userNumber || 0).padStart(6, '0')}`;
}

const THEME_KEY = 'mrti_theme';

function preferredTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function currentTheme() {
  return localStorage.getItem(THEME_KEY) || preferredTheme();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('#theme-toggle')?.setAttribute('aria-pressed', String(theme === 'dark'));
}

window.addEventListener('storage', (event) => {
  if (event.key !== THEME_KEY) return;
  applyTheme(event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : preferredTheme());
});

async function persistSharedTheme(theme) {
  userPreferences = { ...userPreferences, theme };
  try {
    const { preferences } = await api('/api/auth/profile/preferences/theme', {
      method: 'PATCH', body: JSON.stringify({ theme }),
    });
    userPreferences = { ...userPreferences, ...preferences };
  } catch {
    // El cambio local sigue siendo útil si Core está momentáneamente ocupado;
    // se reintentará en el siguiente cambio explícito del usuario.
  }
}

function bindThemeToggle() {
  applyTheme(currentTheme());
  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    void persistSharedTheme(next);
  });
}

function themeToggleMarkup() {
  return `<button class="theme-toggle" id="theme-toggle" type="button" aria-label="Cambiar tema" aria-pressed="false">
    <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
    <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>
  </button>`;
}

function appLinkMarkup(module) {
  const target = module.code === 'agent-core'
    ? `${module.href}#token=${encodeURIComponent(token() || '')}&theme=${encodeURIComponent(currentTheme())}`
    : module.href;
  const maintenance = module.status === 'maintenance';
  const icon = '<span class="nav-icon" aria-hidden="true">▦</span>';
  if (maintenance) {
    return `<span class="nav-button is-disabled">${icon}<span class="nav-label">${escapeHtml(module.title)}</span><span class="nav-status">Mantenimiento</span></span>`;
  }
  return `<a class="nav-button" href="${escapeHtml(target)}">${icon}<span class="nav-label">${escapeHtml(module.title)}</span></a>`;
}

// Los módulos se listan como enlaces directos en la barra lateral (en lugar
// de un desplegable) para que el acceso sea de un solo clic.
function appLinksMarkup(profile) {
  const available = portalApplications.filter((module) => canOpen(profile, module.code));
  if (!available.length) return '';
  return `<div class="sidebar-section">
    <span class="sidebar-section-label">Aplicaciones</span>
    ${available.map(appLinkMarkup).join('')}
  </div>`;
}

function brandMarkup() {
  return `<a class="brand" href="/" aria-label="Minera Río Tinto, inicio">
    <span class="brand-mark"><img src="${escapeHtml(brandAppearance.portal_logo.content_url || '/company-logo.svg')}" alt=""></span>
    <span><strong>MRTI</strong><small>Minera Río Tinto</small></span>
  </a>`;
}

function avatarMarkup(profile, className = '') {
  const initials = String(profile.full_name || 'Usuario').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return avatarObjectUrl
    ? `<span class="user-avatar ${className}"><img src="${escapeHtml(avatarObjectUrl)}" alt="Foto de ${escapeHtml(profile.full_name)}"></span>`
    : `<span class="user-avatar ${className}" aria-hidden="true">${escapeHtml(initials || 'U')}</span>`;
}

function longDate(date = new Date()) {
  const value = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function setHomeStat(id, value, detail, state = '') {
  const card = document.querySelector(`#${id}`);
  if (!card) return;
  card.className = `home-stat ${state}`.trim();
  card.querySelector('strong').textContent = value;
  card.querySelector('small').textContent = detail;
}

function shellMarkup(profile, content, reportTitle = '') {
  const collapsed = localStorage.getItem('mrti_core_sidebar_collapsed') === '1';
  return `<div class="page-shell${collapsed ? ' sidebar-collapsed' : ''}">
    <div class="ambient ambient-one" aria-hidden="true"></div><div class="ambient ambient-two" aria-hidden="true"></div>
    <button class="sidebar-backdrop" id="sidebar-backdrop" type="button" aria-label="Cerrar navegación" tabindex="-1"></button>
    <aside class="portal-sidebar" id="portal-sidebar" aria-label="Navegación del portal">
      <div class="sidebar-brand">${brandMarkup()}</div>
      <nav class="primary-nav" aria-label="Navegación principal">
        <button class="primary-nav-link active" id="home-button" type="button"><span class="nav-icon" aria-hidden="true">⌂</span><span class="nav-label">Inicio</span></button>
        <button class="primary-nav-link" id="core-new-ticket-button" type="button"><span class="nav-icon" aria-hidden="true">＋</span><span class="nav-label">Nuevo ticket</span></button><button class="primary-nav-link" id="core-my-tickets-button" type="button"><span class="nav-icon" aria-hidden="true">◇</span><span class="nav-label">Mis tickets</span></button>
      </nav>
      ${appLinksMarkup(profile)}
      <div class="sidebar-section">
        <span class="sidebar-section-label">Espacio de trabajo</span>
        <button class="nav-button" id="brand-button" type="button"><span class="nav-icon" aria-hidden="true">◆</span><span class="nav-label">Recursos de marca</span></button>
        <button class="nav-button" id="account-button" type="button"><span class="nav-icon" aria-hidden="true">○</span><span class="nav-label">Perfil</span></button>
        ${isAdministrator(profile) ? '<button class="nav-button" id="control-button" type="button"><span class="nav-icon" aria-hidden="true">⚙</span><span class="nav-label">Centro de control</span></button>' : ''}
      </div>
      <div class="sidebar-footer">
        ${themeToggleMarkup()}
        <button class="sidebar-collapse" id="sidebar-collapse" type="button" aria-label="${collapsed ? 'Expandir' : 'Colapsar'} menú lateral" title="${collapsed ? 'Expandir' : 'Colapsar'} menú lateral">${collapsed ? '»' : '«'}</button>
        <button class="logout-button" id="logout-button" type="button"><span class="nav-label">Cerrar sesión</span><span class="collapsed-only" aria-hidden="true">↪</span></button>
      </div>
    </aside>
    <div class="portal-workspace">
      <header class="topbar">
        <button class="mobile-menu-button" id="mobile-menu-button" type="button" aria-label="Abrir navegación" aria-expanded="false" aria-controls="portal-sidebar">☰</button>
        <div class="mobile-brand">${brandMarkup()}</div>
        <div class="topbar-context"><strong>Mi espacio</strong><small>Dashboard y configuración personal</small></div>
        <div class="topbar-actions">
          ${reportTitle ? '<button class="print-report-button" id="print-report-button" type="button" title="Imprimir reporte de esta vista" aria-label="Imprimir reporte de esta vista"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></svg><span>Imprimir reporte</span></button>' : ''}
          <div class="notification-center">
            <button class="notification-button" id="notifications-button" type="button" aria-label="Ver notificaciones" aria-expanded="false" aria-controls="notifications-panel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="notification-count" id="notification-count" hidden></span></button>
            <section class="notification-popover" id="notifications-panel" aria-label="Notificaciones" hidden>
              <header><div><small>Novedades</small><strong>Notificaciones</strong></div><button id="notifications-close" type="button" aria-label="Cerrar notificaciones">×</button></header>
              <div id="notifications-dashboard" class="notification-panel-loading" aria-live="polite">Buscando novedades…</div>
            </section>
          </div>
          <button class="session-profile" id="topbar-profile-button" type="button" aria-label="Abrir mi configuración">${avatarMarkup(profile, 'small')}<span class="session-user"><strong>${escapeHtml(profile.full_name)}</strong><small>${escapeHtml(roleName(profile.role))}</small></span></button>
        </div>
      </header>
      <main>${reportTitle ? `<div class="print-report-header" aria-hidden="true"><div><strong>MRTI</strong><span>Core · ${escapeHtml(reportTitle)}</span></div><small>Generado ${escapeHtml(new Date().toLocaleString('es-MX'))}</small></div>` : ''}${content}</main>
      <footer><span>MRTI</span><span class="footer-separator"></span><span>La puerta de entrada digital de Minera Río Tinto</span><span class="copyright">© ${new Date().getFullYear()} MRTI</span></footer>
    </div>
  </div>`;
}

function openCoreTicketCreation(profile) {
  renderPortal(profile);
  const panel = document.querySelector('#ticket-create-panel');
  panel.open = true;
  requestAnimationFrame(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.querySelector('#ticket-self-form [name="title"]')?.focus({ preventScroll: true });
  });
}

function openCoreTicketHistory(profile) {
  const wasVisible = userPreferences.show_tickets;
  userPreferences = { ...userPreferences, show_tickets: true };
  renderPortal(profile);
  userPreferences = { ...userPreferences, show_tickets: wasVisible };
  requestAnimationFrame(() => document.querySelector('#tickets-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function bindShell(profile) {
  bindThemeToggle();
  const shell = document.querySelector('.page-shell');
  const mobileButton = document.querySelector('#mobile-menu-button');
  const closeMobileMenu = () => {
    shell?.classList.remove('sidebar-mobile-open');
    mobileButton?.setAttribute('aria-expanded', 'false');
  };
  mobileButton?.addEventListener('click', () => {
    const open = !shell?.classList.contains('sidebar-mobile-open');
    shell?.classList.toggle('sidebar-mobile-open', open);
    mobileButton.setAttribute('aria-expanded', String(open));
  });
  document.querySelector('#sidebar-backdrop')?.addEventListener('click', closeMobileMenu);
  document.querySelector('#portal-sidebar')?.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) closeMobileMenu();
  });
  document.querySelector('#sidebar-collapse')?.addEventListener('click', () => {
    const collapsed = shell?.classList.toggle('sidebar-collapsed') || false;
    localStorage.setItem('mrti_core_sidebar_collapsed', collapsed ? '1' : '0');
    const button = document.querySelector('#sidebar-collapse');
    button.textContent = collapsed ? '»' : '«';
    button.setAttribute('aria-label', collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral');
    button.setAttribute('title', collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral');
  });
  document.querySelector('#home-button')?.addEventListener('click', () => renderPortal(profile));
  document.querySelector('#print-report-button')?.addEventListener('click', () => window.print());
  document.querySelector('#core-new-ticket-button')?.addEventListener('click', () => openCoreTicketCreation(profile));
  document.querySelector('#core-my-tickets-button')?.addEventListener('click', () => openCoreTicketHistory(profile));
  notificationPanelController?.abort();
  notificationPanelController = new AbortController();
  const notificationButton = document.querySelector('#notifications-button');
  const notificationPanel = document.querySelector('#notifications-panel');
  const setNotificationPanelOpen = (open) => {
    if (!notificationButton || !notificationPanel) return;
    notificationPanel.hidden = !open;
    notificationButton.setAttribute('aria-expanded', String(open));
  };
  notificationButton?.addEventListener('click', () => setNotificationPanelOpen(notificationPanel.hidden));
  document.querySelector('#notifications-close')?.addEventListener('click', () => {
    setNotificationPanelOpen(false);
    notificationButton?.focus();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.notification-center')) setNotificationPanelOpen(false);
  }, { signal: notificationPanelController.signal });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || notificationPanel?.hidden) return;
    setNotificationPanelOpen(false);
    notificationButton?.focus();
  }, { signal: notificationPanelController.signal });
  document.querySelector('#brand-button')?.addEventListener('click', () => renderBrandAssets(profile));
  document.querySelector('#account-button')?.addEventListener('click', () => renderAccount(profile));
  document.querySelector('#topbar-profile-button')?.addEventListener('click', () => renderAccount(profile));
  document.querySelector('#control-button')?.addEventListener('click', () => renderControlCenter(profile));
  document.querySelector('#logout-button')?.addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* cierre local garantizado */ }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_profile');
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    avatarObjectUrl = null;
    window.history.replaceState({}, '', '/');
    renderLogin();
  });
  void loadNotifications(profile);
  if (notificationRefreshTimer) window.clearInterval(notificationRefreshTimer);
  notificationRefreshTimer = window.setInterval(() => {
    if (!document.querySelector('#notifications-dashboard')) {
      window.clearInterval(notificationRefreshTimer);
      notificationRefreshTimer = null;
      return;
    }
    void loadNotifications(profile);
  }, 60_000);
}

// Los módulos enlazan aquí con ?view=account|control-center|notifications
// para llevar al usuario directo a esa pantalla de Core (ver bindShell) en
// lugar de dejarlo parado en el dashboard con un clic extra por dar.
function renderPortal(profile, requestedView = new URLSearchParams(window.location.search).get('view')) {
  const deniedCode = new URLSearchParams(window.location.search).get('accessDenied');
  const deniedModule = portalApplications.find((module) => module.code === deniedCode);
  window.history.replaceState({}, '', '/');
  const banner = deniedModule
    ? `<div class="notice error">Tu área no tiene permiso para entrar a <strong>${escapeHtml(deniedModule.title)}</strong>. Si lo necesitas, solicítalo a un administrador.</div>`
    : '';
  const firstName = profile.full_name.split(' ')[0];
  const location = [profile.physical_site_name, profile.physical_area_name].filter(Boolean).join(' · ') || 'Ubicación pendiente';
  const quickActions = [
    { action: 'new-ticket', icon: '+', title: 'Nuevo ticket', copy: 'Reporta cualquier necesidad mediante Tickets.' },
    { href: '#tickets-dashboard', icon: 'T', title: 'Mis tickets', copy: 'Consulta aquí su avance y prioridad.' },
    { href: '#assets-dashboard', icon: 'A', title: 'Mis activos', copy: 'Consulta el equipo que tienes asignado.' },
  ].filter(Boolean);
  app.innerHTML = shellMarkup(profile, `
    ${banner}
    <section class="hero personal-hero home-hero"><div class="home-intro"><div class="eyebrow"><span></span> Mi espacio</div><h1>${greeting()}, ${escapeHtml(firstName)}.<br><em>Este es tu dashboard.</em></h1>
      <p>Consulta tus gestiones, entra a tus módulos y adapta este espacio a tu forma de trabajar.</p>
      <dl class="home-context"><div><dt>Fecha</dt><dd>${escapeHtml(longDate())}</dd></div><div><dt>Área</dt><dd id="home-department">${escapeHtml(profile.access_area_name || 'Sin área asignada')}</dd></div><div><dt>Puesto</dt><dd id="home-position">Consultando RH…</dd></div><div><dt>Ubicación</dt><dd>${escapeHtml(location)}</dd></div></dl></div>
      <aside class="home-overview" aria-label="Resumen personal"><p class="section-label">Tu resumen</p><div class="home-stats">${userPreferences.show_tickets ? '<article class="home-stat" id="requests-stat"><span>Tickets abiertos</span><strong>—</strong><small>Consultando…</small></article>' : ''}${userPreferences.show_assets ? '<article class="home-stat" id="assets-stat"><span>Activos asignados</span><strong>—</strong><small>Consultando…</small></article>' : ''}</div></aside></section>
    <section class="quick-actions" aria-labelledby="quick-actions-title"><div class="section-heading"><div><p class="section-label">Acciones rápidas</p><h2 id="quick-actions-title">Empieza por lo que necesitas</h2></div></div><div class="quick-action-grid">${quickActions.map((action) => action.action
    ? `<button class="quick-action" type="button" data-core-action="${action.action}"><span>${action.icon}</span><div><strong>${action.title}</strong><small>${action.copy}</small></div><b aria-hidden="true">→</b></button>`
    : `<a class="quick-action" href="${action.href}"><span>${action.icon}</span><div><strong>${action.title}</strong><small>${action.copy}</small></div><b aria-hidden="true">→</b></a>`).join('')}</div></section>
    <section class="personal-dashboard ticket-self-service" id="ticket-self-service"><details class="personal-card ticket-create-card" id="ticket-create-panel"><summary><span><small>Autoservicio</small><strong>Levantar un ticket desde Core</strong></span><b>Mostrar formulario</b></summary><form class="personal-form ticket-self-form" id="ticket-self-form"><label>Título<input name="title" maxlength="255" placeholder="Describe brevemente el problema" required></label><label>Descripción<textarea name="description" rows="5" maxlength="10000" placeholder="Incluye síntomas y cualquier dato útil"></textarea></label><div class="personal-form-dates ticket-destination-fields"><label>Área<select name="business_area_id" id="ticket-business-area" required><option value="">Cargando áreas…</option></select></label><label>Categoría<select name="category_id" id="ticket-category" required disabled><option value="">Selecciona primero el área</option></select></label><label>Detalle<select name="subcategory_id" id="ticket-subcategory" disabled><option value="">Selecciona primero la categoría</option></select></label><label>Prioridad<select name="priority_code" id="ticket-priority"><option value="P3">P3 · Normal</option></select></label></div><div class="personal-form-message" id="ticket-form-message" hidden></div><button class="personal-submit" type="submit">Enviar ticket</button></form></details></section>
    <section class="personal-dashboard"><div class="section-heading"><div><p class="section-label">Mi espacio</p><h2>Información y gestiones personales</h2></div><span class="app-count">${escapeHtml(userIdentifier(profile.user_number))}</span></div>
      ${userPreferences.show_rh ? '<div id="employee-dashboard" class="personal-loading">Cargando tu información de Recursos Humanos…</div>' : ''}
      ${userPreferences.show_assets ? '<div id="assets-dashboard" class="personal-loading">Cargando tu equipo asignado…</div>' : ''}
      ${userPreferences.show_tickets ? '<div id="tickets-dashboard" class="personal-loading">Cargando tus tickets…</div>' : ''}</section>`, 'Mi espacio');
  bindShell(profile);
  bindTicketSelfService(profile);
  if (requestedView === 'account') renderAccount(profile);
  else if (requestedView === 'control-center' && isAdministrator(profile)) void renderControlCenter(profile);
  else if (requestedView === 'brand-assets' && isAdministrator(profile)) void renderBrandAssets(profile);
  else if (requestedView === 'notifications') document.querySelector('#notifications-button')?.click();
  // Cada widget corre por separado: si Activos o Tickets no responden, el
  // dashboard de RH y el resto de la página no se ven afectados.
  void loadEmployeeDashboard(profile);
  void loadAssetsDashboard(profile);
  void loadTicketsDashboard(profile);
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : '—';
}

async function loadEmployeeDashboard(profile) {
  const container = document.querySelector('#employee-dashboard');
  if (!container) return;
  try {
    const year = new Date().getFullYear();
    const { data: employee } = await api('/rh-api/api/rh-self/me');
    const { data: balances } = await api(`/rh-api/api/rh-self/me/leave-balances?year=${year}`);
    const department = document.querySelector('#home-department');
    const position = document.querySelector('#home-position');
    if (department) department.textContent = employee.department_name || profile.access_area_name || 'Sin área asignada';
    if (position) position.textContent = employee.job_title || 'Sin puesto registrado';
    const balanceCards = balances.filter((item) => item.requires_balance).map((item) => `<div class="personal-metric"><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.days_available)} días</strong><small>${escapeHtml(item.days_used)} usados de ${escapeHtml(item.days_granted)}</small></div>`).join('');
    container.className = 'personal-grid';
    container.innerHTML = `
      <article class="personal-card identity-card"><div class="personal-card-heading"><span class="personal-icon">ID</span><div><p>Mi información laboral</p><h3>${escapeHtml(employee.first_name)} ${escapeHtml(employee.last_name_p)} ${escapeHtml(employee.last_name_m || '')}</h3></div></div>
        <dl class="identity-details"><div><dt>Número</dt><dd>${escapeHtml(employee.employee_number)}</dd></div><div><dt>Puesto</dt><dd>${escapeHtml(employee.job_title || '—')}</dd></div><div><dt>Departamento</dt><dd>${escapeHtml(employee.department_name || '—')}</dd></div><div><dt>Jefe directo</dt><dd>${escapeHtml(employee.manager_name || '—')}</dd></div><div><dt>Correo</dt><dd>${escapeHtml(employee.work_email || profile.email)}</dd></div><div><dt>Ingreso</dt><dd>${shortDate(employee.hire_date)}</dd></div></dl></article>
      <article class="personal-card balance-card"><div class="personal-card-title"><div><p>Información de Recursos Humanos</p><h3>Saldos disponibles ${year}</h3></div></div><div class="personal-metrics">${balanceCards || '<p class="personal-empty">RH aún no ha asignado saldos.</p>'}</div><p class="personal-card-note">Las vacaciones, permisos y demás gestiones deben solicitarse mediante un ticket.</p></article>`;
  } catch (error) {
    const position = document.querySelector('#home-position');
    if (error.code === 'EMPLOYEE_NOT_LINKED' || error.status === 404) {
      if (position) position.textContent = 'Sin ficha laboral vinculada';
      container.className = 'personal-unlinked';
      container.innerHTML = `<div class="personal-unlinked-icon">RH</div><div><h3>Vinculación pendiente</h3><p>${escapeHtml(error.message)}</p><small>Tu acceso a las aplicaciones asignadas continúa disponible debajo.</small></div>`;
      return;
    }
    if (position) position.textContent = 'Información no disponible';
    container.className = 'notice error';
    container.textContent = error.message;
  }
}

async function loadAssetsDashboard() {
  const container = document.querySelector('#assets-dashboard');
  if (!container) return;
  try {
    const { data: assets } = await api('/activos-api/api/activos-self/me');
    setHomeStat('assets-stat', String(assets.length), assets.length === 1 ? 'Activo bajo tu resguardo' : 'Activos bajo tu resguardo', 'ok');
    container.className = 'personal-grid';
    if (!assets.length) {
      container.innerHTML = `<article class="personal-card"><div class="personal-card-title"><div><p>Activos</p><h3>Mi equipo asignado</h3></div></div><p class="personal-empty">Aún no tienes equipo asignado en MRTI Activos.</p></article>`;
      return;
    }
    const rows = assets.map((asset) => `<tr><td><strong>${escapeHtml(asset.cod_activo_fijo || asset.numero_serie || '—')}</strong><small>${escapeHtml(asset.descripcion || asset.tipo || '')}</small></td><td>${escapeHtml(asset.marca || '—')} ${escapeHtml(asset.modelo || '')}</td><td><span class="request-status ${asset.estado === 'Activo' ? 'approved' : 'pending'}">${escapeHtml(asset.estado || '—')}</span></td></tr>`).join('');
    container.innerHTML = `<article class="personal-card requests-card"><div class="personal-card-title"><div><p>Activos</p><h3>Mi equipo asignado</h3></div></div><div class="personal-table-scroll"><table><thead><tr><th>Equipo</th><th>Marca/modelo</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
  } catch (error) {
    setHomeStat('assets-stat', '—', 'Activos no disponible', 'unavailable');
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

async function loadTicketsDashboard(profile, flash = '') {
  const container = document.querySelector('#tickets-dashboard');
  if (!container) return;
  try {
    const { data: tickets } = await api('/tickets-api/api/tickets-self/me');
    const openTickets = tickets.filter((ticket) => TICKET_OPEN_STATUSES.includes(ticket.status_code)).length;
    setHomeStat('requests-stat', String(openTickets), `${tickets.length} ${tickets.length === 1 ? 'ticket total' : 'tickets totales'}`, openTickets ? 'attention' : 'ok');
    container.className = 'personal-grid';
    if (!tickets.length) {
      container.innerHTML = `<article class="personal-card"><div class="personal-card-title"><div><p>Tickets</p><h3>Mis tickets</h3></div></div><p class="personal-empty">No tienes tickets creados ni asignados.</p></article>`;
      return;
    }
    const rows = tickets.map((ticket) => `<tr><td><button class="ticket-detail-trigger" type="button" data-ticket-detail="${escapeHtml(ticket.id)}" aria-label="Ver detalle de ${escapeHtml(ticket.folio)}"><strong>${escapeHtml(ticket.folio)}</strong><small>${escapeHtml(ticket.title)}</small></button></td><td><strong>${escapeHtml(ticket.business_area_name || 'Sin área')}</strong><small>${escapeHtml([ticket.category_name, ticket.subcategory_name].filter(Boolean).join(' · ') || 'Sin categoría')}</small></td><td>${escapeHtml(ticket.priority_name || ticket.priority_code || '—')}</td><td><span class="request-status ${TICKET_STATUS_CLASS[ticket.status_code] || 'pending'}">${escapeHtml(ticket.status_name || ticket.status_code)}</span></td><td>${escapeHtml(shortDate(ticket.updated_at))}</td></tr>`).join('');
    container.innerHTML = `<article class="personal-card requests-card"><div class="personal-card-title"><div><p>Tickets</p><h3>Mis tickets</h3></div></div>${flash ? `<div class="personal-flash">${escapeHtml(flash)}</div>` : ''}<div class="personal-table-scroll"><table><thead><tr><th>Ticket</th><th>Categoría</th><th>Prioridad</th><th>Estatus</th><th>Actualización</th></tr></thead><tbody>${rows}</tbody></table></div><p class="ticket-list-help">Selecciona un ticket para consultar su descripción sin salir de Core.</p></article><dialog class="ticket-detail-dialog" id="ticket-detail-dialog" aria-labelledby="ticket-detail-title"><div id="ticket-detail-content" class="ticket-detail-loading">Cargando ticket…</div></dialog>`;
    const dialog = document.querySelector('#ticket-detail-dialog');
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    document.querySelectorAll('[data-ticket-detail]').forEach((button) => button.addEventListener('click', () => openSelfTicketDetail(profile, button.dataset.ticketDetail)));
  } catch (error) {
    setHomeStat('requests-stat', '—', 'Tickets no disponibles', 'unavailable');
    container.className = 'notice error';
    container.textContent = error.message;
  }
}

function ticketDateTime(value) {
  return value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

async function openSelfTicketDetail(profile, ticketId) {
  const dialog = document.querySelector('#ticket-detail-dialog');
  const content = document.querySelector('#ticket-detail-content');
  content.className = 'ticket-detail-loading';
  content.textContent = 'Cargando ticket…';
  if (!dialog.open) dialog.showModal();
  try {
    const { data: ticket } = await api(`/tickets-api/api/tickets-self/me/${encodeURIComponent(ticketId)}`);
    const editMessage = ticket.editable
      ? `Puedes corregir el título y la descripción hasta ${ticketDateTime(ticket.editable_until)}.`
      : ticket.is_requester
        ? 'El plazo de 10 minutos terminó. Este ticket ahora es sólo de consulta.'
        : 'Sólo la persona que creó el ticket puede modificarlo durante los primeros 10 minutos.';
    const editableContent = ticket.editable
      ? `<form class="personal-form ticket-detail-form" id="ticket-detail-form"><label>Título<input name="title" maxlength="255" value="${escapeHtml(ticket.title)}" required></label><label>Descripción<textarea name="description" maxlength="10000" rows="7" placeholder="Sin descripción">${escapeHtml(ticket.description || '')}</textarea></label><div class="personal-form-message" id="ticket-detail-message" hidden></div><button class="personal-submit" type="submit">Guardar cambios</button></form>`
      : `<section class="ticket-description"><small>Descripción</small><p>${escapeHtml(ticket.description || 'Sin descripción capturada.')}</p></section>`;
    content.className = 'ticket-detail-content';
    content.innerHTML = `<header><div><small>Detalle del ticket</small><h2 id="ticket-detail-title">${escapeHtml(ticket.folio)}</h2></div><button type="button" data-close-ticket-detail aria-label="Cerrar detalle">×</button></header><div class="ticket-detail-body"><h3>${escapeHtml(ticket.title)}</h3><dl class="ticket-detail-meta"><div><dt>Estatus</dt><dd><span class="request-status ${TICKET_STATUS_CLASS[ticket.status_code] || 'pending'}">${escapeHtml(ticket.status_name || ticket.status_code)}</span></dd></div><div><dt>Área</dt><dd>${escapeHtml(ticket.business_area_name || 'Sin área')}</dd></div><div><dt>Categoría</dt><dd>${escapeHtml([ticket.category_name, ticket.subcategory_name].filter(Boolean).join(' · ') || 'Sin categoría')}</dd></div><div><dt>Prioridad</dt><dd>${escapeHtml(ticket.priority_name || ticket.priority_code || '—')}</dd></div><div><dt>Creado</dt><dd>${escapeHtml(ticketDateTime(ticket.created_at))}</dd></div><div><dt>Actualizado</dt><dd>${escapeHtml(ticketDateTime(ticket.updated_at))}</dd></div></dl><p class="ticket-edit-rule ${ticket.editable ? 'editable' : ''}">${escapeHtml(editMessage)}</p>${editableContent}</div>`;
    content.querySelector('[data-close-ticket-detail]').addEventListener('click', () => dialog.close());
    const form = content.querySelector('#ticket-detail-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const message = content.querySelector('#ticket-detail-message');
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      message.hidden = true;
      try {
        await api(`/tickets-api/api/tickets-self/me/${encodeURIComponent(ticketId)}`, { method: 'PATCH', body: JSON.stringify({ title: values.get('title'), description: values.get('description') }) });
        dialog.close();
        await loadTicketsDashboard(profile, `${ticket.folio} se actualizó correctamente.`);
      } catch (error) {
        message.textContent = error.message;
        message.hidden = false;
        button.disabled = false;
      }
    });
  } catch (error) {
    content.className = 'ticket-detail-error';
    content.innerHTML = `<p>${escapeHtml(error.message)}</p><button class="secondary-button" type="button" data-close-ticket-detail>Cerrar</button>`;
    content.querySelector('[data-close-ticket-detail]').addEventListener('click', () => dialog.close());
  }
}

async function bindTicketSelfService(profile) {
  const panel = document.querySelector('#ticket-create-panel');
  const form = document.querySelector('#ticket-self-form');
  const businessArea = document.querySelector('#ticket-business-area');
  const category = document.querySelector('#ticket-category');
  const subcategory = document.querySelector('#ticket-subcategory');
  const priority = document.querySelector('#ticket-priority');
  const message = document.querySelector('#ticket-form-message');
  document.querySelector('[data-core-action="new-ticket"]')?.addEventListener('click', () => {
    panel.open = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    form.elements.title.focus({ preventScroll: true });
  });
  try {
    const { data } = await api('/tickets-api/api/tickets-self/options');
    businessArea.innerHTML = `<option value="">Seleccionar área</option>${data.business_areas.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}`;
    const renderCategories = () => {
      const items = data.categories.filter((item) => String(item.business_area_id) === businessArea.value);
      category.disabled = !businessArea.value;
      category.innerHTML = `<option value="">Seleccionar categoría</option>${items.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}`;
      subcategory.disabled = true;
      subcategory.innerHTML = '<option value="">Selecciona primero la categoría</option>';
    };
    const renderSubcategories = () => {
      const items = data.subcategories.filter((item) => String(item.category_id) === category.value);
      subcategory.disabled = !items.length;
      subcategory.innerHTML = `<option value="">${items.length ? 'Seleccionar detalle' : 'Sin detalle adicional'}</option>${items.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}`;
    };
    businessArea.addEventListener('change', renderCategories);
    category.addEventListener('change', renderSubcategories);
    priority.innerHTML = data.priorities.map((item) => `<option value="${escapeHtml(item.code)}"${item.code === 'P3' ? ' selected' : ''}>${escapeHtml(item.code)} · ${escapeHtml(item.name)}</option>`).join('');
  } catch (error) {
    businessArea.innerHTML = '<option value="">No disponible</option>';
    category.innerHTML = '<option value="">No disponible</option>';
    message.hidden = false;
    message.textContent = `No fue posible cargar todas las opciones: ${error.message}`;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    button.disabled = true;
    message.hidden = true;
    try {
      const result = await api('/tickets-api/api/tickets-self', {
        method: 'POST',
        body: JSON.stringify({
          title: values.get('title'),
          description: values.get('description'),
          business_area_id: values.get('business_area_id'),
          category_id: values.get('category_id'),
          subcategory_id: values.get('subcategory_id') || null,
          priority_code: values.get('priority_code') || 'P3',
        }),
      });
      form.reset();
      panel.open = false;
      await loadTicketsDashboard(profile, `${result.data.folio} fue enviado correctamente.`);
      document.querySelector('#tickets-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      message.hidden = false;
      message.textContent = error.message;
    } finally { button.disabled = false; }
  });
}

// La API de Core normaliza estas novedades una sola vez para que esta misma
// campanilla pueda reutilizarse desde todos los módulos del portal.
async function loadNotifications(_profile) {
  const container = document.querySelector('#notifications-dashboard');
  if (!container) return;
  let items;
  try {
    ({ data: items } = await api('/api/portal/v1/notifications'));
  } catch {
    container.className = 'notification-panel-error';
    container.textContent = 'No fue posible consultar las notificaciones en este momento.';
    return;
  }

  container.className = '';
  const notificationCount = document.querySelector('#notification-count');
  const notificationButton = document.querySelector('#notifications-button');
  if (notificationCount) {
    notificationCount.textContent = items.length > 9 ? '9+' : String(items.length);
    notificationCount.hidden = items.length === 0;
  }
  notificationButton?.setAttribute('aria-label', items.length ? `Ver notificaciones: ${items.length} nuevas` : 'Ver notificaciones');
  if (!items.length) {
    container.innerHTML = '<p class="notification-empty">Sin novedades por ahora.</p>';
    return;
  }
  const MODULE_ICON = { 'mrti-legal': 'LG', rh: 'RH' };
  const rows = items.map((item) => `<li class="notification-item"><span class="personal-icon">${MODULE_ICON[item.module_code] || 'TK'}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.message)}</small></span>${item.href ? `<a class="personal-link" href="${item.href}">Abrir →</a>` : ''}</li>`).join('');
  container.innerHTML = `<ul class="notification-list">${rows}</ul>`;
}

async function resizeAvatar(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error('Selecciona una foto PNG, JPG o WebP de máximo 8 MB.');
  }
  const bitmap = await createImageBitmap(file);
  const size = Math.min(256, Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale; const height = bitmap.height * scale;
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close();
  for (const quality of [.82, .7, .58, .46]) {
    const value = canvas.toDataURL('image/jpeg', quality);
    if (value.length <= 60000) return value;
  }
  throw new Error('No fue posible optimizar la foto. Prueba con una imagen más sencilla.');
}

function renderAccount(profile, { required = false } = {}) {
  if (required) return renderRequiredPassword(profile);
  const checked = (value) => value ? 'checked' : '';
  app.innerHTML = shellMarkup(profile, `<section class="workspace-panel account-workspace">
    <button class="back-button" id="back-portal" type="button">← Volver a mi dashboard</button>
    <div class="account-heading"><div>${avatarMarkup(profile, 'large')}</div><div><p class="section-label">Mi configuración</p><h1>${escapeHtml(profile.full_name)}</h1><p class="panel-copy">Administra tu identidad, seguridad y la forma en que usas este espacio.</p></div></div>
    <div class="account-grid">
      <section class="account-card"><div><p class="section-label">Perfil</p><h2>Datos personales</h2></div>
        <form class="control-form" id="profile-form"><label>Nombre completo<input name="full_name" value="${escapeHtml(profile.full_name)}" minlength="2" required></label><label>Correo electrónico<input type="email" value="${escapeHtml(profile.email)}" readonly aria-readonly="true"><small class="field-help">Sólo un administrador puede cambiarlo desde el Centro de control.</small></label><div class="form-message" id="profile-message" hidden></div><button class="primary-button" type="submit">Guardar perfil</button></form>
      </section>
      <section class="account-card"><div><p class="section-label">Foto</p><h2>Imagen de perfil</h2></div><div class="avatar-editor"><div id="avatar-preview">${avatarMarkup(profile, 'preview')}</div><div><label class="avatar-file">Elegir foto<input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="secondary-button" id="remove-avatar" type="button" ${profile.avatar_url ? '' : 'disabled'}>Quitar foto</button><small>Se recorta y optimiza localmente antes de guardarse.</small></div></div><div class="form-message" id="avatar-message" hidden></div></section>
      <section class="account-card account-preferences"><div><p class="section-label">Mi espacio</p><h2>Apariencia y contenido</h2></div>
        <form class="control-form" id="preferences-form"><div class="preference-selects"><label>Tema<select name="theme"><option value="system" ${userPreferences.theme === 'system' ? 'selected' : ''}>Usar el del dispositivo</option><option value="light" ${userPreferences.theme === 'light' ? 'selected' : ''}>Claro</option><option value="dark" ${userPreferences.theme === 'dark' ? 'selected' : ''}>Oscuro</option></select></label><label>Densidad<select name="density"><option value="comfortable" ${userPreferences.density === 'comfortable' ? 'selected' : ''}>Cómoda</option><option value="compact" ${userPreferences.density === 'compact' ? 'selected' : ''}>Compacta</option></select></label></div><fieldset class="widget-options"><legend>Mostrar en mi dashboard</legend><label><input type="checkbox" name="show_rh" ${checked(userPreferences.show_rh)}> Recursos Humanos</label><label><input type="checkbox" name="show_assets" ${checked(userPreferences.show_assets)}> Activos</label><label><input type="checkbox" name="show_tickets" ${checked(userPreferences.show_tickets)}> Tickets</label></fieldset><div class="form-message" id="preferences-message" hidden></div><button class="primary-button" type="submit">Guardar preferencias</button></form>
      </section>
      <section class="account-card"><div><p class="section-label">Seguridad</p><h2>Cambiar contraseña</h2></div><form class="control-form" id="password-form"><label>Contraseña actual<input name="current_password" type="password" autocomplete="current-password" required></label><label>Nueva contraseña<input name="new_password" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></label><label>Confirmar nueva contraseña<input name="confirmation" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></label><div class="form-message" id="password-message" hidden></div><button class="primary-button" type="submit">Guardar nueva contraseña</button></form></section>
    </div>
  </section>`);
  bindShell(profile);
  document.querySelector('#back-portal').addEventListener('click', () => renderPortal(profile));

  const profileForm = document.querySelector('#profile-form');
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const message = document.querySelector('#profile-message'); const values = new FormData(profileForm); const button = profileForm.querySelector('button'); button.disabled = true;
    try { const { profile: updated } = await api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ full_name: values.get('full_name') }) }); localStorage.setItem('auth_profile', JSON.stringify(updated)); message.className = 'form-message success'; message.textContent = 'Perfil actualizado.'; message.hidden = false; setTimeout(() => renderAccount(updated), 500); }
    catch (error) { message.className = 'form-message error'; message.textContent = error.message; message.hidden = false; button.disabled = false; }
  });

  const saveAvatar = async (avatarDataUrl) => {
    const message = document.querySelector('#avatar-message'); message.className = 'form-message'; message.textContent = avatarDataUrl ? 'Optimizando y guardando foto…' : 'Quitando foto…'; message.hidden = false;
    try { const { profile: updated } = await api('/api/auth/profile/avatar', { method: 'PATCH', body: JSON.stringify({ avatar_data_url: avatarDataUrl }) }); localStorage.setItem('auth_profile', JSON.stringify(updated)); await refreshAvatar(updated); renderAccount(updated); }
    catch (error) { message.className = 'form-message error'; message.textContent = error.message; message.hidden = false; }
  };
  document.querySelector('#avatar-file').addEventListener('change', async (event) => { const [file] = event.target.files; if (!file) return; try { await saveAvatar(await resizeAvatar(file)); } catch (error) { const message = document.querySelector('#avatar-message'); message.className = 'form-message error'; message.textContent = error.message; message.hidden = false; } });
  document.querySelector('#remove-avatar').addEventListener('click', () => saveAvatar(null));

  const preferencesForm = document.querySelector('#preferences-form');
  preferencesForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const message = document.querySelector('#preferences-message'); const values = new FormData(preferencesForm); const payload = { theme: values.get('theme'), density: values.get('density'), show_notifications: userPreferences.show_notifications, show_rh: values.has('show_rh'), show_assets: values.has('show_assets'), show_tickets: values.has('show_tickets') };
    try { const { preferences } = await api('/api/auth/profile/preferences', { method: 'PATCH', body: JSON.stringify(payload) }); userPreferences = preferences; if (preferences.theme === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, preferences.theme); applyTheme(currentTheme()); document.documentElement.dataset.density = preferences.density; message.className = 'form-message success'; message.textContent = 'Tu espacio quedó actualizado.'; message.hidden = false; }
    catch (error) { message.className = 'form-message error'; message.textContent = error.message; message.hidden = false; }
  });
  bindPasswordForm(profile, false);
}

function bindPasswordForm(profile, required) {
  const form = document.querySelector('#password-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = new FormData(form); const message = document.querySelector('#password-message');
    if (data.get('new_password') !== data.get('confirmation')) { message.className = 'form-message error'; message.textContent = 'Las contraseñas nuevas no coinciden.'; message.hidden = false; return; }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try { await api('/api/auth/profile/password', { method: 'PATCH', body: JSON.stringify({ current_password: data.get('current_password'), new_password: data.get('new_password') }) }); form.reset(); message.className = 'form-message success'; message.textContent = 'Contraseña actualizada correctamente.'; message.hidden = false; if (required) { const { profile: updated } = await api('/api/auth/me'); updated.password_change_required = false; localStorage.setItem('auth_profile', JSON.stringify(updated)); await Promise.all([refreshApplications(), refreshPreferences(), refreshAvatar(updated)]); renderPortal(updated); } }
    catch (error) { message.className = 'form-message error'; message.textContent = error.message; message.hidden = false; }
    finally { button.disabled = false; }
  });
}

function renderRequiredPassword(profile) {
  app.innerHTML = shellMarkup(profile, `<section class="workspace-panel narrow-panel">
    <p class="section-label">Mi cuenta</p><h1>Crea tu contraseña personal</h1>
    <p class="panel-copy">Por seguridad, reemplaza la contraseña temporal antes de continuar.</p>
    <form class="control-form" id="password-form">
      <label>Contraseña actual<input name="current_password" type="password" autocomplete="current-password" required></label>
      <label>Nueva contraseña<input name="new_password" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></label>
      <label>Confirmar nueva contraseña<input name="confirmation" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></label>
      <div class="form-message" id="password-message" hidden></div>
      <button class="primary-button" type="submit">Guardar nueva contraseña</button>
    </form>
  </section>`);
  bindShell(profile);
  bindPasswordForm(profile, true);
}

let brandObjectUrls = [];

function clearBrandObjectUrls() {
  brandObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  brandObjectUrls = [];
}

function readableFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function imageMimeType(file) {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return ({ svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' })[extension] || '';
}

async function authenticatedImageUrl(path) {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token()}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `No fue posible cargar la imagen (${response.status})`);
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  brandObjectUrls.push(objectUrl);
  return objectUrl;
}

async function renderBrandAssets(profile, flash = '') {
  clearBrandObjectUrls();
  app.innerHTML = shellMarkup(profile, '<section class="workspace-panel"><p>Cargando recursos de marca…</p></section>');
  bindShell(profile);

  try {
    const [{ data }] = await Promise.all([
      api('/api/portal/v1/brand-assets'),
      refreshBrandAppearance(),
    ]);
    const assets = await Promise.all(data.map(async (asset) => ({
      ...asset,
      objectUrl: await authenticatedImageUrl(asset.content_url),
    })));
    const slotsByAsset = Object.entries(brandAppearance).reduce((index, [slot, appearance]) => {
      if (appearance.asset_id) (index[appearance.asset_id] ||= []).push(slot);
      return index;
    }, {});
    const slotLabels = { portal_logo: 'Logo del portal', login_background: 'Fondo del login' };
    const cards = assets.map((asset) => {
      const usages = slotsByAsset[asset.id] || [];
      return `<article class="asset-card">
      <div class="asset-preview"><img src="${asset.objectUrl}" alt="${escapeHtml(asset.name)}" loading="lazy"></div>
      <div class="asset-info">
        <p class="asset-name">${escapeHtml(asset.name)}<span class="asset-format">${escapeHtml(asset.format)}</span></p>
        ${usages.length ? `<div class="asset-usages">${usages.map((slot) => `<span>${escapeHtml(slotLabels[slot])}</span>`).join('')}</div>` : ''}
        <p class="asset-description">${escapeHtml(asset.description || 'Sin descripción.')}</p>
        <p class="asset-file-detail">${escapeHtml(asset.original_filename)} · ${readableFileSize(asset.file_size)}</p>
        <div class="asset-actions">
          <a class="asset-download" href="${asset.objectUrl}" download="${escapeHtml(asset.original_filename)}">Descargar</a>
          ${isAdministrator(profile) ? `<button class="asset-remove" type="button" data-brand-remove="${asset.id}" data-brand-name="${escapeHtml(asset.name)}" ${usages.length ? 'disabled title="Cambia primero el uso de esta imagen"' : ''}>${usages.length ? 'En uso' : 'Quitar'}</button>` : ''}
        </div>
      </div>
    </article>`;
    }).join('');

    const assetOptions = (selectedId) => `<option value="">Usar diseño predeterminado</option>${assets
      .map((asset) => `<option value="${asset.id}" ${asset.id === selectedId ? 'selected' : ''}>${escapeHtml(`${asset.name} · ${asset.format}`)}</option>`).join('')}`;

    const adminPanel = isAdministrator(profile) ? `<section class="brand-appearance-panel" aria-labelledby="brand-appearance-title">
      <div class="brand-admin-heading"><div><p class="section-label">Uso en el sitio</p><h2 id="brand-appearance-title">Imágenes activas</h2></div><span>Selecciona cualquier archivo del catálogo</span></div>
      <div class="brand-appearance-grid">
        <form class="brand-appearance-form" data-brand-appearance="portal_logo"><label><strong>Logo del portal</strong><small>Se muestra en el menú, encabezado móvil y acceso.</small><select name="asset_id">${assetOptions(brandAppearance.portal_logo.asset_id)}</select></label><button class="secondary-button" type="submit">Aplicar logo</button></form>
        <form class="brand-appearance-form" data-brand-appearance="login_background"><label><strong>Fondo del inicio de sesión</strong><small>Cubre el panel visual izquierdo; conviene usar una imagen horizontal.</small><select name="asset_id">${assetOptions(brandAppearance.login_background.asset_id)}</select></label><button class="secondary-button" type="submit">Aplicar fondo</button></form>
      </div>
    </section><section class="brand-admin-panel" aria-labelledby="brand-upload-title">
      <div class="brand-admin-heading"><div><p class="section-label">Administración</p><h2 id="brand-upload-title">Agregar un recurso</h2></div><span>SVG, PNG, JPG o WebP · máximo 10 MB</span></div>
      <form class="brand-upload-form" id="brand-upload-form">
        <label class="brand-dropzone" id="brand-dropzone" for="brand-file">
          <input id="brand-file" name="file" type="file" accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp">
          <strong>Arrastra aquí la imagen</strong><span>o haz clic para seleccionarla</span>
          <small id="brand-file-name">Ningún archivo seleccionado</small>
        </label>
        <div class="brand-upload-fields">
          <label>Nombre visible<input name="name" maxlength="120" placeholder="Ej. Logotipo blanco" required></label>
          <label>Descripción<textarea name="description" maxlength="500" rows="3" placeholder="Indica dónde y cómo debe utilizarse"></textarea></label>
          <div class="form-message" id="brand-upload-message" hidden></div>
          <button class="primary-button" type="submit">Guardar recurso</button>
        </div>
      </form>
    </section>` : '';

    app.innerHTML = shellMarkup(profile, `<section class="workspace-panel">
      <button class="back-button" id="back-portal" type="button">← Volver al portal</button>
      <p class="section-label">Identidad de marca</p><h1>Recursos de marca</h1>
      <p class="panel-copy">Logotipos e imágenes oficiales disponibles para documentos, presentaciones y materiales corporativos.</p>
      ${flash ? `<div class="form-message success brand-flash">${escapeHtml(flash)}</div>` : ''}
      ${adminPanel}
      <div class="asset-grid">${cards || '<p class="brand-empty">Aún no hay recursos de marca disponibles.</p>'}</div>
      ${isAdministrator(profile) ? '<p class="panel-note">Quitar un recurso lo oculta de inmediato, pero conserva su historial para recuperación y auditoría.</p>' : ''}
    </section>`, 'Recursos de marca');
    bindShell(profile);
    document.querySelector('#back-portal').addEventListener('click', () => { clearBrandObjectUrls(); renderPortal(profile); });

    document.querySelectorAll('[data-brand-appearance]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await api(`/api/portal/v1/admin/brand-appearance/${form.dataset.brandAppearance}`, {
          method: 'PUT',
          body: JSON.stringify({ asset_id: form.elements.asset_id.value || null }),
        });
        await refreshBrandAppearance();
        await renderBrandAssets(profile, 'La imagen del sitio se actualizó correctamente.');
      } catch (error) {
        window.alert(error.message);
        button.disabled = false;
      }
    }));

    document.querySelectorAll('[data-brand-remove]').forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm(`¿Quitar “${button.dataset.brandName}” de los recursos de marca?`)) return;
      button.disabled = true;
      try {
        await api(`/api/portal/v1/admin/brand-assets/${button.dataset.brandRemove}`, { method: 'DELETE' });
        await renderBrandAssets(profile, 'El recurso se quitó correctamente.');
      } catch (error) {
        window.alert(error.message);
        button.disabled = false;
      }
    }));

    const form = document.querySelector('#brand-upload-form');
    if (!form) return;
    const input = document.querySelector('#brand-file');
    const dropzone = document.querySelector('#brand-dropzone');
    const fileName = document.querySelector('#brand-file-name');
    const message = document.querySelector('#brand-upload-message');
    let selectedFile = null;

    function selectFile(file) {
      selectedFile = file || null;
      fileName.textContent = selectedFile ? `${selectedFile.name} · ${readableFileSize(selectedFile.size)}` : 'Ningún archivo seleccionado';
      if (selectedFile && !form.elements.name.value.trim()) {
        form.elements.name.value = selectedFile.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      }
    }
    input.addEventListener('change', () => selectFile(input.files[0]));
    ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (event) => {
      event.preventDefault(); dropzone.classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, (event) => {
      event.preventDefault(); dropzone.classList.remove('is-dragging');
    }));
    dropzone.addEventListener('drop', (event) => {
      const [file] = event.dataTransfer.files;
      if (file) selectFile(file);
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const mimeType = selectedFile && imageMimeType(selectedFile);
      if (!selectedFile) {
        message.className = 'form-message error'; message.textContent = 'Selecciona una imagen.'; message.hidden = false; return;
      }
      if (!['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'].includes(mimeType) || selectedFile.size > 10 * 1024 * 1024) {
        message.className = 'form-message error'; message.textContent = 'Usa una imagen SVG, PNG, JPG o WebP de máximo 10 MB.'; message.hidden = false; return;
      }
      const button = form.querySelector('button[type="submit"]');
      const params = new URLSearchParams({
        name: form.elements.name.value.trim(),
        description: form.elements.description.value.trim(),
        filename: selectedFile.name,
      });
      button.disabled = true;
      message.className = 'form-message'; message.textContent = 'Guardando en la base de datos…'; message.hidden = false;
      try {
        await api(`/api/portal/v1/admin/brand-assets?${params}`, { method: 'POST', headers: { 'Content-Type': mimeType }, body: selectedFile });
        await renderBrandAssets(profile, 'El nuevo recurso ya está disponible para todos los usuarios.');
      } catch (error) {
        message.className = 'form-message error'; message.textContent = error.message; message.hidden = false; button.disabled = false;
      }
    });
  } catch (error) {
    clearBrandObjectUrls();
    app.innerHTML = shellMarkup(profile, `<section class="workspace-panel narrow-panel"><button class="back-button" id="back-portal" type="button">← Volver al portal</button><p class="section-label">Identidad de marca</p><h1>No fue posible cargar los recursos</h1><p class="panel-copy">${escapeHtml(error.message)}</p><button class="primary-button" id="retry-brand-assets" type="button">Intentar de nuevo</button></section>`);
    bindShell(profile);
    document.querySelector('#back-portal').addEventListener('click', () => renderPortal(profile));
    document.querySelector('#retry-brand-assets').addEventListener('click', () => renderBrandAssets(profile));
  }
}

function moduleChecks(modules, selected = []) {
  return modules.map((module) => `<label class="check-option"><input type="checkbox" value="${module.code}" ${selected.includes(module.code) ? 'checked' : ''}>${escapeHtml(module.name)}</label>`).join('');
}

async function loadTicketTeamControlData() {
  try {
    const [{ data: areas }, { data: creationLimits }] = await Promise.all([
      api('/tickets-api/api/business-areas'),
      api('/tickets-api/api/ticket-user-creation-limits'),
    ]);
    const memberships = await Promise.all(areas.map(async (area) => {
      const { data: members } = await api(`/tickets-api/api/business-areas/${area.id}/members`);
      return [String(area.id), members];
    }));
    return { areas, membersByArea: Object.fromEntries(memberships), creationLimits, error: null };
  } catch (error) {
    return { areas: [], membersByArea: {}, creationLimits: [], error: error.message };
  }
}

async function renderControlCenter(profile, flash = '', initialPanel = 'users') {
  if (!isAdministrator(profile)) return renderPortal(profile);
  app.innerHTML = shellMarkup(profile, '<section class="workspace-panel"><p>Cargando centro de control…</p></section>');
  bindShell(profile);
  try {
    const [data, applicationData, auditData, ticketTeamData] = await Promise.all([
      api('/api/auth/access-control'),
      api('/api/portal/v1/admin/applications'),
      api('/api/portal/v1/admin/audit?limit=200'),
      loadTicketTeamControlData(),
    ]);
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
      return `<form class="own-user own-location-editor" data-user-id="${user.id}"><p>Como administrador puedes corregir aquí el nombre y el correo de acceso. La contraseña se cambia desde “Mi cuenta”.</p><div class="user-fields">
        <label>Nombre<input name="full_name" value="${escapeHtml(user.full_name)}" required></label>
        <label>Correo<input name="email" type="email" value="${escapeHtml(user.email)}" required></label>
        <label>Ubicación física<select class="physical-area-select" name="physical_area_id">${physicalAreaOptions(user.physical_area_id || '')}</select></label>
        <label>Equipo habitual<select class="primary-device-select" name="primary_device_id">${deviceOptions(data.devices.find((device) => device.assigned_user_id === user.id && device.is_primary_user_device)?.id || '', user.id)}</select></label>
      </div><button class="secondary-button" type="submit">Guardar usuario</button></form>`;
    }
    function otherUserFormMarkup(user) {
      const identifier = userIdentifier(user.user_number);
      return `<form class="user-editor" data-user-id="${user.id}">
        <div class="user-detail-heading"><strong>Datos de ${identifier}</strong><small>ID interno: ${escapeHtml(user.id)}</small></div>
        <div class="user-fields"><label>Nombre<input name="full_name" value="${escapeHtml(user.full_name)}" required></label><label>Correo<input name="email" type="email" value="${escapeHtml(user.email)}" required></label>
          <label>Rol<select name="role">${roleOptions(user.role)}</select></label><label>Área de acceso<select name="access_area_id">${areaOptions(user.access_area_id || '')}</select></label>
          <label>Ubicación física<select class="physical-area-select" name="physical_area_id">${physicalAreaOptions(user.physical_area_id || '')}</select></label><label>Equipo habitual<select class="primary-device-select" name="primary_device_id">${deviceOptions(data.devices.find((device) => device.assigned_user_id === user.id && device.is_primary_user_device)?.id || '', user.id)}</select></label>
          <label>Nueva contraseña <small>(opcional)</small><input name="password" type="password" minlength="6" maxlength="128" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>
          <label>Confirmar contraseña<input name="confirmation" type="password" minlength="6" maxlength="128" autocomplete="new-password"></label></div>
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
      const accessMeta = isSelf ? 'Acceso total' : escapeHtml(user.access_area_name || 'Sólo Core');
      return `<details class="user-list-item" data-user-id="${user.id}" data-user-search="${escapeHtml(searchValue)}" data-user-status="${status}"><summary>
        <span class="user-number">${identifier}</span><span class="user-summary-name"><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.email)}</small></span>
        <span class="user-summary-meta">${escapeHtml(roleName(user.role))}</span><span class="user-summary-meta">${accessMeta}</span>
        <span class="status-badge ${status}">${status === 'active' ? 'Activo' : 'Inactivo'}</span><span class="summary-chevron">⌄</span>
      </summary><div class="details-body"></div></details>`;
    }).join('');
    const activeTicketCandidates = data.users.filter((user) => user.is_active);
    const ticketLimitsByUser = new Map(ticketTeamData.creationLimits.map((limit) => [limit.user_id, limit]));
    const ticketLimitRows = activeTicketCandidates.map((user) => {
      const limit = ticketLimitsByUser.get(user.id) || {};
      const summary = limit.creation_blocked ? 'Creación bloqueada' : [limit.hourly_limit && `${limit.hourly_limit}/hora`, limit.daily_limit && `${limit.daily_limit}/24 h`].filter(Boolean).join(' · ') || 'Sin límites';
      return `<form class="ticket-limit-row" data-ticket-limit-user="${escapeHtml(user.id)}"><div class="ticket-limit-person"><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.email)}</small><span class="status-badge ${limit.creation_blocked ? 'inactive' : 'active'}">${escapeHtml(summary)}</span></div><label>Por hora<input name="hourly_limit" type="number" min="1" max="100" value="${limit.hourly_limit || ''}" placeholder="Sin límite"></label><label>Por 24 horas<input name="daily_limit" type="number" min="1" max="1000" value="${limit.daily_limit || ''}" placeholder="Sin límite"></label><label class="ticket-limit-block"><input name="creation_blocked" type="checkbox" ${limit.creation_blocked ? 'checked' : ''}> Impedir que cree tickets</label><div class="ticket-limit-actions"><button class="primary-button" type="submit">Guardar</button><button class="secondary-button" type="button" data-ticket-limit-reset="${escapeHtml(user.id)}">Restablecer</button></div></form>`;
    }).join('');
    const ticketTeamCards = ticketTeamData.areas.map((area) => {
      const members = ticketTeamData.membersByArea[String(area.id)] || [];
      const memberIds = new Set(members.map((member) => member.user_id));
      const available = activeTicketCandidates.filter((user) => !memberIds.has(user.id));
      const options = available.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.full_name)} · ${escapeHtml(roleName(user.role))}</option>`).join('');
      const memberRows = members.map((member) => `<li><span><strong>${escapeHtml(member.user_name || member.user_id)}</strong><small>Recibe novedades y puede atender tickets de esta área.</small></span><button class="secondary-button" type="button" data-ticket-team-remove="${escapeHtml(member.user_id)}" data-ticket-area-id="${area.id}">Quitar</button></li>`).join('');
      return `<article class="ticket-team-card"><div class="area-heading"><div><strong>${escapeHtml(area.name)}</strong><small>${members.length} ${members.length === 1 ? 'integrante' : 'integrantes'}</small></div></div><form class="ticket-team-add" data-ticket-area-id="${area.id}"><select name="user_id" required><option value="">Seleccionar usuario activo</option>${options}</select><button class="primary-button" type="submit" ${available.length ? '' : 'disabled'}>${available.length ? 'Agregar' : 'Sin candidatos'}</button></form><ul>${memberRows || '<li class="ticket-team-empty">Este equipo todavía no tiene integrantes.</li>'}</ul></article>`;
    }).join('');
    const applicationStatusOptions = (selected = 'active') => [
      ['active', 'Activa'], ['maintenance', 'Mantenimiento'], ['inactive', 'Inactiva'],
    ].map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
    const applicationCards = applicationData.data.map((application) => `<form class="application-admin-card" data-application-id="${application.id}">
      <div class="area-heading"><strong>${escapeHtml(application.name)}</strong><span class="status-badge ${application.status === 'active' ? 'active' : 'inactive'}">${escapeHtml(application.status)}</span></div>
      <div class="application-admin-fields"><label>Código<input name="code" value="${escapeHtml(application.code)}" readonly></label><label>Nombre<input name="name" value="${escapeHtml(application.name)}" required></label><label>Ruta interna<input name="url" value="${escapeHtml(application.url)}" required></label><label>Categoría<input name="category" value="${escapeHtml(application.category)}" required></label><label>Estado<select name="status">${applicationStatusOptions(application.status)}</select></label><label>Orden<input name="sort_order" type="number" min="0" max="10000" value="${application.sort_order}" required></label><label class="application-wide">Descripción<textarea name="description" rows="2" required>${escapeHtml(application.description)}</textarea></label><label class="application-wide">Funciones <small>(separadas por coma)</small><input name="features" value="${escapeHtml(application.features.join(', '))}"></label></div>
      <button class="secondary-button" type="submit">Guardar aplicación</button></form>`).join('');
    const auditModules = [...new Set(auditData.data.map((event) => event.module_code || 'core'))].sort();
    const auditSourceFailures = (auditData.sources || []).filter((source) => !source.ok);
    const auditDetails = (event) => {
      const parse = (value) => {
        if (!value) return null;
        if (typeof value === 'object') return value;
        try { return JSON.parse(value); } catch { return value; }
      };
      const before = parse(event.before_json);
      const after = parse(event.after_json);
      const metadata = parse(event.metadata_json);
      if (!before && !after && !metadata) return '<span class="audit-no-detail">Sin detalle adicional</span>';
      return `<details class="audit-change"><summary>Ver cambio</summary>${before ? `<div><strong>Antes</strong><pre>${escapeHtml(JSON.stringify(before, null, 2))}</pre></div>` : ''}${after ? `<div><strong>Después</strong><pre>${escapeHtml(JSON.stringify(after, null, 2))}</pre></div>` : ''}${metadata ? `<div><strong>Contexto</strong><pre>${escapeHtml(JSON.stringify(metadata, null, 2))}</pre></div>` : ''}</details>`;
    };
    const auditRows = auditData.data.map((event) => {
      const actor = event.actor_name || event.actor_email || 'Sistema';
      const search = `${actor} ${event.action} ${event.entity_type} ${event.entity_id || ''} ${event.module_code || 'core'}`.toLocaleLowerCase('es-MX');
      return `<tr class="audit-row" data-audit-module="${escapeHtml(event.module_code || 'core')}" data-audit-search="${escapeHtml(search)}"><td>${escapeHtml(shortDate(event.created_at))}<small>${escapeHtml(new Date(event.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }))}</small></td><td><span class="audit-module">${escapeHtml(event.module_code || 'core')}</span></td><td><strong>${escapeHtml(actor)}</strong>${event.actor_email && event.actor_name ? `<small>${escapeHtml(event.actor_email)}</small>` : ''}</td><td>${escapeHtml(event.action)}</td><td>${escapeHtml(event.entity_type)}${event.entity_id ? `<small>${escapeHtml(event.entity_id)}</small>` : ''}</td><td>${auditDetails(event)}</td></tr>`;
    }).join('');
    app.innerHTML = shellMarkup(profile, `<section class="workspace-panel control-center">
      <button class="back-button" id="back-portal" type="button">← Volver al portal</button><p class="section-label">Administración</p><h1>Centro de control</h1>
      <p class="panel-copy">Administra usuarios, áreas y permisos desde un solo lugar. Sólo los administradores pueden crear cuentas y conservan acceso total.</p>
      ${flash ? `<div class="notice success">${escapeHtml(flash)}</div>` : ''}
      ${data.physical_areas.length ? '' : '<div class="notice">Aún no hay ubicaciones físicas. Créalas en <a href="/mrti-obs/sites"><strong>MRTI Monitor → Sitios</strong></a> y asigna un área a cada activo.</div>'}
      <nav class="control-tabs" aria-label="Secciones del Centro de control"><button class="control-tab active" type="button" data-control-target="users">Usuarios <span>${data.users.length}</span></button><button class="control-tab" type="button" data-control-target="access">Áreas y módulos <span>${data.areas.length}</span></button><button class="control-tab" type="button" data-control-target="ticket-teams">Equipos de Tickets <span>${ticketTeamData.areas.length}</span></button><button class="control-tab" type="button" data-control-target="applications">Aplicaciones <span>${applicationData.data.length}</span></button><button class="control-tab" type="button" data-control-target="audit">Historial <span>${auditData.data.length}</span></button></nav>
      <div class="control-panel" data-control-panel="users"><div class="control-section control-section-first"><div class="users-heading"><div><h2>Usuarios</h2><span id="users-visible-count">${data.users.length} registros</span></div><div class="user-filters"><input id="user-search" type="search" placeholder="Buscar por número, nombre o correo…"><select id="user-status-filter"><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></div></div><div class="provisioning-bar"><div><strong>Crear cuentas desde RH</strong><p>Altas únicas con correo @mrtcorporativo.mx, rol Consulta y acceso exclusivo a Core.</p></div><button class="secondary-button" id="provision-rh-users" type="button">Aprovisionar desde RH</button></div><details class="control-create"><summary>Crear un usuario manualmente</summary><form class="create-user-form" id="create-user">
        <label>Nombre completo<input name="full_name" required></label><label>Correo electrónico<input name="email" type="email" required></label>
        <label>Contraseña temporal<input name="password" type="password" minlength="6" maxlength="128" required></label><label>Confirmar contraseña<input name="confirmation" type="password" minlength="6" maxlength="128" required></label>
        <label>Rol<select name="role">${roleOptions()}</select></label><label>Área de acceso<select name="access_area_id">${areaOptions()}</select></label>
        <label>Ubicación física<select class="physical-area-select" name="physical_area_id">${physicalAreaOptions()}</select></label><label>Equipo habitual<select class="primary-device-select" name="primary_device_id">${deviceOptions()}</select></label>
        <label class="active-toggle"><input name="is_active" type="checkbox" checked> Crear cuenta activa</label><button class="primary-button" type="submit">Crear usuario</button>
      </form><p class="field-help">El usuario deberá cambiar su contraseña temporal al iniciar sesión.</p></details><div class="users-list">${userItems}</div><p class="empty-users" id="empty-users" hidden>No se encontraron usuarios.</p></div></div>
      <div class="control-panel" data-control-panel="access" hidden><div class="control-section control-section-first"><details class="control-create"><summary>Crear una nueva área</summary><form class="create-area-form" id="create-area"><input name="name" placeholder="Nombre del área" required><input name="description" placeholder="Descripción"><div class="module-options">${moduleChecks(data.modules)}</div><button class="primary-button" type="submit">Crear área</button></form></details><div class="users-heading"><div><h2>Áreas y módulos</h2><span>${data.areas.length} configuradas</span></div></div><div class="areas-grid">${areaCards || '<p>No hay áreas creadas.</p>'}</div></div></div>
      <div class="control-panel" data-control-panel="ticket-teams" hidden><div class="control-section control-section-first"><div class="users-heading"><div><h2>Equipos de atención de Tickets</h2><span>${activeTicketCandidates.length} usuarios activos disponibles</span></div></div><p class="field-help">Agrega integrantes a cada área. Recibirán en Mi espacio las novedades de tickets nuevos y sin responsable que lleguen a su equipo.</p>${ticketTeamData.error ? `<div class="notice error">No fue posible consultar MRTI Tickets: ${escapeHtml(ticketTeamData.error)}</div>` : `<div class="ticket-team-grid">${ticketTeamCards || '<p>No hay áreas de Tickets activas.</p>'}</div><section class="ticket-limits-section"><div class="users-heading"><div><h2>Límites de creación por usuario</h2><span>Control contra uso indebido</span></div></div><p class="field-help">Deja un campo vacío para no limitarlo. “Por 24 horas” usa una ventana móvil desde el momento de cada intento. El bloqueo impide crear tanto desde Mi espacio como desde la API de Tickets.</p><div class="ticket-limit-list">${ticketLimitRows || '<p>No hay usuarios activos.</p>'}</div></section>`}</div></div>
      <div class="control-panel" data-control-panel="applications" hidden><div class="control-section control-section-first"><div class="users-heading"><div><h2>Catálogo de aplicaciones</h2><span>${applicationData.data.length} registradas</span></div></div><p class="field-help">Las aplicaciones activas se muestran dinámicamente según los permisos del área. Una aplicación nueva queda disponible primero sólo para administradores.</p>
        <form class="create-application-form" id="create-application"><label>Código<input name="code" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="ej. documentos" required></label><label>Nombre<input name="name" placeholder="MRTI Documentos" required></label><label>Ruta interna<input name="url" placeholder="/documentos/" required></label><label>Categoría<input name="category" value="Empresa" required></label><label>Orden<input name="sort_order" type="number" min="0" max="10000" value="100" required></label><label class="application-wide">Descripción<input name="description" minlength="5" required></label><label class="application-wide">Funciones <small>(separadas por coma)</small><input name="features" placeholder="Consulta, Búsqueda, Gestión"></label><button class="primary-button" type="submit">Registrar aplicación</button></form>
        <div class="application-admin-grid">${applicationCards}</div></div></div>
      <div class="control-panel" data-control-panel="audit" hidden><div class="control-section control-section-first"><div class="users-heading"><div><h2>Historial de actividad de la plataforma</h2><span id="audit-visible-count">${auditData.data.length} eventos</span></div><div class="audit-filters"><input id="audit-search" type="search" placeholder="Usuario, acción o registro…"><select id="audit-module-filter"><option value="all">Todos los módulos</option>${auditModules.map((moduleCode) => `<option value="${escapeHtml(moduleCode)}">${escapeHtml(moduleCode)}</option>`).join('')}</select></div></div>${auditSourceFailures.length ? `<div class="notice">Historial parcial: no respondieron ${auditSourceFailures.map((source) => escapeHtml(source.source)).join(', ')}.</div>` : ''}<p class="field-help">Los datos sensibles se redactan automáticamente. Cada módulo conserva su historial y Core reúne aquí una vista de consulta.</p><div class="personal-table-scroll"><table><thead><tr><th>Fecha</th><th>Módulo</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Cambios</th></tr></thead><tbody id="audit-table-body">${auditRows || '<tr><td colspan="6" class="personal-empty">Aún no hay eventos registrados.</td></tr>'}</tbody></table></div><p class="personal-empty" id="audit-empty" hidden>No hay eventos que coincidan con los filtros.</p></div></div>
    </section>`, 'Centro de control');
    bindShell(profile);
    document.querySelector('#back-portal').addEventListener('click', () => renderPortal(profile));
    document.querySelectorAll('.control-tab').forEach((tab) => tab.addEventListener('click', () => {
      document.querySelectorAll('.control-tab').forEach((item) => item.classList.toggle('active', item === tab));
      document.querySelectorAll('[data-control-panel]').forEach((panel) => { panel.hidden = panel.dataset.controlPanel !== tab.dataset.controlTarget; });
    }));
    document.querySelector(`[data-control-target="${initialPanel}"]`)?.click();
    document.querySelectorAll('.ticket-team-add').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const userId = String(new FormData(form).get('user_id') || '');
      const user = activeTicketCandidates.find((candidate) => candidate.id === userId);
      if (!user) return;
      const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      try {
        await api(`/tickets-api/api/business-areas/${form.dataset.ticketAreaId}/members`, { method: 'POST', body: JSON.stringify({ user_id: user.id, user_name: user.full_name }) });
        await renderControlCenter(profile, `${user.full_name} fue agregado al equipo.`, 'ticket-teams');
      } catch (error) { window.alert(error.message); button.disabled = false; }
    }));
    document.querySelectorAll('[data-ticket-team-remove]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/tickets-api/api/business-areas/${button.dataset.ticketAreaId}/members/${encodeURIComponent(button.dataset.ticketTeamRemove)}`, { method: 'DELETE' });
        await renderControlCenter(profile, 'El integrante fue retirado del equipo.', 'ticket-teams');
      } catch (error) { window.alert(error.message); button.disabled = false; }
    }));
    document.querySelectorAll('.ticket-limit-row').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(form); const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      try {
        await api(`/tickets-api/api/ticket-user-creation-limits/${encodeURIComponent(form.dataset.ticketLimitUser)}`, { method: 'PUT', body: JSON.stringify({ hourly_limit: values.get('hourly_limit') || null, daily_limit: values.get('daily_limit') || null, creation_blocked: values.get('creation_blocked') === 'on' }) });
        await renderControlCenter(profile, 'Límite de creación actualizado.', 'ticket-teams');
      } catch (error) { window.alert(error.message); button.disabled = false; }
    }));
    document.querySelectorAll('[data-ticket-limit-reset]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/tickets-api/api/ticket-user-creation-limits/${encodeURIComponent(button.dataset.ticketLimitReset)}`, { method: 'DELETE' });
        await renderControlCenter(profile, 'El usuario quedó sin límites de creación.', 'ticket-teams');
      } catch (error) { window.alert(error.message); button.disabled = false; }
    }));
    document.querySelector('#provision-rh-users').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (!window.confirm('Se crearán cuentas lectoras sin módulos para los correos corporativos únicos y activos de RH. ¿Continuar?')) return;
      button.disabled = true; button.textContent = 'Aprovisionando…';
      try {
        const result = await api('/api/auth/users/provision-rh', { method: 'POST' });
        if (result.created.length) {
          const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
          const csv = ['Nombre,Correo,Contraseña temporal', ...result.created.map((item) => [item.full_name, item.email, item.temporary_password].map(quote).join(','))].join('\r\n');
          const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
          const anchor = document.createElement('a'); anchor.href = url; anchor.download = `usuarios-core-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
        }
        const ambiguousCount = result.ambiguous.reduce((total, item) => total + Number(item.active_records || 0), 0);
        await renderControlCenter(profile, `${result.created.length} cuentas creadas, ${result.linked} expedientes vinculados.${ambiguousCount ? ` ${ambiguousCount} expedientes quedaron fuera por correo duplicado.` : ''}`);
      } catch (error) { window.alert(error.message); button.disabled = false; button.textContent = 'Aprovisionar desde RH'; }
    });
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
    const filterAudit = () => {
      const term = document.querySelector('#audit-search').value.trim().toLocaleLowerCase('es-MX');
      const moduleCode = document.querySelector('#audit-module-filter').value;
      let visible = 0;
      document.querySelectorAll('.audit-row').forEach((row) => {
        const matches = (!term || row.dataset.auditSearch.includes(term))
          && (moduleCode === 'all' || row.dataset.auditModule === moduleCode);
        row.hidden = !matches;
        if (matches) visible += 1;
      });
      document.querySelector('#audit-visible-count').textContent = `${visible} ${visible === 1 ? 'evento' : 'eventos'}`;
      document.querySelector('#audit-empty').hidden = visible !== 0;
    };
    document.querySelector('#audit-search').addEventListener('input', filterAudit);
    document.querySelector('#audit-module-filter').addEventListener('change', filterAudit);
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
        const result = await api(`/api/auth/users/${form.dataset.userId}`, { method: 'PATCH', body: JSON.stringify({ full_name: values.get('full_name'), email: values.get('email') }) });
        await api(`/api/auth/users/${form.dataset.userId}/location`, { method: 'PATCH', body: JSON.stringify({ physical_area_id: values.get('physical_area_id') || null, primary_device_id: values.get('primary_device_id') || null }) });
        localStorage.setItem('auth_profile', JSON.stringify(result.profile));
        await renderControlCenter(result.profile, 'Usuario actualizado correctamente.');
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
    const applicationPayload = (form) => {
      const values = new FormData(form);
      return { code: values.get('code'), name: values.get('name'), description: values.get('description'), url: values.get('url'), category: values.get('category'), status: values.get('status') || 'active', sort_order: Number(values.get('sort_order')), features: String(values.get('features') || '').split(',').map((item) => item.trim()).filter(Boolean) };
    };
    document.querySelector('#create-application').addEventListener('submit', async (event) => {
      event.preventDefault(); const form = event.currentTarget;
      try { await api('/api/portal/v1/admin/applications', { method: 'POST', body: JSON.stringify(applicationPayload(form)) }); await refreshApplications(); await renderControlCenter(profile, 'Aplicación registrada correctamente. Ya puedes asignarla a un área.'); }
      catch (error) { window.alert(error.message); }
    });
    document.querySelectorAll('.application-admin-card').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { const payload = applicationPayload(form); delete payload.code; await api(`/api/portal/v1/admin/applications/${form.dataset.applicationId}`, { method: 'PATCH', body: JSON.stringify(payload) }); await refreshApplications(); await renderControlCenter(profile, 'Aplicación actualizada correctamente.'); }
      catch (error) { window.alert(error.message); }
    }));
  } catch (error) {
    app.innerHTML = shellMarkup(profile, `<section class="workspace-panel"><div class="notice error">${escapeHtml(error.message)}</div><button class="back-button" id="back-portal">← Volver al portal</button></section>`);
    bindShell(profile); document.querySelector('#back-portal').addEventListener('click', () => renderPortal(profile));
  }
}

function loginMarkup() {
  const logoUrl = brandAppearance.portal_logo.content_url || '/company-logo.svg';
  const backgroundUrl = brandAppearance.login_background.content_url;
  return `<main class="core-login"><section class="login-shell" aria-label="Acceso a MRTI">
    <aside class="login-story${backgroundUrl ? ' has-custom-background' : ''}" ${backgroundUrl ? `style="--login-background-image: url('${escapeHtml(backgroundUrl)}')"` : ''}><div class="login-company"><img src="${escapeHtml(logoUrl)}" alt="Emblema de Minera Río Tinto"><div><span>Minera Río Tinto</span><strong>MRTI</strong></div></div>
      <div class="login-story-copy"><p class="login-eyebrow">Portal empresarial</p><h1>Tu entrada digital a la empresa.</h1><p>Solicita, consulta e infórmate desde un solo lugar, con acceso personalizado según tu función.</p></div>
      <div class="login-story-footer"><span>${escapeHtml(longDate())}</span><small>Acceso interno protegido</small></div></aside>
    <section class="login-panel"><div class="login-mobile-brand"><img src="${escapeHtml(logoUrl)}" alt=""><span><strong>MRTI</strong><small>Minera Río Tinto</small></span></div>
      <p class="login-eyebrow">Bienvenido</p><h2>Inicia sesión</h2><p class="login-copy">Usa tu cuenta corporativa para continuar al MRTI Home.</p>
      <form id="login-form" class="login-form"><label>Correo o usuario<input name="email" type="email" inputmode="email" autocomplete="username" spellcheck="false" placeholder="nombre@empresa.com" required></label>
        <label>Contraseña<div class="password-field"><input name="password" id="login-password" type="password" autocomplete="current-password" required><button id="toggle-password" type="button" aria-label="Mostrar contraseña" aria-pressed="false">Mostrar</button></div></label>
        <div class="login-assistance" id="login-assistance" hidden>La recuperación todavía es administrada por Sistemas. Solicita el restablecimiento con el responsable de MRTI.</div>
        <div class="login-error" id="login-error" role="alert" hidden></div><button class="login-button" type="submit">Iniciar sesión</button></form>
      <div class="login-links"><button id="forgot-password" type="button">¿Olvidaste tu contraseña?</button><span>Las cuentas son creadas por un administrador.</span></div>
    </section></section></main>`;
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
  const passwordInput = document.querySelector('#login-password');
  const togglePassword = document.querySelector('#toggle-password');
  const assistance = document.querySelector('#login-assistance');
  if (message) { errorElement.textContent = message; errorElement.hidden = false; }
  togglePassword.addEventListener('click', () => {
    const visible = passwordInput.type === 'text';
    passwordInput.type = visible ? 'password' : 'text';
    togglePassword.textContent = visible ? 'Mostrar' : 'Ocultar';
    togglePassword.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    togglePassword.setAttribute('aria-pressed', String(!visible));
  });
  document.querySelector('#forgot-password').addEventListener('click', () => { assistance.hidden = !assistance.hidden; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('.login-button'); const data = new FormData(form); button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Validando acceso…'; errorElement.hidden = true;
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      const body = await response.json(); if (!response.ok || !body.token) throw new Error(body.error || 'No se pudo iniciar sesión');
      localStorage.setItem('auth_token', body.token); localStorage.setItem('auth_profile', JSON.stringify(body.profile || {}));
      await Promise.all([refreshApplications(), refreshPreferences(), refreshAvatar(body.profile)]);
      if (body.profile.password_change_required) return renderAccount(body.profile, { required: true });
      const destination = requestedDestination(); if (destination && destination !== '/') window.location.replace(destination); else renderPortal(body.profile);
    } catch (error) { errorElement.textContent = error.message || 'No se pudo iniciar sesión'; errorElement.hidden = false; button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = 'Iniciar sesión'; }
  });
}

async function initialize() {
  await refreshBrandAppearance();
  if (!token()) return renderLogin();
  try {
    const [{ profile }, passwordStatus] = await Promise.all([
      api('/api/auth/me'),
      api('/api/auth/password-status'),
    ]);
    profile.password_change_required = Boolean(passwordStatus.required);
    localStorage.setItem('auth_profile', JSON.stringify(profile || {}));
    await Promise.all([refreshApplications(), refreshPreferences(), refreshAvatar(profile)]);
    if (profile.password_change_required) return renderAccount(profile, { required: true });
    const destination = requestedDestination();
    if (destination && destination !== '/') {
      const destinationModule = portalApplications.find((module) => destination.startsWith(module.href));
      if (!destinationModule || canOpen(profile, destinationModule.code)) return window.location.replace(destination);
    }
    renderPortal(profile);
  } catch { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_profile'); renderLogin('Tu sesión expiró. Inicia sesión nuevamente.'); }
}

void initialize();
