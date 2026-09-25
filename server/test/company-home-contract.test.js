import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';

const BASE_URL = process.env.CONTRACT_TEST_URL || `http://127.0.0.1:${process.env.PORT || 3005}`;
const password = 'company-home-contract-pw';
const viewer = { id: randomUUID(), email: `home-viewer-${randomUUID()}@contract.test` };
const rhUser = { id: randomUUID(), email: `home-rh-${randomUUID()}@contract.test` };
const rhAreaId = randomUUID();
let viewerToken;
let rhToken;
let originalSettings;

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
    headers: token ? { Authorization: `Bearer ${token}`, ...(options.headers || {}) } : options.headers,
  });
}

before(async () => {
  const [[row]] = await pool.query('SELECT * FROM company_home_settings WHERE id = 1');
  originalSettings = row;

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO user_profiles (id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    [viewer.id, viewer.email, passwordHash, 'Home Viewer Fixture', 'viewer']
  );
  viewerToken = await login(viewer.email);

  await pool.query('INSERT INTO access_areas (id, name, is_active) VALUES (?, ?, 1)', [rhAreaId, `Home RH Fixture Area ${rhAreaId}`]);
  await pool.query('INSERT INTO access_area_modules (area_id, module_code) VALUES (?, ?)', [rhAreaId, 'rh']);
  await pool.query(
    'INSERT INTO user_profiles (id, email, password_hash, full_name, role, access_area_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [rhUser.id, rhUser.email, passwordHash, 'Home RH Fixture', 'viewer', rhAreaId]
  );
  rhToken = await login(rhUser.email);
});

after(async () => {
  if (originalSettings) {
    await pool.query(
      `UPDATE company_home_settings
          SET hero_eyebrow = ?, hero_title = ?, hero_subtitle = ?, hero_body = ?, facts_json = ?,
              news_section_eyebrow = ?, news_section_title = ?, footer_tagline = ?, updated_by_user_id = ?
        WHERE id = 1`,
      [
        originalSettings.hero_eyebrow, originalSettings.hero_title, originalSettings.hero_subtitle,
        originalSettings.hero_body, JSON.stringify(originalSettings.facts_json),
        originalSettings.news_section_eyebrow, originalSettings.news_section_title, originalSettings.footer_tagline,
        originalSettings.updated_by_user_id,
      ]
    );
  }
  await pool.query('DELETE FROM audit_events WHERE actor_user_id IN (?, ?)', [viewer.id, rhUser.id]);
  await pool.query('DELETE FROM user_profiles WHERE id IN (?, ?)', [viewer.id, rhUser.id]);
  await pool.query('DELETE FROM access_area_modules WHERE area_id = ?', [rhAreaId]);
  await pool.query('DELETE FROM access_areas WHERE id = ?', [rhAreaId]);
  await pool.end();
});

test('la configuración del home es pública, sin token', async () => {
  const response = await request('/api/portal/v1/company-home');
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.ok(typeof data.hero_title === 'string');
  assert.ok(Array.isArray(data.facts));
});

test('un usuario normal no puede editar la portada', async () => {
  const response = await request('/api/portal/v1/admin/company-home', viewerToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hero_eyebrow: 'x', hero_title: 'y', hero_subtitle: '', hero_body: 'z', facts: [] }),
  });
  assert.equal(response.status, 403);
});

test('un usuario con acceso a RH edita el hero y los datos, y el cambio se refleja en la respuesta pública', async () => {
  const response = await request('/api/portal/v1/admin/company-home', rhToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hero_eyebrow: 'Aviso de prueba',
      hero_title: 'Título de prueba',
      hero_subtitle: 'Subtítulo de prueba',
      hero_body: 'Cuerpo de prueba del hero',
      facts: [{ label: 'Dato', value: 'Valor de prueba' }],
    }),
  });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.hero_title, 'Título de prueba');
  assert.deepEqual(data.facts, [{ label: 'Dato', value: 'Valor de prueba' }]);

  const publicView = await request('/api/portal/v1/company-home');
  const { data: publicData } = await publicView.json();
  assert.equal(publicData.hero_title, 'Título de prueba');
});

test('rechaza más de 8 datos y campos vacíos', async () => {
  const tooMany = await request('/api/portal/v1/admin/company-home', rhToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hero_eyebrow: 'x', hero_title: 'y', hero_subtitle: '', hero_body: 'z',
      facts: Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
    }),
  });
  assert.equal(tooMany.status, 400);

  const emptyTitle = await request('/api/portal/v1/admin/company-home', rhToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hero_eyebrow: 'x', hero_title: '   ', hero_subtitle: '', hero_body: 'z', facts: [] }),
  });
  assert.equal(emptyTitle.status, 400);
});

test('edita el encabezado de noticias y el pie de página, y también se refleja en público', async () => {
  const response = await request('/api/portal/v1/admin/company-home', rhToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hero_eyebrow: 'x', hero_title: 'y', hero_subtitle: '', hero_body: 'z', facts: [],
      news_section_eyebrow: 'Avisos de prueba', news_section_title: 'Sección de prueba', footer_tagline: 'Pie de prueba',
    }),
  });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.news_section_eyebrow, 'Avisos de prueba');
  assert.equal(data.news_section_title, 'Sección de prueba');
  assert.equal(data.footer_tagline, 'Pie de prueba');

  const publicView = await request('/api/portal/v1/company-home');
  const { data: publicData } = await publicView.json();
  assert.equal(publicData.footer_tagline, 'Pie de prueba');
});

test('una pantalla que no envía los campos nuevos no los borra', async () => {
  const withNewFields = await request('/api/portal/v1/admin/company-home', rhToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hero_eyebrow: 'x', hero_title: 'y', hero_subtitle: '', hero_body: 'z', facts: [],
      news_section_eyebrow: 'Se conserva', news_section_title: 'Se conserva también', footer_tagline: 'Pie que se conserva',
    }),
  });
  assert.equal(withNewFields.status, 200);

  const partialUpdate = await request('/api/portal/v1/admin/company-home', rhToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hero_eyebrow: 'x2', hero_title: 'y2', hero_subtitle: '', hero_body: 'z2', facts: [] }),
  });
  assert.equal(partialUpdate.status, 200);
  const { data } = await partialUpdate.json();
  assert.equal(data.news_section_eyebrow, 'Se conserva');
  assert.equal(data.news_section_title, 'Se conserva también');
  assert.equal(data.footer_tagline, 'Pie que se conserva');
});
