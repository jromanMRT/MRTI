import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTicketEquipment } from '../src/tickets/equipmentOptions.js';

test('sólo administrador consulta los catálogos completos', async () => {
  for (const role of ['viewer', 'technician', 'supervisor', undefined]) {
    const fail = () => { throw new Error('No debe consultar inventario global'); };
    assert.deepEqual(await loadTicketEquipment({ role }, 'Bearer test', { listDevices: fail, listAssignableAssets: fail }), []);
  }
});
test('activos ajenos y sin área se incluyen; vínculo con Monitor no duplica ni confunde IDs', async () => {
  const result = await loadTicketEquipment({ role: 'administrator', physical_area_id: null }, 'Bearer test', {
    listAssignableAssets: async (header) => {
      assert.equal(header, 'Bearer test');
      return [{ id: 999, asset_uid: 'asset-other', internal_id: 'TI-002', name: 'Laptop ajena', assigned_user_id: 'other', secret: 'omit' }, { id: 4, asset_uid: 'unmonitored', internal_id: 'TI-003', name: 'Impresora' }];
    },
    listDevices: async (options) => {
      assert.deepEqual(options, { authorizationHeader: 'Bearer test' });
      return [{ id: 'monitor-id', asset_id: 'asset-other', name: 'old name', area_name: 'Otra área' }, { id: 'router', name: 'Router', internal_id: 'OBS-1' }];
    },
  });
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], { key: 'asset:asset-other', asset_uid: 'asset-other', device_id: 'monitor-id', internal_id: 'TI-002', name: 'Laptop ajena', area_name: 'Otra área' });
  assert.equal(result[1].device_id, null);
  assert.equal(result[2].key, 'device:router');
  assert.equal(result[2].asset_uid, null);
});
test('catálogo no disponible no inventa opciones ni bloquea el contexto', async () => {
  assert.deepEqual(await loadTicketEquipment({ role: 'administrator' }, '', { listAssignableAssets: async () => [], listDevices: async () => [] }), []);
});
