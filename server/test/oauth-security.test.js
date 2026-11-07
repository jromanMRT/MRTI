import test from 'node:test';
import assert from 'node:assert/strict';
import { createOneTimeStore, randomSecret, sameSecret, safeReturnTo, validateGoogleIdentity, canLinkGoogleAccount, readCookie } from '../src/auth/oauthSecurity.js';

test('OAuth state is unpredictable, single-use, bounded and expires', () => {
  let now = 0;
  const store = createOneTimeStore({ ttlMs: 100, limit: 1, now: () => now });
  const key = store.put({ marker: true });
  assert.equal(key.length, 43);
  assert.throws(() => store.put({}));
  assert.equal(store.take('attacker'), null);
  assert.deepEqual(store.take(key), { marker: true });
  assert.equal(store.take(key), null);
  const expired = store.put({}); now = 101;
  assert.equal(store.take(expired), null);
});
test('browser binding rejects absent, mismatched and malformed secrets', () => {
  const secret = randomSecret();
  assert.equal(sameSecret(secret, secret), true);
  for (const other of ['', randomSecret(), undefined, 'é'.repeat(43)]) assert.equal(sameSecret(secret, other), false);
  assert.equal(readCookie({ headers: { cookie: 'state=a; state=b' } }, 'state'), '');
});
test('return destinations never leave the portal', () => {
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/\r\nevil', null]) assert.equal(safeReturnTo(value), '/dashboard');
  assert.equal(safeReturnTo('/agent-core/?a=1#x'), '/agent-core/?a=1#x');
});
test('Google linking requires verified email, hosted domain and consistent subject', () => {
  const payload = { sub: 'stable-id', email: 'worker@example.test', email_verified: true, hd: 'example.test' };
  const id = validateGoogleIdentity(payload, 'example.test');
  assert.equal(canLinkGoogleAccount({ email: id.email, google_sub: null }, id), true);
  assert.equal(canLinkGoogleAccount({ email: id.email, google_sub: 'different' }, id), false);
  assert.throws(() => validateGoogleIdentity({ ...payload, email_verified: false }, 'example.test'));
  assert.throws(() => validateGoogleIdentity({ ...payload, hd: undefined }, 'example.test'));
  assert.throws(() => validateGoogleIdentity({ ...payload, hd: 'attacker.test' }, 'example.test'));
  const unhosted = validateGoogleIdentity({ ...payload, hd: undefined }, '');
  assert.equal(canLinkGoogleAccount({ email: id.email }, unhosted), false);
});
