import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPolicy, ORGANIZATIONAL_LAYERS, ORGANIZATIONAL_LAYER_LABELS } from '../src/auth/accessPolicy.js';

const p = { id: 'u', role: 'viewer', allowed_modules: ['rh'], is_active: true };

test('las seis capas tienen identificador y etiqueta', () => {
  assert.deepEqual(ORGANIZATIONAL_LAYERS, ['C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6']);
  for (const layer of ORGANIZATIONAL_LAYERS) assert.match(ORGANIZATIONAL_LAYER_LABELS[layer], new RegExp(`^${layer} `));
});

test('sin política de capa el resultado es idéntico al anterior', () => {
  const before = applyPolicy(p, { rh: { level: 'read' } }, {}, ['rh', 'activos']);
  const after = applyPolicy(p, { rh: { level: 'read' } }, {}, ['rh', 'activos'], {});
  assert.deepEqual(after, before);
});

test('la capa concede un módulo activo y fija su nivel inicial', () => {
  const effective = applyPolicy(p, {}, {}, ['rh', 'activos'], { activos: { access: true, level: 'read' } });
  assert.deepEqual(effective.allowed_modules, ['rh', 'activos']);
  assert.equal(effective.access_policy.activos.level, 'read');
});

test('el rol prevalece sobre la capa y el usuario sobre ambos', () => {
  const layer = { rh: { level: 'write', sections: { people: 'write', payroll: 'read' } } };
  const role = { rh: { level: 'read', sections: { people: 'read' } } };
  const user = { rh: { sections: { people: 'full' } } };
  const effective = applyPolicy(p, role, user, ['rh'], layer);
  assert.equal(effective.access_policy.rh.level, 'read');
  assert.equal(effective.access_policy.rh.sections.people, 'full');
  assert.equal(effective.access_policy.rh.sections.payroll, 'read');
});

test('la capa prevalece sobre el nivel inicial de los roles nuevos', () => {
  const effective = applyPolicy({ ...p, role: 'auditor' }, {}, {}, ['rh'], { rh: { level: 'write' } });
  assert.equal(effective.access_policy.rh.level, 'write');
});

test('una capa puede retirar un módulo que el área permitía', () => {
  const effective = applyPolicy(p, {}, {}, ['rh'], { rh: { access: false } });
  assert.deepEqual(effective.allowed_modules, []);
});

test('el administrador global ignora la política de capa', () => {
  const effective = applyPolicy({ ...p, role: 'administrator' }, {}, {}, ['rh'], { rh: { access: false } });
  assert.deepEqual(effective.allowed_modules, ['rh']);
  assert.deepEqual(effective.access_policy, {});
});
