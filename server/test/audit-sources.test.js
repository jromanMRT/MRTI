import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAndSortAuditEvents } from '../src/portal/auditSources.js';
import { sanitizeAuditMetadata } from '../src/audit.js';

test('consolidación filtra por módulo, texto y ordena por fecha', () => {
  const events = [
    { module_code: 'rh', actor_name: 'Ana', action: 'positions.updated', entity_type: 'positions', entity_id: '1', created_at: '2026-08-25T10:00:00Z' },
    { module_code: 'activos', actor_name: 'Luis', action: 'assets.created', entity_type: 'assets', entity_id: '2', created_at: '2026-08-26T10:00:00Z' },
  ];
  assert.deepEqual(filterAndSortAuditEvents(events, { module: 'rh', q: 'ana' }), [events[0]]);
  assert.deepEqual(filterAndSortAuditEvents(events, {}).map((event) => event.module_code), ['activos', 'rh']);
});

test('Core redacta secretos en cualquier profundidad', () => {
  assert.deepEqual(sanitizeAuditMetadata({ action: 'update', nested: { password: 'x', role: 'viewer' } }), { action: 'update', nested: { password: '[REDACTADO]', role: 'viewer' } });
});
