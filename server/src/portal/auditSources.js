const SOURCES = [
  { code: 'rh', url: () => `${process.env.MRTI_RH_URL || 'http://127.0.0.1:3004'}/api/rh/audit-events` },
  { code: 'activos', url: () => `${process.env.MRTI_ASSETS_URL || 'http://127.0.0.1:3003'}/api/activos/audit-events` },
  { code: 'mrti-obs', url: () => `${process.env.MRTI_OBS_URL || process.env.MRTI_INFRA_URL || 'http://127.0.0.1:3002'}/api/audit-events` },
  { code: 'tickets', url: () => `${process.env.MRTI_TICKETS_URL || 'http://127.0.0.1:4000'}/api/audit-events` },
];

export async function fetchRemoteAuditEvents(authorization, limit = 200) {
  const settled = await Promise.all(SOURCES.map(async (source) => {
    try {
      const response = await fetch(`${source.url()}?limit=${limit}`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      return { source: source.code, ok: true, data: Array.isArray(body.data) ? body.data : [] };
    } catch (error) {
      return { source: source.code, ok: false, error: error.message, data: [] };
    }
  }));
  return {
    data: settled.flatMap((result) => result.data),
    sources: settled.map(({ source, ok, error }) => ({ source, ok, error: error || null })),
  };
}

export function filterAndSortAuditEvents(events, query = {}) {
  const moduleCode = String(query.module || '').trim().toLowerCase();
  const term = String(query.q || '').trim().toLocaleLowerCase('es-MX');
  const from = query.from ? new Date(`${query.from}T00:00:00`).getTime() : null;
  const to = query.to ? new Date(`${query.to}T23:59:59.999`).getTime() : null;
  return events.filter((event) => {
    if (moduleCode && String(event.module_code || '').toLowerCase() !== moduleCode) return false;
    const timestamp = new Date(event.created_at).getTime();
    if (from && timestamp < from) return false;
    if (to && timestamp > to) return false;
    if (term) {
      const haystack = `${event.actor_name || ''} ${event.actor_email || ''} ${event.action || ''} ${event.entity_type || ''} ${event.entity_id || ''} ${event.module_code || ''}`.toLocaleLowerCase('es-MX');
      if (!haystack.includes(term)) return false;
    }
    return true;
  }).sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}
