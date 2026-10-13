import { Router } from 'express';
import { authRequired } from '../auth/shared.js';
import { propagationHeaders } from '../vendor/mrti-platform/request-context.js';

export const portalSearchRouter = Router();

function moduleUrl(base, path) {
  return `${(process.env[base] || '').replace(/\/$/, '') || ({
    MRTI_TICKETS_URL: 'http://127.0.0.1:4000',
    MRTI_RH_URL: 'http://127.0.0.1:3004',
    MRTI_ASSETS_URL: 'http://127.0.0.1:3003',
  }[base])}${path}`;
}

function matches(value, query) {
  return String(value || '').toLocaleLowerCase().includes(query);
}

async function fetchSource(name, url, authorization) {
  try {
    const response = await fetch(url, {
      headers: propagationHeaders({ Authorization: authorization }),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) {
      console.warn('Búsqueda del portal: fuente no disponible', { source: name, status: response.status });
      return { source: name, ok: false, data: [] };
    }
    const body = await response.json();
    return { source: name, ok: true, data: Array.isArray(body.data) ? body.data : [] };
  } catch (error) {
    console.warn('Búsqueda del portal: fuente no disponible', { source: name, message: error.message });
    return { source: name, ok: false, data: [] };
  }
}

portalSearchRouter.get('/search', authRequired, async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim().slice(0, 100);
    if (query.length < 2) {
      return res.status(400).json({ error: 'Escribe al menos dos caracteres para buscar' });
    }

    const canOpenRh = req.user.role === 'administrator' || req.user.allowed_modules?.includes('rh');
    const [tickets, assets, requisitions, employees] = await Promise.all([
      fetchSource('tickets', moduleUrl('MRTI_TICKETS_URL', '/api/tickets-self/me'), req.headers.authorization),
      fetchSource('assets', moduleUrl('MRTI_ASSETS_URL', '/api/activos-self/me'), req.headers.authorization),
      fetchSource('requisitions', moduleUrl('MRTI_RH_URL', '/api/rh-self/me/requisitions/tracking'), req.headers.authorization),
      canOpenRh
        ? fetchSource('employees', moduleUrl('MRTI_RH_URL', `/api/rh/employees?q=${encodeURIComponent(query)}&limit=8`), req.headers.authorization)
        : Promise.resolve({ source: 'employees', ok: true, skipped: true, data: [] }),
    ]);
    const sources = [tickets, assets, requisitions, employees];
    const attemptedSources = sources.filter((source) => !source.skipped);
    if (attemptedSources.every((source) => !source.ok)) {
      return res.status(502).json({ error: 'No fue posible consultar la búsqueda en este momento', sources });
    }

    const normalizedQuery = query.toLocaleLowerCase();
    const results = [
      ...tickets.data
        .filter((ticket) => matches(ticket.folio, normalizedQuery))
        .map((ticket) => ({
          type: 'ticket',
          id: String(ticket.id),
          title: ticket.folio || 'Ticket',
          detail: ticket.title || 'Ticket personal',
          href: req.user.role === 'administrator' || req.user.allowed_modules?.includes('tickets')
            ? `/tickets/tickets/${encodeURIComponent(ticket.id)}`
            : null,
        })),
      ...requisitions.data
        .filter((item) => matches(item.folio, normalizedQuery))
        .map((item) => ({
          type: 'requisition',
          id: String(item.id),
          title: item.folio || 'Requisición',
          detail: item.position_name || 'Requisición de personal',
        })),
      ...assets.data
        .filter((asset) => matches(asset.cod_activo_fijo, normalizedQuery)
          || matches(asset.numero_serie, normalizedQuery))
        .map((asset) => ({
          type: 'asset',
          id: String(asset.id),
          title: asset.cod_activo_fijo || asset.numero_serie || 'Activo',
          detail: [asset.descripcion, asset.marca, asset.modelo].filter(Boolean).join(' · ') || 'Activo asignado',
          href: req.user.role === 'administrator' || req.user.allowed_modules?.includes('activos') ? '/activos/' : null,
        })),
      ...employees.data.slice(0, 8).map((employee) => ({
        type: 'employee',
        id: String(employee.id),
        title: [employee.first_name, employee.last_name_p, employee.last_name_m].filter(Boolean).join(' '),
        detail: [employee.employee_number, employee.job_title, employee.department_name].filter(Boolean).join(' · '),
        href: '/rh/',
      })),
    ].slice(0, 12);

    return res.json({ data: results, sources, partial: sources.some((source) => !source.ok) });
  } catch (error) {
    return next(error);
  }
});
