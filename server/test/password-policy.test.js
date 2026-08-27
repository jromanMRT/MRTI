import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_MIN_LENGTH } from '../src/config/security.js';

test('la contraseña de Core admite seis caracteres como mínimo', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 6);
});
