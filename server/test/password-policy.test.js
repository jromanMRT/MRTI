import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_MIN_LENGTH } from '../src/config/security.js';

test('la contraseña de Core requiere al menos diez caracteres', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 10);
});
