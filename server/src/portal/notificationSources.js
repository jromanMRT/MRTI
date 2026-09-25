const OPEN_TICKET_STATUSES = new Set([
  'NEW',
  'OPEN',
  'ASSIGNED',
  'IN_DIAGNOSIS',
  'IN_PROGRESS',
  'ON_HOLD_USER',
  'ON_HOLD_VENDOR',
  'REOPENED',
]);

function ticketsUrl(path) {
  const base = process.env.MRTI_TICKETS_URL || 'http://127.0.0.1:4000';
  return `${base.replace(/\/$/, '')}${path}`;
}

async function fetchTicketSource(path, authorization) {
  try {
    const response = await fetch(ticketsUrl(path), {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    return { ok: true, data: Array.isArray(body.data) ? body.data : [], error: null };
  } catch (error) {
    return { ok: false, data: [], error: error.message };
  }
}

// El estado de SLA ya viaja en ambas fuentes (ver selfTicketSelect en
// ticketsSelf.ts y listTeamTicketNotifications en teamNotifications.ts) --
// aquí sólo se usa para que un ticket vencido o por vencer se distinga en
// la campanilla sin abrir el dashboard operativo de Tickets. No cambia el
// orden (sigue siendo cronológico): un ticket urgente que nadie ha visto
// sigue mezclado con el resto, sólo se nota cuál es cuál.
function slaUrgencyLabel(ticket) {
  if (ticket.sla_state === 'overdue') return 'SLA vencido';
  if (ticket.sla_state === 'at_risk') return 'SLA por vencer';
  return null;
}

// Quien reporta un ticket antes no se enteraba de nada salvo que volviera a
// entrar a "Mis tickets" -- a diferencia de "assigned" (arriba), aquí sí hace
// falta una ventana de tiempo: CLOSED es un estado permanente, y sin ella un
// ticket cerrado hace meses seguiría apareciendo en la campanilla para
// siempre.
const REQUESTER_ATTENTION_STATUSES = new Set(['RESOLVED', 'CLOSED', 'ON_HOLD_USER', 'REOPENED']);
const REQUESTER_NOTICE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function requesterStatusLabel(ticket) {
  if (ticket.status_code === 'ON_HOLD_USER') return 'Necesitan información tuya';
  if (ticket.status_code === 'REOPENED') return 'Se reabrió';
  if (ticket.status_code === 'CLOSED') return 'Se cerró';
  return 'Se resolvió';
}

export function normalizeTicketNotifications({ ownTickets = [], teamTickets = [], userId, canOpenTickets }) {
  const assigned = ownTickets
    .filter((ticket) => String(ticket.assigned_to || '') === String(userId) && OPEN_TICKET_STATUSES.has(ticket.status_code))
    .map((ticket) => {
      const urgency = slaUrgencyLabel(ticket);
      return {
        id: `assigned-ticket:${ticket.id}`,
        ticket_id: String(ticket.id),
        kind: urgency ? 'assigned_ticket_sla' : 'assigned_ticket',
        title: `${urgency ? '⚠️ ' : ''}${ticket.folio || 'Ticket'} asignado a ti`,
        message: `${ticket.title || 'Sin título'} · ${urgency || ticket.status_name || 'En atención'}`,
        timestamp: ticket.updated_at || ticket.created_at || null,
        href: canOpenTickets ? `/tickets/tickets/${encodeURIComponent(ticket.id)}` : null,
      };
    });

  const assignedIds = new Set(assigned.map((item) => item.ticket_id));

  // No hay ruta de autoservicio para un ticket suelto (TicketDetail.tsx pide
  // /api/tickets/:id, que exige acceso al módulo completo) -- por eso el
  // destino es la sección "Mis tickets" del home de Core, no el detalle
  // operativo, a diferencia de "assigned"/"team" que sí abren en Tickets.
  const requesterUpdates = ownTickets
    .filter((ticket) => String(ticket.requester_id || '') === String(userId)
      && !assignedIds.has(String(ticket.id))
      && REQUESTER_ATTENTION_STATUSES.has(ticket.status_code)
      && ticket.updated_at
      && (Date.now() - new Date(ticket.updated_at).getTime()) < REQUESTER_NOTICE_WINDOW_MS)
    .map((ticket) => ({
      id: `requester-ticket:${ticket.id}`,
      ticket_id: String(ticket.id),
      kind: 'requester_ticket_update',
      title: `${ticket.folio || 'Tu ticket'} · ${requesterStatusLabel(ticket)}`,
      message: ticket.title || 'Sin título',
      timestamp: ticket.updated_at || ticket.created_at || null,
      href: '/#tickets-dashboard',
    }));

  const team = teamTickets
    .filter((ticket) => !assignedIds.has(String(ticket.id)))
    .map((ticket) => {
      const urgency = slaUrgencyLabel(ticket);
      return {
        id: `team-ticket:${ticket.id}`,
        ticket_id: String(ticket.id),
        kind: urgency ? 'team_ticket_sla' : 'team_ticket',
        title: `${urgency ? '⚠️ ' : ''}${ticket.folio || 'Nuevo ticket'} para ${ticket.business_area_name || 'tu equipo'}`,
        message: urgency ? `${ticket.title || 'Sin título'} · ${urgency}` : (ticket.title || 'Hay un ticket nuevo pendiente de atención.'),
        timestamp: ticket.updated_at || ticket.created_at || null,
        href: canOpenTickets ? `/tickets/tickets/${encodeURIComponent(ticket.id)}` : null,
      };
    });

  return [...assigned, ...requesterUpdates, ...team]
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime())
    .slice(0, 10);
}

export async function fetchTicketNotifications({ authorization, userId, canOpenTickets }) {
  const [own, team] = await Promise.all([
    fetchTicketSource('/api/tickets-self/me', authorization),
    fetchTicketSource('/api/tickets-self/team-notifications', authorization),
  ]);
  return {
    items: normalizeTicketNotifications({
      ownTickets: own.data,
      teamTickets: team.data,
      userId,
      canOpenTickets,
    }),
    sources: [
      { source: 'assigned-tickets', ok: own.ok, error: own.error },
      { source: 'team-tickets', ok: team.ok, error: team.error },
    ],
  };
}

function legalUrl(path) {
  const base = process.env.MRTI_LEGAL_URL || 'http://127.0.0.1:3006';
  return `${base.replace(/\/$/, '')}${path}`;
}

function rhUrl(path) {
  const base = process.env.MRTI_RH_URL || 'http://127.0.0.1:3004';
  return `${base.replace(/\/$/, '')}${path}`;
}

function assetsUrl(path) {
  const base = process.env.MRTI_ASSETS_URL || 'http://127.0.0.1:3003';
  return `${base.replace(/\/$/, '')}${path}`;
}

export async function fetchAssetNotifications({ authorization, canOpenAssets }) {
  if (!canOpenAssets) {
    return { items: [], sources: [{ source: 'asset-licenses', ok: true, skipped: true, error: null }] };
  }
  try {
    const response = await fetch(assetsUrl('/api/activos-suite/license-notifications'), {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const items = (Array.isArray(body.data) ? body.data : [])
      .map((item) => ({ ...item, module_code: 'activos' }));
    return { items, sources: [{ source: 'asset-licenses', ok: true, error: null }] };
  } catch (error) {
    return { items: [], sources: [{ source: 'asset-licenses', ok: false, error: error.message }] };
  }
}

async function fetchRhSource(path, authorization) {
  try {
    const response = await fetch(rhUrl(path), {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    return { ok: true, data: Array.isArray(body.data) ? body.data : [], error: null };
  } catch (error) {
    return { ok: false, data: [], error: error.message };
  }
}

// RH entrega cada fuente ya en la forma final (autoservicio, acotada al
// empleado autenticado); aquí solo se combinan documentos laborales y salas
// de juntas (mismo patrón de dos fuentes que fetchTicketNotifications).
export async function fetchRhNotifications({ authorization, canOpenRh }) {
  const [documents, rooms, lifecycleTasks] = await Promise.all([
    fetchRhSource('/api/rh-self/me/documents/notifications', authorization),
    fetchRhSource('/api/rh-self/me/meeting-room-bookings/notifications', authorization),
    // Tareas de altas/bajas vencidas o por vencer, propias o sin asignar en un
    // módulo donde la persona está registrada como responsable -- no depende
    // de tener acceso al módulo RH para RECIBIR el aviso, sólo para abrirlo
    // (el href se anula abajo igual que las otras dos fuentes de RH).
    fetchRhSource('/api/rh-self/me/lifecycle-tasks/notifications', authorization),
  ]);
  const items = [...documents.data, ...rooms.data, ...lifecycleTasks.data]
    .map((item) => ({ ...item, module_code: 'rh', href: canOpenRh ? item.href : null }))
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime());
  return {
    items,
    sources: [
      { source: 'rh-documents', ok: documents.ok, error: documents.error },
      { source: 'rh-meeting-rooms', ok: rooms.ok, error: rooms.error },
      { source: 'rh-lifecycle-tasks', ok: lifecycleTasks.ok, error: lifecycleTasks.error },
    ],
  };
}

// MRTI Legal ya entrega sus items en la forma final que espera la campanilla
// (id/title/message/timestamp/href) -- a diferencia de Tickets no hace falta
// normalizar dos fuentes distintas, sólo etiquetar de qué módulo vienen.
export async function fetchLegalNotifications({ authorization, canOpenLegal }) {
  try {
    const response = await fetch(legalUrl('/api/legal-self/notifications'), {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const items = (Array.isArray(body.data) ? body.data : [])
      .map((item) => ({ ...item, module_code: 'mrti-legal', href: canOpenLegal ? item.href : null }));
    return { items, sources: [{ source: 'mrti-legal', ok: true, error: null }] };
  } catch (error) {
    return { items: [], sources: [{ source: 'mrti-legal', ok: false, error: error.message }] };
  }
}
