import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from './shared.js';

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
    const [devices] = req.user.physical_area_id
      ? await pool.query(
        `SELECT id, internal_id, name, inventory_tag, ip_address, assigned_user_id,
                is_primary_user_device
           FROM devices
          WHERE area_id = ? AND is_active = 1
          ORDER BY internal_id, name`,
        [req.user.physical_area_id]
      )
      : [[]];
    const normalizedDevices = devices.map((device) => ({
      ...device,
      is_primary_user_device: Boolean(device.is_primary_user_device),
    }));
    res.json({
      requester_number: req.user.user_number,
      location,
      primary_device: normalizedDevices.find((device) => (
        device.assigned_user_id === req.user.id && device.is_primary_user_device
      )) || null,
      area_devices: normalizedDevices,
    });
  } catch (error) {
    next(error);
  }
});
