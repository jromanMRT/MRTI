import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { sessionIsCurrent, revokeToken, tokenHash } from '../src/auth/sessionSecurity.js';
import { authRequired, signToken } from '../src/auth/shared.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config/security.js';

const revoked = new Set();
const profile = { id: 'fixture', role: 'viewer', is_active: true, session_version: 0, access_area_id: null };
pool.query = async (sql, args) => {
  if (sql.startsWith('INSERT IGNORE INTO revoked_session_tokens')) { revoked.add(args[0]); return [{}]; }
  if (sql.startsWith('DELETE FROM revoked_session_tokens')) return [{}];
  if (sql.includes('FROM revoked_session_tokens')) return [revoked.has(args[0]) ? [{ token_hash: args[0] }] : []];
  if (sql.includes('FROM user_profiles')) return [[{ ...profile }]];
  return [[]];
};
async function authorized(token) {
  let status = 0;
  const res = { status(n) { status = n; return this; }, json() {} };
  await authRequired({ headers: { authorization: `Bearer ${token}` } }, res, () => { status = 200; });
  return status;
}

test('logout revokes only the presented JWT, including legacy tokens', async () => {
  for (const token of [signToken('fixture'), jwt.sign({ sub: 'fixture' }, JWT_SECRET, { expiresIn: '1h' })]) {
    const claims = jwt.verify(token, JWT_SECRET);
    assert.equal(await authorized(token), 200);
    await revokeToken(token, claims);
    assert.equal(await authorized(token), 401);
    assert.equal(await authorized(signToken('fixture')), 200);
    assert.equal(revoked.has(tokenHash(token)), true);
  }
});
test('credential-version change invalidates all previous sessions, preserves new login', async () => {
  const old = signToken('fixture', 0);
  const legacy = jwt.sign({ sub: 'fixture', jti: 'legacy-version-test' }, JWT_SECRET, { expiresIn: '1h' });
  profile.session_version = 1;
  assert.equal(await authorized(old), 401);
  assert.equal(await authorized(legacy), 401);
  assert.equal(await authorized(signToken('fixture', 1)), 200);
});
test('deactivated account, expired tokens and database failure fail closed', async () => {
  profile.is_active = false;
  assert.equal(await authorized(signToken('fixture', 1)), 401);
  profile.is_active = true;
  assert.equal(await authorized(jwt.sign({ sub: 'fixture', sv: 1 }, JWT_SECRET, { expiresIn: -1 })), 401);
  const original = pool.query;
  pool.query = async () => { throw new Error('fixture DB down'); };
  assert.equal(await authorized(signToken('fixture', 1)), 503);
  pool.query = original;
  assert.equal(await sessionIsCurrent('fixture', { exp: 1 }, profile), false);
});
