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

test('los empleados de RH se clasifican según su correo y la cuenta de Core', async () => {
  const { classifyRhEmployees } = await import('../src/auth/provisioning.js');
  const existing = new Map([['account@mrtcorporativo.mx', { id: 'u-2', email: 'account@mrtcorporativo.mx' }]]);
  const result = classifyRhEmployees([
    { employee_id: 1, full_name: ' Nueva Persona ', email: 'NUEVA@mrtcorporativo.mx ', email_state: 'trusted', portal_user_id: null },
    { employee_id: 2, full_name: 'Vinculada', email: null, email_state: 'none', portal_user_id: 'u-1' },
    { employee_id: 3, full_name: 'Con cuenta', email: 'account@mrtcorporativo.mx', email_state: 'trusted', portal_user_id: null },
    { employee_id: 4, full_name: 'Vínculo roto', email: null, email_state: 'none', portal_user_id: 'u-9' },
    { employee_id: 5, full_name: 'Sin correo', email: null, email_state: 'none', portal_user_id: null },
    { employee_id: 6, full_name: 'Duplicado', email: 'comun@mrtcorporativo.mx', email_state: 'duplicate', portal_user_id: null },
  ], existing, new Set(['u-1']));
  assert.deepEqual(result.map((item) => item.status), ['available', 'linked', 'has_account', 'conflict', 'needs_email', 'needs_email']);
  assert.equal(result[0].email, 'nueva@mrtcorporativo.mx');
  assert.equal(result[0].full_name, 'Nueva Persona');
  assert.equal(result[5].email, null);
  assert.equal(result[5].suggested_email, 'comun@mrtcorporativo.mx');
});

test('sólo se acepta capturar correos del dominio corporativo exacto', async () => {
  const { CORPORATE_EMAIL_PATTERN } = await import('../src/auth/provisioning.js');
  assert.ok(CORPORATE_EMAIL_PATTERN.test('ana.lopez@mrtcorporativo.mx'));
  assert.ok(!CORPORATE_EMAIL_PATTERN.test('ana@mrtcorporativo.mx.evil.com'));
  assert.ok(!CORPORATE_EMAIL_PATTERN.test('ana@otro.mx'));
  assert.ok(!CORPORATE_EMAIL_PATTERN.test('ana lopez@mrtcorporativo.mx'));
});
