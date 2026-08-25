import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';
import { validateImageContent } from '../src/portal/brandAssetRoutes.js';

const BASE_URL = process.env.CONTRACT_TEST_URL || `http://127.0.0.1:${process.env.PORT || 3005}`;
const password = 'brand-assets-contract-pw';
const viewer = { id: randomUUID(), email: `brand-viewer-${randomUUID()}@contract.test` };
const admin = { id: randomUUID(), email: `brand-admin-${randomUUID()}@contract.test` };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
let viewerToken;
let adminToken;
let assetId;

async function login(email) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

function request(path, token, options = {}) {
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
}

before(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO user_profiles (id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, 1), (?, ?, ?, ?, ?, 1)',
    [viewer.id, viewer.email, passwordHash, 'Brand Viewer Fixture', 'viewer', admin.id, admin.email, passwordHash, 'Brand Admin Fixture', 'administrator']
  );
  viewerToken = await login(viewer.email);
  adminToken = await login(admin.email);
});

after(async () => {
  if (assetId) await pool.query('DELETE FROM brand_assets WHERE id = ?', [assetId]);
  await pool.query('DELETE FROM audit_events WHERE actor_user_id IN (?, ?)', [viewer.id, admin.id]);
  await pool.query('DELETE FROM user_profiles WHERE id IN (?, ?)', [viewer.id, admin.id]);
  await pool.end();
});

test('catálogo de marca requiere sesión', async () => {
  const response = await fetch(`${BASE_URL}/api/portal/v1/brand-assets`);
  assert.equal(response.status, 401);
});

test('un usuario normal no puede subir imágenes', async () => {
  const response = await request('/api/portal/v1/admin/brand-assets?name=No%20permitido&filename=test.png', viewerToken, {
    method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png,
  });
  assert.equal(response.status, 403);
});

test('administrador sube, consulta y quita un recurso persistido', async () => {
  const upload = await request('/api/portal/v1/admin/brand-assets?name=Imagen%20temporal&description=Contrato%20de%20prueba&filename=test.png', adminToken, {
    method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png,
  });
  assert.equal(upload.status, 201);
  assetId = (await upload.json()).id;

  const list = await request('/api/portal/v1/brand-assets', viewerToken);
  assert.equal(list.status, 200);
  const { data } = await list.json();
  assert.ok(data.some(({ id, name }) => id === assetId && name === 'Imagen temporal'));

  const content = await request(`/api/portal/v1/brand-assets/${assetId}/content`, viewerToken);
  assert.equal(content.status, 200);
  assert.equal(content.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await content.arrayBuffer()), png);

  const forbiddenDelete = await request(`/api/portal/v1/admin/brand-assets/${assetId}`, viewerToken, { method: 'DELETE' });
  assert.equal(forbiddenDelete.status, 403);
  const removed = await request(`/api/portal/v1/admin/brand-assets/${assetId}`, adminToken, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  const hiddenContent = await request(`/api/portal/v1/brand-assets/${assetId}/content`, adminToken);
  assert.equal(hiddenContent.status, 404);
});

test('rechaza SVG con contenido ejecutable', () => {
  assert.throws(
    () => validateImageContent('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'unsafe.svg'),
    /imagen válida o segura/
  );
});
