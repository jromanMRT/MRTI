import { buildNavigationDestinations, searchNavigationDestinations } from './navigation-search.js';

const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
let activeController = null;
let dashboardObserver = null;
let widgetData = new Map();
let notificationCount = 0;

const widgetIds = ['employee-dashboard', 'assets-dashboard', 'tickets-dashboard', 'requisitions-dashboard'];
const widgetKeys = ['rh', 'assets', 'tickets', 'requisitions'];
const widgetLabels = new Map(widgetIds.map((id, index) => [id, widgetKeys[index]]));
const widgetOptions = [
  { key: 'rh', label: 'Recursos Humanos', id: 'employee-dashboard' },
  { key: 'assets', label: 'Activos', id: 'assets-dashboard' },
  { key: 'tickets', label: 'Tickets', id: 'tickets-dashboard' },
  { key: 'requisitions', label: 'Requisiciones de personal', id: 'requisitions-dashboard' },
];

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

function addSearch(profile, applications, handlers) {
  const slot = document.querySelector('#sidebar-search-slot');
  if (!slot) return;
  const search = document.createElement('div');
  search.className = 'global-search';
  search.innerHTML = `<label class="global-search-box"><span class="global-search-icon">${ICON}<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></span><input id="global-search-input" type="search" placeholder="¿A dónde quieres ir?" autocomplete="off" aria-label="Buscar páginas y módulos" aria-controls="global-search-results" aria-expanded="false"><kbd>Ctrl K</kbd></label><div class="global-search-results" id="global-search-results" role="group" aria-label="Destinos disponibles" hidden></div>`;
  slot.append(search);
  const input = search.querySelector('input');
  const results = search.querySelector('.global-search-results');
  const destinations = buildNavigationDestinations(profile, applications);
  let latestResults = [];

  const closeResults = () => {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };
  const renderResults = (items) => {
    latestResults = items;
    results.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'global-search-empty';
      empty.textContent = 'No se encontraron páginas ni módulos. Prueba con otra palabra.';
      results.append(empty);
    } else {
      items.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'global-search-result';
        button.dataset.resultIndex = String(index);
        const type = document.createElement('small');
        type.textContent = item.type;
        const title = document.createElement('strong');
        title.textContent = item.title;
        const detail = document.createElement('span');
        detail.textContent = item.detail || 'Abrir destino';
        button.append(type, title, detail);
        results.append(button);
      });
    }
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const updateResults = () => renderResults(searchNavigationDestinations(destinations, input.value));
  input.addEventListener('focus', updateResults);
  input.addEventListener('input', updateResults);
  input.addEventListener('click', () => {
    if (results.hidden) updateResults();
  });

  results.addEventListener('click', (event) => {
    const button = event.target.closest('.global-search-result');
    if (!button) return;
    const item = latestResults[Number(button.dataset.resultIndex)];
    closeResults();
    if (!item) return;
    if (item.action) handlers[item.action]?.();
    else if (item.href) window.location.assign(item.href);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && !results.hidden) {
      event.preventDefault();
      results.querySelector('.global-search-result')?.focus();
    } else if (event.key === 'Escape' && !results.hidden) {
      event.preventDefault();
      closeResults();
      if (!input.value) input.blur();
    }
  });
  results.addEventListener('keydown', (event) => {
    const button = event.target.closest('.global-search-result');
    if (!button) return;
    const buttons = [...results.querySelectorAll('.global-search-result')];
    const index = buttons.indexOf(button);
    if (event.key === 'ArrowDown' && index < buttons.length - 1) {
      event.preventDefault();
      buttons[index + 1].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index > 0) buttons[index - 1].focus();
      else input.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeResults();
      input.focus();
    }
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
      const shell = document.querySelector('.page-shell');
      if (window.matchMedia('(max-width: 900px)').matches && !shell?.classList.contains('sidebar-mobile-open')) {
        shell?.classList.add('sidebar-mobile-open');
        document.querySelector('#mobile-menu-button')?.setAttribute('aria-expanded', 'true');
      }
      input.focus();
      input.select();
      updateResults();
    } else if (!typing && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      handlers.newTicket();
    } else if ((event.ctrlKey || event.metaKey) && event.key === ',') {
      event.preventDefault();
      handlers.openAccount();
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

function orderWidgets(order, visibility, persist, loadWidget) {
  const section = document.querySelector('.personal-widget-section');
  const container = document.querySelector('#dashboard-widget-grid');
  const layout = document.querySelector('#dashboard-editor-layout');
  const editButton = document.querySelector('#dashboard-edit-button');
  if (!section || !container || !layout || !editButton) return;

  const items = new Map(widgetOptions.map(({ key, id }) => [key, document.getElementById(id)]));
  if (widgetOptions.some(({ key }) => !items.get(key))) return;

  const dialog = document.createElement('aside');
  dialog.id = 'dashboard-editor';
  dialog.className = 'dashboard-editor-panel';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'false');
  dialog.setAttribute('aria-labelledby', 'dashboard-editor-title');
  dialog.hidden = true;
  dialog.innerHTML = `<header class="dashboard-editor-heading"><div><p class="section-label">Personaliza tu espacio</p><h2 id="dashboard-editor-title">Editar dashboard</h2></div><button class="dashboard-editor-close" type="button" aria-label="Cerrar edición">×</button></header>
    <p class="dashboard-editor-intro">Agrega o quita widgets y cambia su orden. Tus cambios sólo afectan a tu cuenta.</p>
    <fieldset class="dashboard-editor-options"><legend>Widgets y orden</legend>${widgetOptions.map(({ key, label }) => `<div class="dashboard-editor-option" data-widget-option="${key}"><label><input type="checkbox" data-widget-toggle="${key}"><span>${label}</span></label><div class="dashboard-editor-move"><button type="button" data-widget-move="${key}" data-direction="up" aria-label="Mover ${label} hacia arriba">↑</button><button type="button" data-widget-move="${key}" data-direction="down" aria-label="Mover ${label} hacia abajo">↓</button></div></div>`).join('')}</fieldset>
    <p class="dashboard-editor-hint">Usa los botones ↑/↓ o arrastra las tarjetas mientras editas.</p>
    <p class="dashboard-editor-status" role="status" aria-live="polite"></p>
    <footer class="dashboard-editor-actions"><button class="secondary-button" type="button" data-editor-cancel>Cancelar</button><button class="primary-button" type="button" data-editor-save>Guardar cambios</button></footer>`;
  layout.append(dialog);

  const status = dialog.querySelector('.dashboard-editor-status');
  const saveButton = dialog.querySelector('[data-editor-save]');
  const cancelButton = dialog.querySelector('[data-editor-cancel]');
  const visibilityInputs = new Map(
    widgetOptions.map(({ key }) => [key, dialog.querySelector(`[data-widget-toggle="${key}"]`)])
  );
  const updateMoveButtons = () => {
    const visibleOrder = draft.order.filter((key) => draft.visibility[key]);
    for (const { key } of widgetOptions) {
      const index = visibleOrder.indexOf(key);
      const option = dialog.querySelector(`[data-widget-option="${key}"]`);
      option.querySelector('[data-direction="up"]').disabled = !editing || index <= 0;
      option.querySelector('[data-direction="down"]').disabled = !editing || index < 0 || index >= visibleOrder.length - 1;
    }
  };
  const loadedWidgets = new Set(widgetOptions.filter(({ key }) => visibility[key]).map(({ key }) => key));
  let savedSettings = { visibility: { ...visibility }, order: [...order] };
  let draft = { visibility: { ...visibility }, order: [...order] };
  let editing = false;
  let saving = false;
  let dragged = null;

  const sortWidgets = (keys) => {
    const sorted = [...items.entries()].sort((a, b) => keys.indexOf(a[0]) - keys.indexOf(b[0]));
    for (const [, item] of sorted) container.append(item);
  };
  const applyDraft = () => {
    sortWidgets(draft.order);
    for (const { key } of widgetOptions) {
      const item = items.get(key);
      item.hidden = !draft.visibility[key];
      visibilityInputs.get(key).checked = draft.visibility[key];
      item.draggable = editing && draft.visibility[key];
      if (editing) {
        item.tabIndex = 0;
        const label = widgetOptions.find((option) => option.key === key).label;
        item.setAttribute('aria-label', `${label}; usa Alt + flechas para cambiar el orden`);
      } else {
        item.removeAttribute('tabindex');
        item.removeAttribute('aria-label');
      }
    }
    updateMoveButtons();
  };
  const updateDraftOrder = () => {
    const visibleOrder = [...container.querySelectorAll('.dashboard-widget:not([hidden])')]
      .map((item) => widgetLabels.get(item.id));
    let visibleIndex = 0;
    draft.order = draft.order.map((key) => draft.visibility[key] ? visibleOrder[visibleIndex++] : key);
    updateMoveButtons();
    status.textContent = 'Orden actualizado. Guarda los cambios para conservarlo.';
  };
  const setEditing = (value) => {
    editing = value;
    section.classList.toggle('is-editing', value);
    editButton.setAttribute('aria-expanded', String(value));
    applyDraft();
  };
  const closeEditor = () => {
    if (saving) return;
    draft = { visibility: { ...savedSettings.visibility }, order: [...savedSettings.order] };
    applyDraft();
    setEditing(false);
    dialog.hidden = true;
    editButton.focus();
  };

  for (const item of items.values()) item.classList.add('dashboard-widget');
  applyDraft();

  editButton.addEventListener('click', () => {
    if (editing) {
      closeEditor();
      return;
    }
    draft = { visibility: { ...savedSettings.visibility }, order: [...savedSettings.order] };
    setEditing(true);
    status.textContent = '';
    dialog.hidden = false;
    dialog.querySelector('.dashboard-editor-close').focus();
  }, { signal: activeController.signal });
  dialog.querySelector('.dashboard-editor-close').addEventListener('click', closeEditor, { signal: activeController.signal });
  cancelButton.addEventListener('click', closeEditor, { signal: activeController.signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && editing) closeEditor();
  }, { signal: activeController.signal });

  for (const { key } of widgetOptions) {
    visibilityInputs.get(key).addEventListener('change', (event) => {
      const isVisible = event.target.checked;
      draft.visibility[key] = isVisible;
      applyDraft();
      status.textContent = isVisible ? 'Widget agregado; guarda para conservar el cambio.' : 'Widget quitado; guarda para conservar el cambio.';
      if (isVisible && !loadedWidgets.has(key)) {
        loadedWidgets.add(key);
        loadWidget(key);
      }
    }, { signal: activeController.signal });
  }

  dialog.querySelectorAll('[data-widget-move]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!editing) return;
      const key = button.dataset.widgetMove;
      const visibleOrder = draft.order.filter((itemKey) => draft.visibility[itemKey]);
      const index = visibleOrder.indexOf(key);
      const target = visibleOrder[index + (button.dataset.direction === 'up' ? -1 : 1)];
      if (!target) return;
      const currentOrderIndex = draft.order.indexOf(key);
      const targetOrderIndex = draft.order.indexOf(target);
      [draft.order[currentOrderIndex], draft.order[targetOrderIndex]] = [draft.order[targetOrderIndex], draft.order[currentOrderIndex]];
      applyDraft();
      status.textContent = 'Orden actualizado. Guarda los cambios para conservarlo.';
      const option = dialog.querySelector(`[data-widget-option="${key}"]`);
      (option.querySelector('[data-widget-move]:not(:disabled)') || option.querySelector('input')).focus();
    }, { signal: activeController.signal });
  });

  saveButton.addEventListener('click', async () => {
    if (saving) return;
    saving = true;
    saveButton.disabled = true;
    cancelButton.disabled = true;
    status.textContent = 'Guardando tus preferencias…';
    try {
      const preferences = await persist({
        widgetVisibility: { ...draft.visibility },
        widgetOrder: [...draft.order],
      });
      savedSettings = {
        visibility: {
          rh: preferences.show_rh,
          assets: preferences.show_assets,
          tickets: preferences.show_tickets,
          requisitions: preferences.show_requisitions,
        },
        order: [...preferences.widget_order],
      };
      draft = { visibility: { ...savedSettings.visibility }, order: [...savedSettings.order] };
      applyDraft();
      setEditing(false);
      dialog.hidden = true;
      editButton.focus();
    } catch (error) {
      console.error('No fue posible guardar la personalización del dashboard.', error);
      status.textContent = `No se guardaron los cambios. ${error.message}`;
    } finally {
      saving = false;
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  }, { signal: activeController.signal });

  for (const item of items.values()) {
    item.addEventListener('dragstart', (event) => {
      if (!editing) {
        event.preventDefault();
        return;
      }
      dragged = item;
      item.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
    }, { signal: activeController.signal });
    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      if (dragged !== item) return;
      dragged = null;
      updateDraftOrder();
    }, { signal: activeController.signal });
    item.addEventListener('dragover', (event) => {
      if (!editing || !dragged || dragged === item || item.hidden) return;
      event.preventDefault();
      const rect = item.getBoundingClientRect();
      container.insertBefore(dragged, event.clientY < rect.top + rect.height / 2 ? item : item.nextSibling);
    }, { signal: activeController.signal });
    item.addEventListener('keydown', (event) => {
      if (!editing || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const siblings = [...container.querySelectorAll('.dashboard-widget:not([hidden])')];
      const index = siblings.indexOf(item);
      const target = siblings[index + (event.key === 'ArrowUp' ? -1 : 1)];
      if (!target) return;
      container.insertBefore(item, event.key === 'ArrowUp' ? target : target.nextSibling);
      item.focus();
      updateDraftOrder();
    }, { signal: activeController.signal });
  }
  container.addEventListener('dragstart', (event) => {
    const item = event.target.closest('.dashboard-widget');
    if (!editing || !item || item.hidden) event.preventDefault();
  }, { capture: true, signal: activeController.signal });
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

export function bindDashboardRefinements({ profile, applications, api, widgetOrder, widgetVisibility, persistDashboardPreferences, handlers }) {
  activeController?.abort();
  dashboardObserver?.disconnect();
  activeController = new AbortController();
  dashboardObserver = null;
  widgetData = new Map();
  notificationCount = 0;
  addSearch(profile, applications, handlers);
  refineCards();
  dashboardObserver = new MutationObserver(() => refineCards());
  for (const id of widgetIds) {
    const widget = document.getElementById(id);
    if (widget) dashboardObserver.observe(widget, { childList: true, subtree: true });
  }
  orderWidgets(widgetOrder, widgetVisibility, persistDashboardPreferences, handlers.loadWidget);
  document.querySelector('#home-contextual-message')?.setAttribute('aria-live', 'polite');

  const heading = document.querySelector('.home-intro h1');
  const avatar = document.querySelector('.home-intro .hero-avatar');
  if (heading && avatar && !heading.parentElement.classList.contains('home-greeting-row')) {
    const row = document.createElement('div');
    row.className = 'home-greeting-row';
    heading.before(row);
    row.append(avatar, heading);
  }
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
