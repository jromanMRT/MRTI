import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDanielProjectRouter } from '../src/portal/danielProjectRoutes.js';

let server, base, root;
const authenticate = (req, res, next) => {
  const role = req.headers['x-test-role'];
  if (!role) return res.status(401).json({ error: 'No autenticado' });
  req.user = { role };
  next();
};
const get = (suffix = '', role = 'administrator') => fetch(`${base}/api/portal/v1/daniel-projects${suffix}`, { headers: role ? { 'x-test-role': role } : {} });
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'daniel-projects-test-'));
  await writeFile(path.join(root, 'ABRIR-PROYECTOS.html'), '<!doctype html><head></head><body>Dashboard</body>');
  const app = express();
  app.use('/api/portal/v1', createDanielProjectRouter({ authenticate, root }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
});
test('catálogo y archivos exigen sesión y administrador', async () => {
  for (const suffix of ['', '/content?file=ABRIR-PROYECTOS.html']) {
    assert.equal((await get(suffix, null)).status, 401);
    assert.equal((await get(suffix, 'viewer')).status, 403);
  }
});
test('el catálogo sólo enumera las 29 páginas autorizadas', async () => {
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { files } = await response.json();
  assert.equal(files.length, 29);
  assert.ok(files.every((file) => file.endsWith('.html') && !file.includes('..')));
});
test('el HTML se entrega como JSON, sin ejecución directa ni caché', async () => {
  const response = await get('/content?file=ABRIR-PROYECTOS.html');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match((await response.json()).html, /Dashboard/);
});
test('bloquea rutas fuera de lista y parámetros ambiguos', async () => {
  for (const query of ['file=../server/.env', 'file=/etc/passwd', 'file=LEEME.txt', 'file=ABRIR-PROYECTOS.html&file=otro.html']) {
    assert.equal((await get(`/content?${query}`)).status, 404);
  }
});
test('un archivo autorizado faltante responde 404', async () => {
  assert.equal((await get('/content?file=05_Executive-meeting/index.html')).status, 404);
});
test('rechaza enlaces simbólicos fuera del directorio', async () => {
  const outside = await mkdtemp(path.join(tmpdir(), 'daniel-outside-test-'));
  try {
    const file = path.join(outside, 'private.html');
    await writeFile(file, 'privado');
    await rm(path.join(root, 'ABRIR-PROYECTOS.html'));
    await symlink(file, path.join(root, 'ABRIR-PROYECTOS.html'));
    assert.equal((await get('/content?file=ABRIR-PROYECTOS.html')).status, 404);
  } finally { await rm(outside, { recursive: true, force: true }); }
});
