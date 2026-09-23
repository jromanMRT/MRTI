import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAssetNotifications } from '../src/portal/notificationSources.js';

test('omite la consulta de Activos para una cuenta sin acceso al módulo', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('no debe consultarse'); };
  try {
    const result = await fetchAssetNotifications({ authorization: 'Bearer test', canOpenAssets: false });
    assert.equal(called, false);
    assert.deepEqual(result.items, []);
    assert.equal(result.sources[0].skipped, true);
  } finally { global.fetch = originalFetch; }
});

test('conserva el contrato de Activos y etiqueta el módulo para la campanilla', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(url, /:3003\/api\/activos-suite\/license-notifications$/);
    assert.equal(options.headers.Authorization, 'Bearer session');
    assert.ok(options.signal);
    return Response.json({ data: [{ id: 'asset-license:antivirus:1', title: 'Antivirus por vencer', message: 'Vence en 10 días.', href: '/activos/alertas?tipo=antivirus' }] });
  };
  try {
    const result = await fetchAssetNotifications({ authorization: 'Bearer session', canOpenAssets: true });
    assert.equal(result.items[0].module_code, 'activos');
    assert.equal(result.items[0].href, '/activos/alertas?tipo=antivirus');
    assert.equal(result.sources[0].ok, true);
  } finally { global.fetch = originalFetch; }
});

test('una caída de Activos degrada sólo esa fuente', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('offline'); };
  try {
    const result = await fetchAssetNotifications({ authorization: 'Bearer session', canOpenAssets: true });
    assert.deepEqual(result.items, []);
    assert.equal(result.sources[0].ok, false);
    assert.match(result.sources[0].error, /offline/);
  } finally { global.fetch = originalFetch; }
});
