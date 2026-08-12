import { Router } from 'express';
import { authRequired } from './shared.js';
import { listDevices } from '../infraClient.js';
import { listMyAssets } from '../assetsClient.js';

export const ticketContextRouter = Router();

ticketContextRouter.get('/ticket-context', authRequired, async (req, res, next) => {
  try {
    const location = req.user.physical_area_id ? {
      area_id: req.user.physical_area_id,
      area_name: req.user.physical_area_name,
      floor_name: req.user.physical_floor_name,
      building_name: req.user.physical_building_name,
      site_id: req.user.physical_site_id,
      site_name: req.user.physical_site_name,
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
