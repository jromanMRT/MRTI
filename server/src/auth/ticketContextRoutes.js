import { Router } from 'express';
import { authRequired } from './shared.js';
import { listDevices, getPhysicalArea } from '../infraClient.js';
import { listMyAssets } from '../assetsClient.js';

export const ticketContextRouter = Router();

ticketContextRouter.get('/ticket-context', authRequired, async (req, res, next) => {
  try {
    // req.user es el perfil "de identidad" (sin datos de ubicación, ver
    // findProfileIdentity en shared.js) — se resuelve aquí explícitamente.
    const physicalArea = req.user.physical_area_id
      ? await getPhysicalArea(req.user.physical_area_id, req.headers.authorization)
      : null;
    const location = physicalArea ? {
      area_id: req.user.physical_area_id,
      area_name: physicalArea.name,
      floor_name: physicalArea.floor_name,
      building_name: physicalArea.building_name,
      site_id: physicalArea.site_id,
      site_name: physicalArea.site_name,
    } : null;
    const [normalizedDevices, assignedAssets] = await Promise.all([
      req.user.physical_area_id
        ? listDevices({ areaId: req.user.physical_area_id, authorizationHeader: req.headers.authorization })
        : [],
      listMyAssets(req.headers.authorization),
    ]);
    const assignedAssetIds = new Set(assignedAssets.map((asset) => asset.asset_uid));
    res.json({
      requester_number: req.user.user_number,
      location,
      primary_device: normalizedDevices.find((device) => (
        device.asset_id && assignedAssetIds.has(device.asset_id)
      )) || null,
      area_devices: normalizedDevices,
    });
  } catch (error) {
    next(error);
  }
});
