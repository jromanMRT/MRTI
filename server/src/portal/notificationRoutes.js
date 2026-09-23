import { Router } from 'express';
import { authRequired } from '../auth/shared.js';
import { fetchAssetNotifications, fetchTicketNotifications, fetchLegalNotifications, fetchRhNotifications } from './notificationSources.js';

export const notificationRouter = Router();

notificationRouter.get('/notifications', authRequired, async (req, res, next) => {
  try {
    const [tickets, legal, rh, assets] = await Promise.all([
      fetchTicketNotifications({
        authorization: req.headers.authorization,
        userId: req.user.id,
        canOpenTickets: req.user.role === 'administrator' || req.user.allowed_modules?.includes('tickets'),
      }),
      fetchLegalNotifications({
        authorization: req.headers.authorization,
        canOpenLegal: req.user.role === 'administrator' || req.user.allowed_modules?.includes('mrti-legal'),
      }),
      fetchRhNotifications({
        authorization: req.headers.authorization,
        canOpenRh: req.user.role === 'administrator' || req.user.allowed_modules?.includes('rh'),
      }),
      fetchAssetNotifications({
        authorization: req.headers.authorization,
        canOpenAssets: req.user.role === 'administrator' || req.user.allowed_modules?.includes('activos'),
      }),
    ]);
    const items = [...tickets.items, ...legal.items, ...rh.items, ...assets.items]
      .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime());
    const sources = [...tickets.sources, ...legal.sources, ...rh.sources, ...assets.sources];
    if (sources.every((source) => !source.ok)) {
      return res.status(502).json({ error: 'No fue posible consultar las notificaciones en este momento' });
    }
    return res.json({
      data: items,
      count: items.length,
      generated_at: new Date().toISOString(),
      sources,
    });
  } catch (error) {
    return next(error);
  }
});
