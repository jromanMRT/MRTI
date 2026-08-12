import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';

const BASE_URL = process.env.CONTRACT_TEST_URL || `http://127.0.0.1:${process.env.PORT || 3005}`;
const password = 'portal-contract-test-pw';
const areaId = randomUUID();
const appId = randomUUID();
let managedAppId = null;
const viewer = { id: randomUUID(), email: `portal-viewer-${randomUUID()}@contract.test` };
const admin = { id: randomUUID(), email: `portal-admin-${randomUUID()}@contract.test` };
let viewerToken;
let adminToken;

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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
}

before(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO access_areas (id, name, description) VALUES (?, ?, ?)', [areaId, `Portal Test ${areaId}`, 'Temporal']);
  await pool.query(
    `INSERT INTO applications (id, code, name, description, url, category, features_json, status, sort_order)
     VALUES (?, 'portal-contract', 'Portal Contract', 'Aplicación temporal de contrato', '/portal-contract/', 'Pruebas', '[]', 'active', 9999)`,
    [appId]
  );
  await pool.query("INSERT INTO access_area_modules (area_id, module_code) VALUES (?, 'portal-contract')", [areaId]);
  await pool.query(
    'INSERT INTO user_profiles (id, email, password_hash, full_name, role, access_area_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1), (?, ?, ?, ?, ?, NULL, 1)',
    [viewer.id, viewer.email, passwordHash, 'Portal Viewer Fixture', 'viewer', areaId, admin.id, admin.email, passwordHash, 'Portal Admin Fixture', 'administrator']
  );
  viewerToken = await login(viewer.email);
  adminToken = await login(admin.email);
});

after(async () => {
  await pool.query('DELETE FROM audit_events WHERE actor_user_id IN (?, ?) OR entity_id IN (?, ?, ?)', [viewer.id, admin.id, appId, managedAppId || '', areaId]);
  await pool.query('DELETE FROM access_area_modules WHERE area_id = ?', [areaId]);
  await pool.query('DELETE FROM user_profiles WHERE id IN (?, ?)', [viewer.id, admin.id]);
  await pool.query('DELETE FROM applications WHERE id IN (?, ?)', [appId, managedAppId || '']);
  await pool.query('DELETE FROM access_areas WHERE id = ?', [areaId]);
  await pool.end();
});

test('catálogo requiere sesión', async () => {
  const response = await fetch(`${BASE_URL}/api/portal/v1/applications`);
  assert.equal(response.status, 401);
});

test('catálogo devuelve sólo aplicaciones permitidas', async () => {
  const response = await request('/api/portal/v1/applications', viewerToken);
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(data.map(({ code }) => code), ['portal-contract']);
});

test('permiso de módulo acepta códigos del catálogo dinámico', async () => {
  const response = await request('/api/auth/module-access/portal-contract', viewerToken);
  assert.equal(response.status, 204);
});

test('un usuario normal no administra aplicaciones', async () => {
  const response = await request('/api/portal/v1/admin/applications', viewerToken);
  assert.equal(response.status, 403);
});

test('administrador crea y actualiza una aplicación', async () => {
  const createResponse = await request('/api/portal/v1/admin/applications', adminToken, {
    method: 'POST',
    body: JSON.stringify({ code: `managed-${randomUUID()}`, name: 'Managed Test', description: 'Aplicación administrable temporal', url: '/managed-test/', category: 'Pruebas', features: ['Uno'], sort_order: 9998 }),
  });
  assert.equal(createResponse.status, 201);
  const { id } = await createResponse.json();
  managedAppId = id;
  const updateResponse = await request(`/api/portal/v1/admin/applications/${managedAppId}`, adminToken, {
    method: 'PATCH', body: JSON.stringify({ status: 'maintenance', name: 'Managed Test Updated' }),
  });
  assert.equal(updateResponse.status, 200);
  const [[row]] = await pool.query('SELECT name, status FROM applications WHERE id = ?', [managedAppId]);
  assert.deepEqual(row, { name: 'Managed Test Updated', status: 'maintenance' });
});

test('administración rechaza URLs externas', async () => {
  const response = await request('/api/portal/v1/admin/applications', adminToken, {
    method: 'POST', body: JSON.stringify({ code: 'external-test', name: 'External Test', description: 'No debe crearse', url: 'https://example.com', category: 'Pruebas' }),
  });
  assert.equal(response.status, 400);
});

test('auditoría sólo es visible para administradores', async () => {
  const forbidden = await request('/api/portal/v1/admin/audit', viewerToken);
  assert.equal(forbidden.status, 403);
  const allowed = await request('/api/portal/v1/admin/audit', adminToken);
  assert.equal(allowed.status, 200);
  const { data } = await allowed.json();
  assert.ok(data.some(({ action }) => action === 'session.login_succeeded'));
});
