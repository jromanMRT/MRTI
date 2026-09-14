import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTemporaryPassword, selectProvisioningCandidates } from '../src/auth/provisioning.js';

test('las contraseñas temporales son fuertes, distintas y aptas para el formulario', () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();
  assert.notEqual(first, second);
  assert.ok(first.length >= 20 && first.length <= 128);
  assert.match(first, /[a-z]/i);
  assert.match(first, /\d/);
  assert.match(first, /[^a-z0-9]/i);
});

test('el aprovisionamiento dirigido selecciona únicamente al empleado solicitado', () => {
  const candidates = [{ employee_id: 10 }, { employee_id: 20 }];
  assert.deepEqual(selectProvisioningCandidates(candidates, 20), [{ employee_id: 20 }]);
  assert.deepEqual(selectProvisioningCandidates(candidates, null), candidates);
});
