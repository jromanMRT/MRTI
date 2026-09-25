import test from 'node:test';
import assert from 'node:assert/strict';
import { dismissKeyFor } from '../src/portal/notificationDismissals.js';

test('combina id y kind para que un aviso que escala no quede oculto para siempre', () => {
  assert.equal(dismissKeyFor({ id: 'assigned-ticket:7', kind: 'assigned_ticket' }), 'assigned-ticket:7::assigned_ticket');
  assert.equal(dismissKeyFor({ id: 'assigned-ticket:7', kind: 'assigned_ticket_sla' }), 'assigned-ticket:7::assigned_ticket_sla');
});

test('usa sólo el id cuando el aviso no trae kind (RH, Legal, Activos)', () => {
  assert.equal(dismissKeyFor({ id: 'rh-doc-expiring-42' }), 'rh-doc-expiring-42');
});

test('ignora avisos sin id', () => {
  assert.equal(dismissKeyFor({}), null);
  assert.equal(dismissKeyFor({ id: '  ' }), null);
});
