// Fase 1 de la migración Core/Infra (ver MRTI/docs/architecture/CORE_INFRA_MIGRATION_GUIDE.md):
// verifica que MRTI Core replica exactamente el contrato de /api/auth/* que hoy
// vive en Infra. Corre contra el proceso real (pm2 `mrti-core-api`, puerto de
// server/.env) para no divergir de lo que ya consumen MRTI, Activos, RH y
// Tickets contra Infra. Usa dos usuarios desechables insertados/borrados
// directamente en la base — nunca credenciales ni datos de empleados reales —
// así que puede repetirse sin dejar residuo.
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';

const BASE_URL = process.env.CONTRACT_TEST_URL || `http://127.0.0.1:${process.env.PORT || 3005}`;
const FIXTURE_PASSWORD = 'phase0-contract-test-pw';

const viewer = { id: randomUUID(), email: `phase0-viewer-${randomUUID()}@contract.test` };
const admin = { id: randomUUID(), email: `phase0-admin-${randomUUID()}@contract.test` };

async function insertFixture({ id, email }, role) {
  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
  await pool.query(
    'INSERT INTO user_profiles (id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    [id, email, passwordHash, 'Fase 0 Contract Fixture', role]
  );
}

async function login(email) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: FIXTURE_PASSWORD }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.token, 'login debe devolver token');
  return body.token;
}

let viewerToken;
let adminToken;

before(async () => {
  await insertFixture(viewer, 'viewer');
  await insertFixture(admin, 'administrator');
  viewerToken = await login(viewer.email);
  adminToken = await login(admin.email);
});

after(async () => {
  await pool.query(
    'DELETE FROM audit_events WHERE actor_user_id IN (?, ?) OR actor_email IN (?, ?)',
    [viewer.id, admin.id, viewer.email, admin.email]
  );
  await pool.query('DELETE FROM user_profiles WHERE id IN (?, ?)', [viewer.id, admin.id]);
  await pool.end();
});

test('POST /api/auth/login — credenciales inválidas => 401', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: viewer.email, password: 'contraseña-incorrecta' }),
  });
  assert.equal(response.status, 401);
});

test('GET /api/auth/me — sin token => 401', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/me`);
  assert.equal(response.status, 401);
});

test('GET /api/auth/me — token inválido/alterado => 401', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: 'Bearer esto-no-es-un-jwt-valido' },
  });
  assert.equal(response.status, 401);
});

test('GET /api/auth/me — sesión válida => 200 con el perfil propio', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.profile.id, viewer.id);
});

test('GET /api/auth/module-access/:code — módulo desconocido => 404', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/module-access/no-existe`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(response.status, 404);
});

test('GET /api/auth/module-access/:code — viewer sin área asignada => 403 MODULE_FORBIDDEN', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/module-access/rh`, {
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, 'MODULE_FORBIDDEN');
});

test('GET /api/auth/module-access/:code — administrator => 204 (acceso total)', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/module-access/mrti-obs`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(response.status, 204);
});

test('GET /api/auth/module-access/mrti-infra — alias heredado => 204', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/module-access/mrti-infra`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(response.status, 204);
});

test('GET /api/auth/access-control — no administrador => 403', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/access-control`, {
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert.equal(response.status, 403);
});

test('GET /api/auth/access-control — administrator => 200 con la forma esperada', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/access-control`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  for (const key of ['areas', 'modules', 'users', 'physical_areas', 'devices']) {
    assert.ok(key in body, `access-control debe incluir "${key}"`);
  }
});

test('GET /api/auth/assignees — incluye a cualquier usuario activo aunque aún no tenga acceso a Tickets', async () => {
  const response = await fetch(`${BASE_URL}/api/auth/assignees`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.data.some((person) => person.id === viewer.id && person.role === 'viewer'));
});
