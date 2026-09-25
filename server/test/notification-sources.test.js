import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTicketNotifications } from '../src/portal/notificationSources.js';

test('normaliza asignaciones y evita duplicar el mismo ticket del equipo', () => {
  const items = normalizeTicketNotifications({
    userId: 'user-1',
    canOpenTickets: true,
    ownTickets: [{ id: 7, folio: 'TK-7', title: 'Impresora', assigned_to: 'user-1', status_code: 'ASSIGNED', status_name: 'Asignado', updated_at: '2026-08-30T10:00:00Z' }],
    teamTickets: [
      { id: 7, folio: 'TK-7', title: 'Impresora', business_area_name: 'TI', updated_at: '2026-08-30T10:00:00Z' },
      { id: 8, folio: 'TK-8', title: 'Acceso', business_area_name: 'TI', updated_at: '2026-08-30T11:00:00Z' },
    ],
  });
  assert.deepEqual(items.map(({ id }) => id), ['team-ticket:8', 'assigned-ticket:7']);
  assert.equal(items[0].href, '/tickets/tickets/8');
});

test('oculta enlaces operativos cuando el usuario no puede abrir Tickets', () => {
  const [item] = normalizeTicketNotifications({
    userId: 'user-1',
    canOpenTickets: false,
    ownTickets: [{ id: 9, folio: 'TK-9', title: 'Red', assigned_to: 'user-1', status_code: 'OPEN' }],
  });
  assert.equal(item.href, null);
});

test('omite tickets cerrados de las asignaciones personales', () => {
  const items = normalizeTicketNotifications({
    userId: 'user-1',
    canOpenTickets: true,
    ownTickets: [{ id: 10, assigned_to: 'user-1', status_code: 'CLOSED' }],
  });
  assert.deepEqual(items, []);
});

test('avisa a quien reportó el ticket cuando se resuelve, se reabre o esperan su respuesta', () => {
  const recent = new Date(Date.now() - 1000).toISOString();
  const items = normalizeTicketNotifications({
    userId: 'user-2',
    canOpenTickets: false,
    ownTickets: [
      { id: 11, folio: 'TK-11', title: 'Falla de red', requester_id: 'user-2', status_code: 'RESOLVED', updated_at: recent },
      { id: 12, folio: 'TK-12', title: 'Acceso a sistema', requester_id: 'user-2', status_code: 'ON_HOLD_USER', updated_at: recent },
      { id: 13, folio: 'TK-13', title: 'Todavía en curso', requester_id: 'user-2', status_code: 'IN_PROGRESS', updated_at: recent },
    ],
  });
  assert.deepEqual(items.map(({ id }) => id).sort(), ['requester-ticket:11', 'requester-ticket:12']);
  // Sin acceso al módulo completo (el caso normal de quien sólo reporta),
  // el enlace lleva a "Mis tickets" en el home de Core, no al detalle operativo.
  assert.ok(items.every((item) => item.href === '/#tickets-dashboard'));
});

test('deja de avisar sobre un ticket resuelto hace más de una semana', () => {
  const items = normalizeTicketNotifications({
    userId: 'user-2',
    ownTickets: [{ id: 14, requester_id: 'user-2', status_code: 'RESOLVED', updated_at: '2020-01-01T00:00:00Z' }],
  });
  assert.deepEqual(items, []);
});

test('no duplica el aviso cuando el propio solicitante también es el asignado', () => {
  // ON_HOLD_USER está en ambos conjuntos (sigue "abierto" para quien lo
  // atiende y a la vez necesita respuesta de quien lo reportó); si es la
  // misma persona debe salir una sola vez, no dos.
  const recent = new Date(Date.now() - 1000).toISOString();
  const items = normalizeTicketNotifications({
    userId: 'user-3',
    canOpenTickets: true,
    ownTickets: [{ id: 15, folio: 'TK-15', requester_id: 'user-3', assigned_to: 'user-3', status_code: 'ON_HOLD_USER', updated_at: recent }],
  });
  assert.deepEqual(items.map(({ id }) => id), ['assigned-ticket:15']);
});
