import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';

const BASE_URL = process.env.CONTRACT_TEST_URL || `http://127.0.0.1:${process.env.PORT || 3005}`;
const password = 'company-news-contract-pw';
const viewer = { id: randomUUID(), email: `news-viewer-${randomUUID()}@contract.test` };
const admin = { id: randomUUID(), email: `news-admin-${randomUUID()}@contract.test` };
const rhUser = { id: randomUUID(), email: `news-rh-${randomUUID()}@contract.test` };
const rhAreaId = randomUUID();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
let viewerToken;
let adminToken;
let rhToken;
const createdNewsIds = [];

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
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO user_profiles (id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, 1), (?, ?, ?, ?, ?, 1)',
    [viewer.id, viewer.email, passwordHash, 'News Viewer Fixture', 'viewer', admin.id, admin.email, passwordHash, 'News Admin Fixture', 'administrator']
  );
  viewerToken = await login(viewer.email);
  adminToken = await login(admin.email);

  await pool.query('INSERT INTO access_areas (id, name, is_active) VALUES (?, ?, 1)', [rhAreaId, `News RH Fixture Area ${rhAreaId}`]);
  await pool.query('INSERT INTO access_area_modules (area_id, module_code) VALUES (?, ?)', [rhAreaId, 'rh']);
  await pool.query(
    'INSERT INTO user_profiles (id, email, password_hash, full_name, role, access_area_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [rhUser.id, rhUser.email, passwordHash, 'News RH Fixture', 'viewer', rhAreaId]
  );
  rhToken = await login(rhUser.email);
});

after(async () => {
  if (createdNewsIds.length) {
    await pool.query(`DELETE FROM company_news WHERE id IN (${createdNewsIds.map(() => '?').join(',')})`, createdNewsIds);
  }
  await pool.query('DELETE FROM audit_events WHERE actor_user_id IN (?, ?, ?)', [viewer.id, admin.id, rhUser.id]);
  await pool.query('DELETE FROM user_profiles WHERE id IN (?, ?, ?)', [viewer.id, admin.id, rhUser.id]);
  await pool.query('DELETE FROM access_area_modules WHERE area_id = ?', [rhAreaId]);
  await pool.query('DELETE FROM access_areas WHERE id = ?', [rhAreaId]);
  await pool.end();
});

test('el listado de noticias es público, sin token', async () => {
  const response = await request('/api/portal/v1/company-news');
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.ok(Array.isArray(data));
});

test('un usuario normal no puede publicar una noticia', async () => {
  const response = await request('/api/portal/v1/admin/company-news', viewerToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Intento no autorizado', body: 'Contenido' }),
  });
  assert.equal(response.status, 403);
});

test('sin token tampoco se puede publicar', async () => {
  const response = await fetch(`${BASE_URL}/api/portal/v1/admin/company-news`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x', body: 'y' }),
  });
  assert.equal(response.status, 401);
});

test('un administrador publica una noticia visible sin sesión, con adjunto descargable por cualquiera', async () => {
  const created = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Aviso general', body: 'Contenido del aviso de prueba' }),
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  createdNewsIds.push(id);

  const attach = await request(`/api/portal/v1/admin/company-news/${id}/attachment?filename=circular.png`, adminToken, {
    method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png,
  });
  assert.equal(attach.status, 201);

  const publicList = await request('/api/portal/v1/company-news');
  const { data } = await publicList.json();
  const item = data.find((entry) => entry.id === id);
  assert.ok(item, 'la noticia debe verse sin sesión');
  assert.equal(item.title, 'Aviso general');
  assert.equal(item.author_name, undefined, 'el público no debe ver quién la escribió');
  assert.equal(item.attachment.original_filename, 'circular.png');

  const download = await fetch(`${BASE_URL}${item.attachment.content_url}`);
  assert.equal(download.status, 200);
  const downloaded = Buffer.from(await download.arrayBuffer());
  assert.ok(downloaded.equals(png));
});

test('sólo quien administra noticias ve el autor y los datos de edición', async () => {
  const created = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Aviso con autoría', body: 'Contenido' }),
  });
  const { id } = await created.json();
  createdNewsIds.push(id);

  const asManager = await request('/api/portal/v1/company-news', adminToken);
  const managerItem = (await asManager.json()).data.find((entry) => entry.id === id);
  assert.equal(managerItem.author_name, 'News Admin Fixture');
  assert.equal(managerItem.updated_at, null);
  assert.equal(managerItem.updated_by_name, null);

  const asViewer = await request('/api/portal/v1/company-news', viewerToken);
  const viewerItem = (await asViewer.json()).data.find((entry) => entry.id === id);
  assert.equal(viewerItem.author_name, undefined);

  const asPublic = await request('/api/portal/v1/company-news');
  const publicItem = (await asPublic.json()).data.find((entry) => entry.id === id);
  assert.equal(publicItem.author_name, undefined);
  assert.equal(publicItem.updated_at, undefined);
});

test('editar una noticia registra quién y cuándo, visible sólo para quien administra', async () => {
  const created = await request('/api/portal/v1/admin/company-news', rhToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Título original', body: 'Cuerpo original' }),
  });
  const { id } = await created.json();
  createdNewsIds.push(id);

  const forbidden = await request(`/api/portal/v1/admin/company-news/${id}`, viewerToken, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x', body: 'y' }),
  });
  assert.equal(forbidden.status, 403);

  const edited = await request(`/api/portal/v1/admin/company-news/${id}`, adminToken, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Título editado', body: 'Cuerpo editado' }),
  });
  assert.equal(edited.status, 200);

  const asManager = await request('/api/portal/v1/company-news', adminToken);
  const item = (await asManager.json()).data.find((entry) => entry.id === id);
  assert.equal(item.title, 'Título editado');
  assert.equal(item.body, 'Cuerpo editado');
  assert.equal(item.updated_by_name, 'News Admin Fixture');
  assert.ok(item.updated_at, 'debe registrar la hora de edición');

  const asPublic = await request('/api/portal/v1/company-news');
  const publicItem = (await asPublic.json()).data.find((entry) => entry.id === id);
  assert.equal(publicItem.title, 'Título editado');
  assert.equal(publicItem.updated_at, undefined);
});

test('rechaza editar con título o cuerpo vacío', async () => {
  const created = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Aviso a editar mal', body: 'Contenido' }),
  });
  const { id } = await created.json();
  createdNewsIds.push(id);

  const emptyTitle = await request(`/api/portal/v1/admin/company-news/${id}`, adminToken, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '  ', body: 'y' }),
  });
  assert.equal(emptyTitle.status, 400);
});

test('rechaza un tipo de archivo no permitido', async () => {
  const created = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Aviso con adjunto inválido', body: 'Contenido' }),
  });
  const { id } = await created.json();
  createdNewsIds.push(id);

  const attach = await request(`/api/portal/v1/admin/company-news/${id}/attachment?filename=virus.exe`, adminToken, {
    method: 'POST', headers: { 'Content-Type': 'application/x-msdownload' }, body: Buffer.from('MZ'),
  });
  assert.equal(attach.status, 415);
});

test('un administrador quita una noticia y desaparece del listado público; un usuario normal no puede', async () => {
  const created = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Aviso a quitar', body: 'Contenido' }),
  });
  const { id } = await created.json();
  createdNewsIds.push(id);

  const forbidden = await request(`/api/portal/v1/admin/company-news/${id}`, viewerToken, { method: 'DELETE' });
  assert.equal(forbidden.status, 403);

  const removed = await request(`/api/portal/v1/admin/company-news/${id}`, adminToken, { method: 'DELETE' });
  assert.equal(removed.status, 200);

  const publicList = await request('/api/portal/v1/company-news');
  const { data } = await publicList.json();
  assert.ok(!data.some((entry) => entry.id === id));
});

test('un usuario con acceso al módulo RH también puede publicar, reordenar y quitar noticias', async () => {
  const created = await request('/api/portal/v1/admin/company-news', rhToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Aviso desde RH', body: 'Contenido publicado por RH' }),
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  createdNewsIds.push(id);

  const removed = await request(`/api/portal/v1/admin/company-news/${id}`, rhToken, { method: 'DELETE' });
  assert.equal(removed.status, 200);
});

test('reordenar noticias cambia el orden del listado público y rechaza órdenes incompletos', async () => {
  const first = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Orden A', body: 'Contenido A' }),
  });
  const { id: idA } = await first.json();
  createdNewsIds.push(idA);
  const second = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Orden B', body: 'Contenido B' }),
  });
  const { id: idB } = await second.json();
  createdNewsIds.push(idB);

  const before = await request('/api/portal/v1/company-news');
  const { data: beforeData } = await before.json();
  const activeIds = beforeData.map((item) => item.id);

  const incomplete = await request('/api/portal/v1/admin/company-news/order', rhToken, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: [idA] }),
  });
  assert.equal(incomplete.status, 400);

  const reordered = [idB, idA, ...activeIds.filter((id) => id !== idA && id !== idB)];
  const forbidden = await request('/api/portal/v1/admin/company-news/order', viewerToken, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: reordered }),
  });
  assert.equal(forbidden.status, 403);

  const applied = await request('/api/portal/v1/admin/company-news/order', rhToken, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: reordered }),
  });
  assert.equal(applied.status, 200);

  const after = await request('/api/portal/v1/company-news');
  const { data: afterData } = await after.json();
  assert.equal(afterData[0].id, idB);
  assert.equal(afterData[1].id, idA);
});

test('el histórico sólo es visible para quien administra y permite restaurar', async () => {
  const created = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Aviso para el histórico', body: 'Contenido' }),
  });
  const { id } = await created.json();
  createdNewsIds.push(id);
  await request(`/api/portal/v1/admin/company-news/${id}`, adminToken, { method: 'DELETE' });

  const forbidden = await request('/api/portal/v1/admin/company-news/archived', viewerToken);
  assert.equal(forbidden.status, 403);

  const archivedList = await request('/api/portal/v1/admin/company-news/archived', adminToken);
  assert.equal(archivedList.status, 200);
  const { data } = await archivedList.json();
  const item = data.find((entry) => entry.id === id);
  assert.ok(item, 'debe aparecer en el histórico');
  assert.equal(item.archived_by_name, 'News Admin Fixture');
  assert.ok(item.archived_at);

  const restoreForbidden = await request(`/api/portal/v1/admin/company-news/${id}/restore`, viewerToken, { method: 'PUT' });
  assert.equal(restoreForbidden.status, 403);

  const restored = await request(`/api/portal/v1/admin/company-news/${id}/restore`, rhToken, { method: 'PUT' });
  assert.equal(restored.status, 200);

  const publicList = await request('/api/portal/v1/company-news');
  const { data: publicData } = await publicList.json();
  assert.ok(publicData.some((entry) => entry.id === id), 'debe volver a verse en la portada tras restaurar');

  const archivedAfterRestore = await request('/api/portal/v1/admin/company-news/archived', adminToken);
  const { data: archivedData } = await archivedAfterRestore.json();
  assert.ok(!archivedData.some((entry) => entry.id === id), 'ya no debe seguir en el histórico');
});

test('el adjunto de una noticia archivada no es descargable públicamente, sólo por quien administra', async () => {
  const created = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Aviso archivado con imagen', body: 'Contenido' }),
  });
  const { id } = await created.json();
  createdNewsIds.push(id);
  await request(`/api/portal/v1/admin/company-news/${id}/attachment?filename=cover.png`, adminToken, {
    method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png,
  });
  await request(`/api/portal/v1/admin/company-news/${id}`, adminToken, { method: 'DELETE' });

  const archivedList = await request('/api/portal/v1/admin/company-news/archived', adminToken);
  const item = (await archivedList.json()).data.find((entry) => entry.id === id);
  const contentUrl = item.attachment.content_url;

  const publicAttempt = await fetch(`${BASE_URL}${contentUrl}`);
  assert.equal(publicAttempt.status, 404);

  const managerAttempt = await request(contentUrl, adminToken);
  assert.equal(managerAttempt.status, 200);
});

test('el detalle de una noticia es público, oculta autoría al público, la muestra a quien administra, y 404 si está archivada o no existe', async () => {
  const created = await request('/api/portal/v1/admin/company-news', adminToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Aviso con página propia', body: 'Contenido completo del aviso' }),
  });
  const { id } = await created.json();
  createdNewsIds.push(id);

  const publicDetail = await request(`/api/portal/v1/company-news/${id}`);
  assert.equal(publicDetail.status, 200);
  const { data: publicData } = await publicDetail.json();
  assert.equal(publicData.title, 'Aviso con página propia');
  assert.equal(publicData.author_name, undefined);

  const managerDetail = await request(`/api/portal/v1/company-news/${id}`, adminToken);
  const { data: managerData } = await managerDetail.json();
  assert.equal(managerData.author_name, 'News Admin Fixture');

  const missing = await request(`/api/portal/v1/company-news/${randomUUID()}`);
  assert.equal(missing.status, 404);

  await request(`/api/portal/v1/admin/company-news/${id}`, adminToken, { method: 'DELETE' });
  const afterArchive = await request(`/api/portal/v1/company-news/${id}`);
  assert.equal(afterArchive.status, 404);
});
