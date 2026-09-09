import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTicketNotifications } from '../src/portal/notificationSources.js';

test('un ticket asignado con SLA vencido se marca en la campanilla sin cambiar el orden cronológico', () => {
  const items = normalizeTicketNotifications({
    ownTickets: [
      { id: 1, folio: 'MRTI-1', title: 'Impresora atascada', assigned_to: 'u1', status_code: 'IN_PROGRESS', sla_state: 'overdue', updated_at: '2026-09-01T00:00:00Z' },
      { id: 2, folio: 'MRTI-2', title: 'VPN caída', assigned_to: 'u1', status_code: 'IN_PROGRESS', sla_state: 'on_track', updated_at: '2026-09-02T00:00:00Z' },
    ],
    teamTickets: [],
    userId: 'u1',
    canOpenTickets: true,
  });
  assert.equal(items[0].id, 'assigned-ticket:2'); // sigue ordenado por fecha, no por urgencia
  assert.equal(items[1].kind, 'assigned_ticket_sla');
  assert.match(items[1].title, /^⚠️ MRTI-1/);
  assert.match(items[1].message, /SLA vencido/);
});

test('un ticket de equipo en riesgo se etiqueta distinto de uno vencido, y uno normal no lleva alerta', () => {
  const items = normalizeTicketNotifications({
    ownTickets: [],
    teamTickets: [
      { id: 3, folio: 'MRTI-3', title: 'Cuenta bloqueada', business_area_name: 'TI', status_code: 'NEW', sla_state: 'at_risk', created_at: '2026-09-01T00:00:00Z' },
      { id: 4, folio: 'MRTI-4', title: 'Alta de equipo', business_area_name: 'TI', status_code: 'NEW', sla_state: 'none', created_at: '2026-09-01T00:00:00Z' },
    ],
    userId: 'u1',
    canOpenTickets: true,
  });
  const atRisk = items.find((item) => item.ticket_id === '3');
  const normal = items.find((item) => item.ticket_id === '4');
  assert.equal(atRisk.kind, 'team_ticket_sla');
  assert.match(atRisk.message, /SLA por vencer/);
  assert.equal(normal.kind, 'team_ticket');
  assert.doesNotMatch(normal.title, /⚠️/);
});

test('un ticket asignado a otra persona no filtra su propia urgencia hacia la vista del usuario', () => {
  const items = normalizeTicketNotifications({
    ownTickets: [{ id: 5, folio: 'MRTI-5', title: 'Otro', assigned_to: 'otra-persona', status_code: 'IN_PROGRESS', sla_state: 'overdue' }],
    teamTickets: [],
    userId: 'u1',
    canOpenTickets: true,
  });
  assert.equal(items.length, 0);
});
