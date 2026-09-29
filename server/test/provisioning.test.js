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

test('las fichas de RH se clasifican según la cuenta de Core con el mismo correo', async () => {
  const { classifyRhCandidates } = await import('../src/auth/provisioning.js');
  const existing = new Map([
    ['linked@mrtcorporativo.mx', { id: 'u-1', email: 'linked@mrtcorporativo.mx' }],
    ['account@mrtcorporativo.mx', { id: 'u-2', email: 'account@mrtcorporativo.mx' }],
  ]);
  const result = classifyRhCandidates([
    { employee_id: 1, full_name: ' Nueva Persona ', email: 'NUEVA@mrtcorporativo.mx ', portal_user_id: null },
    { employee_id: 2, full_name: 'Vinculada', email: 'linked@mrtcorporativo.mx', portal_user_id: 'u-1' },
    { employee_id: 3, full_name: 'Con cuenta', email: 'account@mrtcorporativo.mx', portal_user_id: null },
    { employee_id: 4, full_name: 'Conflicto', email: 'otra@mrtcorporativo.mx', portal_user_id: 'u-9' },
  ], existing);
  assert.deepEqual(result.map((item) => item.status), ['available', 'linked', 'has_account', 'conflict']);
  assert.equal(result[0].email, 'nueva@mrtcorporativo.mx');
  assert.equal(result[0].full_name, 'Nueva Persona');
  assert.equal(result[2].user_id, 'u-2');
});
