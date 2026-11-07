import test from 'node:test';
import assert from 'node:assert/strict';
process.env.GOOGLE_CLIENT_ID = 'fixture-client';
process.env.GOOGLE_CLIENT_SECRET = 'fixture-secret';
process.env.GOOGLE_REDIRECT_URI = 'https://portal.test/api/auth/google/callback';
process.env.GOOGLE_ALLOWED_DOMAIN = 'example.test';
const { OAuth2Client } = await import('google-auth-library');
const { pool } = await import('../src/db.js');
const { default: express } = await import('express');
let payload, tokenExchanges = 0;
const user = { id: 'fixture', email: 'worker@example.test', google_sub: 'subject', is_active: 1, session_version: 0, role: 'viewer' };
pool.query = async (sql) => {
  if (sql.startsWith('SELECT')) return [[{ ...user }]];
  return [{ affectedRows: 1 }];
};
OAuth2Client.prototype.getToken = async function (options) {
  assert.equal(options.codeVerifier.length, 43); tokenExchanges++;
  return { tokens: { id_token: 'fixture-only' } };
};
OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => payload });
const { googleRouter } = await import('../src/auth/googleRoutes.js');
const app = express(); app.use((req, _res, next) => { req.headers.host = 'portal.test'; next(); }); app.use(express.json()); app.use('/api/auth', googleRouter);
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options, headers: { Host: 'portal.test', ...options.headers } });
async function begin() {
  const start = await request('/api/auth/google?returnTo=%2Fdashboard');
  assert.equal(start.status, 302);
  const params = new URL(start.headers.get('location')).searchParams;
  payload = { sub: 'subject', email: user.email, email_verified: true, hd: 'example.test', nonce: params.get('nonce') };
  return { state: params.get('state'), cookie: start.headers.get('set-cookie').split(';')[0] };
}
test.after(() => { server.close(); server.closeAllConnections(); });
test('browser-bound PKCE flow exchanges once without a token in the redirect URL', async () => {
  const flow = await begin();
  const response = await request(`/api/auth/google/callback?code=fixture&state=${flow.state}`, { headers: { Cookie: flow.cookie } });
  assert.equal(response.headers.get('location'), '/login?sso=complete');
  const cookie = response.headers.getSetCookie().find(c => c.startsWith('mrti_sso_completion=')).split(';')[0];
  const options = { method: 'POST', headers: { Cookie: cookie, Origin: 'https://portal.test', 'Content-Type': 'application/json' }, body: '{}' };
  const exchanged = await request('/api/auth/google/exchange', options);
  assert.equal(exchanged.status, 200); assert.ok((await exchanged.json()).token);
  assert.equal((await request('/api/auth/google/exchange', options)).status, 401);
  assert.match(response.headers.get('cache-control'), /no-store/);
});
test('missing browser cookie stops callback before contacting Google', async () => {
  const flow = await begin(); const previous = tokenExchanges;
  const response = await request(`/api/auth/google/callback?code=fixture&state=${flow.state}`);
  assert.match(response.headers.get('location'), /error=/);
  assert.equal(tokenExchanges, previous);
});
test('nonce mismatch and conflicting Google subject never complete login', async () => {
  for (const kind of ['nonce', 'subject']) {
    const flow = await begin();
    if (kind === 'nonce') payload.nonce = 'wrong';
    else user.google_sub = 'different-subject';
    const response = await request(`/api/auth/google/callback?code=fixture&state=${flow.state}`, { headers: { Cookie: flow.cookie } });
    assert.match(response.headers.get('location'), /error=/);
    user.google_sub = 'subject';
  }
});
test('exchange rejects cross-origin and non-JSON requests', async () => {
  for (const headers of [{ Origin: 'https://evil.test', 'Content-Type': 'application/json' }, { Origin: 'https://portal.test' }]) {
    assert.equal((await request('/api/auth/google/exchange', { method: 'POST', headers, body: '{}' })).status, 403);
  }
});
