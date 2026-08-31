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
