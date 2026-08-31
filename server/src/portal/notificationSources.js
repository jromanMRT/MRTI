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

export function normalizeTicketNotifications({ ownTickets = [], teamTickets = [], userId, canOpenTickets }) {
  const assigned = ownTickets
    .filter((ticket) => String(ticket.assigned_to || '') === String(userId) && OPEN_TICKET_STATUSES.has(ticket.status_code))
    .map((ticket) => ({
      id: `assigned-ticket:${ticket.id}`,
      ticket_id: String(ticket.id),
      kind: 'assigned_ticket',
      title: `${ticket.folio || 'Ticket'} asignado a ti`,
      message: `${ticket.title || 'Sin título'} · ${ticket.status_name || 'En atención'}`,
      timestamp: ticket.updated_at || ticket.created_at || null,
      href: canOpenTickets ? `/tickets/tickets/${encodeURIComponent(ticket.id)}` : null,
    }));

  const assignedIds = new Set(assigned.map((item) => item.ticket_id));
  const team = teamTickets
    .filter((ticket) => !assignedIds.has(String(ticket.id)))
    .map((ticket) => ({
      id: `team-ticket:${ticket.id}`,
      ticket_id: String(ticket.id),
      kind: 'team_ticket',
      title: `${ticket.folio || 'Nuevo ticket'} para ${ticket.business_area_name || 'tu equipo'}`,
      message: ticket.title || 'Hay un ticket nuevo pendiente de atención.',
      timestamp: ticket.updated_at || ticket.created_at || null,
      href: canOpenTickets ? `/tickets/tickets/${encodeURIComponent(ticket.id)}` : null,
    }));

  return [...assigned, ...team]
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

// Igual que Legal, RH entrega los items ya en la forma final (autoservicio,
// acotado al empleado autenticado -- ver /api/rh-self/me/documents/notifications).
export async function fetchRhNotifications({ authorization, canOpenRh }) {
  try {
    const response = await fetch(rhUrl('/api/rh-self/me/documents/notifications'), {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const items = (Array.isArray(body.data) ? body.data : [])
      .map((item) => ({ ...item, module_code: 'rh', href: canOpenRh ? item.href : null }));
    return { items, sources: [{ source: 'rh', ok: true, error: null }] };
  } catch (error) {
    return { items: [], sources: [{ source: 'rh', ok: false, error: error.message }] };
  }
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
