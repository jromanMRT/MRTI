const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
let activeController = null;
let dashboardObserver = null;
let widgetData = new Map();
let notificationCount = 0;

const widgetIds = ['employee-dashboard', 'assets-dashboard', 'tickets-dashboard', 'requisitions-dashboard'];
const widgetKeys = ['rh', 'assets', 'tickets', 'requisitions'];
const widgetLabels = new Map(widgetIds.map((id, index) => [id, widgetKeys[index]]));

function relativeTime(value) {
  if (!value) return 'Fecha no disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  const format = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
}

function emitActivity(profile, items) {
  const container = document.querySelector('#recent-activity-list');
  if (!container) return;
  const actions = [];
  const tickets = widgetData.get('tickets') || [];
  const requisitions = widgetData.get('requisitions') || [];
  const assets = widgetData.get('assets') || [];
  for (const ticket of tickets) {
    actions.push({
      type: 'ticket',
      timestamp: ticket.updated_at || ticket.created_at,
      title: `${String(ticket.requester_id || '') === String(profile.id || profile.user_id || '') ? 'Creaste' : 'Actualización de'} ticket ${ticket.folio || ''}`.trim(),
      detail: ticket.title || ticket.status_name || 'Solicitud de servicio',
    });
  }
  for (const item of requisitions) {
    actions.push({
      type: 'requisition',
      timestamp: item.submitted_at || item.created_at || item.updated_at,
      title: `Requisición ${item.folio || ''} enviada`.trim(),
      detail: item.position_name || 'Requisición de personal',
    });
  }
  for (const asset of assets) {
    actions.push({
      type: 'asset',
      timestamp: asset.assigned_at || asset.fecha_asignacion || null,
      title: 'Activo asignado',
      detail: [asset.cod_activo_fijo, asset.descripcion || asset.tipo].filter(Boolean).join(' · ') || 'Equipo bajo tu resguardo',
    });
  }
  for (const approval of items?.approvals || []) {
    actions.push({
      type: 'approval',
      timestamp: approval.created_at || approval.updated_at,
      title: `Autorización ${approval.folio || ''} pendiente`.trim(),
      detail: approval.position_name || 'Requisición de personal',
    });
  }

  actions.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const iconFor = (type) => {
    if (type === 'ticket') return `${ICON}<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>`;
    if (type === 'asset') return `${ICON}<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h5"/></svg>`;
    if (type === 'approval') return `${ICON}<path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>`;
    return `${ICON}<path d="M12 3v18M5 8h14M5 16h14"/></svg>`;
  };
  if (!actions.length) {
    container.innerHTML = `<p class="activity-empty">Tus gestiones recientes aparecerán aquí.</p>`;
    return;
  }
  container.replaceChildren(...actions.slice(0, 8).map((action) => {
    const item = document.createElement('li');
    item.className = `activity-item activity-${action.type}`;
    const icon = document.createElement('span');
    icon.className = 'activity-icon';
    icon.innerHTML = iconFor(action.type);
    const copy = document.createElement('span');
    copy.className = 'activity-copy';
    const title = document.createElement('strong');
    title.textContent = action.title;
    const detail = document.createElement('small');
    detail.textContent = action.detail;
    copy.append(title, detail);
    const time = document.createElement('time');
    time.textContent = relativeTime(action.timestamp);
    item.append(icon, copy, time);
    return item;
  }));
}

function updateWelcome(profile) {
  const message = document.querySelector('#home-contextual-message');
  if (!message) return;
  const tickets = widgetData.get('tickets') || [];
  const openTickets = tickets.filter((ticket) => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status_code)).length;
  const approvals = widgetData.get('approvals') || [];
  const segments = [];
  if (openTickets) segments.push(`Tienes ${openTickets} ${openTickets === 1 ? 'ticket abierto esperando' : 'tickets abiertos esperando'}.`);
  if (approvals.length) segments.push(`Hay ${approvals.length} ${approvals.length === 1 ? 'requisición pendiente' : 'requisiciones pendientes'} de tu autorización.`);
  const todayKey = `mrti-dashboard-first-visit:${profile.id || profile.user_id || 'session'}`;
  const firstVisitToday = localStorage.getItem(todayKey) !== new Date().toISOString().slice(0, 10);
  if (firstVisitToday) {
    localStorage.setItem(todayKey, new Date().toISOString().slice(0, 10));
    if (!segments.length) segments.push('Tu resumen personal y tus gestiones están al día.');
  }
  message.textContent = segments.join(' ');
  message.hidden = !message.textContent;

  const ticketAction = document.querySelector('.quick-action[href="#tickets-dashboard"]');
  if (ticketAction) {
    ticketAction.querySelector('.quick-action-count')?.remove();
    if (openTickets) {
      const badge = document.createElement('small');
      badge.className = 'quick-action-count';
      badge.textContent = `${openTickets} ${openTickets === 1 ? 'abierto' : 'abiertos'}`;
      ticketAction.querySelector('div')?.append(badge);
    }
  }
  const assetAction = document.querySelector('.quick-action[href="#assets-dashboard"]');
  if (assetAction) {
    assetAction.querySelector('.quick-action-count')?.remove();
    const assetCount = (widgetData.get('assets') || []).length;
    if (assetCount) {
      const badge = document.createElement('small');
      badge.className = 'quick-action-count';
      badge.textContent = `${assetCount} ${assetCount === 1 ? 'asignado' : 'asignados'}`;
      assetAction.querySelector('div')?.append(badge);
    }
  }
}

function addSearch(profile, api, handlers) {
  const actions = document.querySelector('.topbar-actions');
  const notifications = document.querySelector('.notification-center');
  if (!actions || !notifications) return;
  const search = document.createElement('div');
  search.className = 'global-search';
  search.innerHTML = `<label class="global-search-box"><span class="global-search-icon">${ICON}<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></span><input id="global-search-input" type="search" placeholder="Folio, empleado o activo" autocomplete="off" aria-label="Búsqueda global" aria-controls="global-search-results" aria-expanded="false"><kbd>Ctrl K</kbd></label><div class="global-search-results" id="global-search-results" role="listbox" hidden></div>`;
  actions.insertBefore(search, notifications);
  const input = search.querySelector('input');
  const results = search.querySelector('.global-search-results');
  let searchTimer = 0;
  let requestController = null;
  let latestResults = [];

  const closeResults = () => {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };
  const renderResults = (items, partial = false) => {
    latestResults = items;
    results.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'global-search-empty';
      empty.textContent = partial ? 'Sin coincidencias disponibles; una fuente no respondió.' : 'No se encontraron coincidencias.';
      results.append(empty);
    } else {
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'global-search-result';
        button.setAttribute('role', 'option');
        button.dataset.resultIndex = String(latestResults.indexOf(item));
        const type = document.createElement('small');
        type.textContent = ({ ticket: 'Ticket', requisition: 'Requisición', asset: 'Activo', employee: 'Empleado' })[item.type] || 'Resultado';
        const title = document.createElement('strong');
        title.textContent = item.title || 'Resultado';
        const detail = document.createElement('span');
        detail.textContent = item.detail || '';
        button.append(type, title, detail);
        results.append(button);
      }
    }
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  input.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    requestController?.abort();
    const query = input.value.trim();
    if (query.length < 2) {
      closeResults();
      return;
    }
    searchTimer = window.setTimeout(async () => {
      requestController = new AbortController();
      results.innerHTML = '<p class="global-search-empty">Buscando…</p>';
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      try {
        const response = await api(`/api/portal/v1/search?q=${encodeURIComponent(query)}`, { signal: requestController.signal });
        renderResults(response.data, response.partial);
      } catch (error) {
        if (error.name === 'AbortError') return;
        results.innerHTML = '';
        const failure = document.createElement('p');
        failure.className = 'global-search-empty';
        failure.textContent = 'No fue posible completar la búsqueda. Inténtalo nuevamente.';
        results.append(failure);
        results.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      }
    }, 250);
  });

  results.addEventListener('click', (event) => {
    const button = event.target.closest('.global-search-result');
    if (!button) return;
    const item = latestResults[Number(button.dataset.resultIndex)];
    closeResults();
    if (!item) return;
    if (item.type === 'requisition') handlers.openRequisition(item.id);
    else if (item.type === 'ticket' && !item.href) handlers.openTicket(item.id);
    else if (item.type === 'asset' && !item.href) document.querySelector('#assets-dashboard')?.scrollIntoView({ behavior: 'smooth' });
    else if (item.href) window.location.assign(item.href);
  });
  document.addEventListener('click', (event) => {
    if (!search.contains(event.target)) closeResults();
  }, { signal: activeController.signal });
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement
      && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
      input.select();
    } else if (!typing && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      handlers.newTicket();
    } else if ((event.ctrlKey || event.metaKey) && event.key === ',') {
      event.preventDefault();
      handlers.openAccount();
    } else if (event.key === 'Escape' && document.activeElement === input) {
      input.value = '';
      closeResults();
      input.blur();
    }
  }, { signal: activeController.signal });
}

function addNotificationQuickAction() {
  if (!notificationCount) {
    document.querySelector('#quick-notifications')?.remove();
    document.querySelector('#sidebar-notifications-button')?.remove();
    return;
  }
  const grid = document.querySelector('.quick-action-grid');
  if (!grid) return;
  let action = document.querySelector('#quick-notifications');
  if (!action) {
    action = document.createElement('button');
    action.id = 'quick-notifications';
    action.type = 'button';
    action.className = 'quick-action quick-notifications';
    action.innerHTML = `<span>${ICON}<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span><div><strong>Ver notificaciones</strong><small></small></div><b aria-hidden="true">→</b>`;
    action.addEventListener('click', () => document.querySelector('#notifications-button')?.click());
    grid.append(action);
  }
  action.querySelector('small').textContent = `${notificationCount} ${notificationCount === 1 ? 'pendiente' : 'pendientes'}`;

  const nav = document.querySelector('.primary-nav');
  if (nav && !document.querySelector('#sidebar-notifications-button')) {
    const button = document.createElement('button');
    button.id = 'sidebar-notifications-button';
    button.type = 'button';
    button.className = 'primary-nav-link sidebar-notifications';
    button.innerHTML = `<span class="nav-icon">${ICON}<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span><span class="nav-label">Notificaciones</span><span class="sidebar-notification-count">${notificationCount}</span>`;
    button.addEventListener('click', () => document.querySelector('#notifications-button')?.click());
    nav.append(button);
  } else {
    const badge = document.querySelector('.sidebar-notification-count');
    if (badge) badge.textContent = String(notificationCount);
  }
}

function orderWidgets(order, persist) {
  const container = widgetIds.map((id) => document.getElementById(id)).find(Boolean)?.parentElement;
  if (!container) return;
  const items = widgetIds.map((id) => document.getElementById(id)).filter(Boolean);
  const sorted = [...items].sort((a, b) => order.indexOf(widgetLabels.get(a.id)) - order.indexOf(widgetLabels.get(b.id)));
  let status = container.querySelector('.widget-order-status');
  if (!status) {
    status = document.createElement('small');
    status.className = 'widget-order-status';
    status.textContent = 'Arrastra los widgets para cambiar su orden; usa Alt + flechas para moverlos con teclado.';
    status.setAttribute('aria-live', 'polite');
  }
  for (const item of sorted) {
    item.draggable = true;
    item.tabIndex = 0;
    const label = ({ rh: 'Recursos Humanos', assets: 'Activos', tickets: 'Tickets', requisitions: 'Requisiciones' })[widgetLabels.get(item.id)];
    item.setAttribute('aria-label', `${label}; arrastra para reordenar`);
    item.classList.add('dashboard-widget');
    container.append(item);
  }
  container.append(status);
  let dragged = null;
  const saveOrder = () => {
    const visibleOrder = [...container.querySelectorAll('.dashboard-widget')].map((widget) => widgetLabels.get(widget.id));
    const visibleKeys = new Set(visibleOrder);
    let visibleIndex = 0;
    const nextOrder = order.map((key) => visibleKeys.has(key) ? visibleOrder[visibleIndex++] : key);
    void persist(nextOrder).then(() => {
      status.textContent = 'Orden de widgets guardado.';
    }).catch((error) => {
      console.error('No fue posible guardar el orden de widgets.', error);
      status.textContent = 'No se guardó el orden. Mueve un widget para reintentar.';
    });
  };
  for (const item of items) {
    item.addEventListener('dragstart', (event) => {
      dragged = item;
      item.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
    }, { signal: activeController.signal });
    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      dragged = null;
      saveOrder();
    }, { signal: activeController.signal });
    item.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (!dragged || dragged === item) return;
      const rect = item.getBoundingClientRect();
      container.insertBefore(dragged, event.clientY < rect.top + rect.height / 2 ? item : item.nextSibling);
    }, { signal: activeController.signal });
    item.addEventListener('keydown', (event) => {
      if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const siblings = [...container.querySelectorAll('.dashboard-widget')];
      const index = siblings.indexOf(item);
      const target = siblings[index + (event.key === 'ArrowUp' ? -1 : 1)];
      if (!target) return;
      container.insertBefore(item, event.key === 'ArrowUp' ? target : target.nextSibling);
      item.focus();
      saveOrder();
    }, { signal: activeController.signal });
  }
}

function refineCards() {
  const iconById = {
    'employee-dashboard': `${ICON}<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
    'assets-dashboard': `${ICON}<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10"/></svg>`,
    'tickets-dashboard': `${ICON}<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>`,
    'requisitions-dashboard': `${ICON}<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6m3-3h-6"/></svg>`,
  };
  const colorById = {
    'employee-dashboard': 'rh',
    'assets-dashboard': 'assets',
    'tickets-dashboard': 'tickets',
    'requisitions-dashboard': 'requisitions',
  };
  for (const id of widgetIds) {
    const widget = document.getElementById(id);
    if (!widget) continue;
    widget.classList.add('dashboard-widget', `widget-${colorById[id]}`);
    const title = widget.querySelector('.personal-card-title h3, .personal-card-heading h3');
    if (title && !title.querySelector('.widget-title-icon')) {
      const icon = document.createElement('span');
      icon.className = 'widget-title-icon';
      icon.innerHTML = iconById[id];
      title.prepend(icon);
    }
    for (const empty of widget.querySelectorAll('.personal-empty')) {
      if (empty.querySelector('.empty-state-icon')) continue;
      const illustration = document.createElement('span');
      illustration.className = 'empty-state-icon';
      illustration.innerHTML = `${ICON}<path d="M4 5h16v14H4z"/><path d="M8 10h8M8 14h5"/></svg>`;
      empty.prepend(illustration);
      const suggestion = document.createElement('small');
      suggestion.className = 'empty-state-suggestion';
      suggestion.textContent = id === 'tickets-dashboard'
        ? 'Crea tu primer ticket desde la acción rápida de arriba.'
        : id === 'assets-dashboard' ? 'Cuando se te asigne equipo, aparecerá aquí.'
          : id === 'requisitions-dashboard' ? 'Las requisiciones que envíes se mostrarán aquí.'
            : empty.textContent.toLocaleLowerCase().includes('saldo')
              ? 'Cuando RH asigne saldos disponibles, aparecerán aquí.'
              : 'Tu información laboral aparecerá cuando RH vincule tu ficha.';
      empty.append(suggestion);
    }
  }
}

export function bindDashboardRefinements({ profile, api, widgetOrder, persistWidgetOrder, handlers }) {
  activeController?.abort();
  dashboardObserver?.disconnect();
  activeController = new AbortController();
  dashboardObserver = null;
  widgetData = new Map();
  notificationCount = 0;
  addSearch(profile, api, handlers);
  refineCards();
  dashboardObserver = new MutationObserver(() => refineCards());
  for (const id of widgetIds) {
    const widget = document.getElementById(id);
    if (widget) dashboardObserver.observe(widget, { childList: true, subtree: true });
  }
  orderWidgets(widgetOrder, persistWidgetOrder);
  document.querySelector('#home-contextual-message')?.setAttribute('aria-live', 'polite');

  const heading = document.querySelector('.home-intro h1');
  const avatar = document.querySelector('.home-intro .hero-avatar');
  if (heading && avatar && !heading.parentElement.classList.contains('home-greeting-row')) {
    const row = document.createElement('div');
    row.className = 'home-greeting-row';
    heading.before(row);
    row.append(avatar, heading);
  }
  const breadcrumb = document.querySelector('.topbar-context');
  if (breadcrumb) breadcrumb.innerHTML = '<strong>Dashboard <span aria-hidden="true">›</span> Inicio</strong><small>Inicio personal</small>';

  const nav = document.querySelector('.primary-nav');
  if (nav && !nav.querySelector('.sidebar-section-label')) {
    const label = document.createElement('small');
    label.className = 'sidebar-section-label';
    label.textContent = 'Principal';
    nav.insertBefore(label, nav.querySelector('#home-button'));
    const tools = document.createElement('small');
    tools.className = 'sidebar-section-label sidebar-tools-label';
    tools.textContent = 'Herramientas';
    nav.insertBefore(tools, nav.querySelector('#core-new-ticket-button'));
  }

  const footer = document.querySelector('.portal-workspace > footer');
  if (footer && !footer.querySelector('.portal-footer-links')) {
    const links = document.createElement('nav');
    links.className = 'portal-footer-links';
    links.setAttribute('aria-label', 'Enlaces útiles');
    links.innerHTML = '<button type="button" id="footer-support-link">Soporte</button>'
      + (profile.role === 'administrator' ? '<button type="button" id="footer-control-link">Centro de control</button>' : '')
      + `<span id="portal-release-info">Portal v${import.meta.env.VITE_BUILD_VERSION || '1.0.0'} · Deploy no disponible</span>`;
    footer.append(links);
    links.querySelector('#footer-support-link')?.addEventListener('click', handlers.newTicket, { signal: activeController.signal });
    links.querySelector('#footer-control-link')?.addEventListener('click', handlers.openControlCenter, { signal: activeController.signal });
    void fetch('/release.json', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = await response.json();
      const builtAt = release.builtAt ? new Date(release.builtAt) : null;
      const deployDate = builtAt && !Number.isNaN(builtAt.getTime())
        ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(builtAt)
        : 'fecha no disponible';
      const releaseInfo = document.querySelector('#portal-release-info');
      if (releaseInfo) releaseInfo.textContent = `Portal v${release.id || '1.0.0'} · Deploy ${deployDate}`;
    }).catch(() => {
      const releaseInfo = document.querySelector('#portal-release-info');
      if (releaseInfo) releaseInfo.textContent = `Portal v${import.meta.env.VITE_BUILD_VERSION || '1.0.0'} · Deploy no disponible`;
    });
  }

  document.querySelector('#global-search-input')?.addEventListener('focus', (event) => event.target.select());
  window.addEventListener('mrti:dashboard-widget', (event) => {
    const { widget, data } = event.detail || {};
    if (widget) widgetData.set(widget, data || []);
    emitActivity(profile, { approvals: widgetData.get('approvals') || [] });
    updateWelcome(profile);
    refineCards();
  }, { signal: activeController.signal });
  window.addEventListener('mrti:dashboard-notifications', (event) => {
    notificationCount = Number(event.detail?.count) || 0;
    addNotificationQuickAction();
  }, { signal: activeController.signal });

  updateWelcome(profile);
}
