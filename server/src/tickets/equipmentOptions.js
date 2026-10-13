// Solo proyecciones de lectura. Activos conserva inventario/asignaciones;
// Monitor conserva sus dispositivos. Nunca se mezclan sus identificadores.
export async function loadTicketEquipment(user, authorizationHeader, { listDevices, listAssignableAssets }) {
  if (user.role !== 'administrator') return [];
  const [assets, devices] = await Promise.all([
    listAssignableAssets(authorizationHeader),
    listDevices({ authorizationHeader }),
  ]);
  const assetIds = new Set(assets.map((asset) => asset.asset_uid));
  return [
    ...assets.filter((asset) => asset.asset_uid).map((asset) => {
      const device = devices.find((item) => item.asset_id === asset.asset_uid);
      return {
        key: `asset:${asset.asset_uid}`, asset_uid: asset.asset_uid,
        device_id: device?.id || null, internal_id: asset.internal_id,
        name: asset.name, area_name: device?.area_name || null,
      };
    }),
    ...devices.filter((device) => !device.asset_id || !assetIds.has(device.asset_id)).map((device) => ({
      key: `device:${device.id}`, asset_uid: device.asset_id || null,
      device_id: device.id, internal_id: device.internal_id,
      name: device.name, area_name: device.area_name || null,
    })),
  ];
}
