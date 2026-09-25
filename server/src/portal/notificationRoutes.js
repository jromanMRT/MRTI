import { Router } from 'express';
import { authRequired } from '../auth/shared.js';
import { fetchAssetNotifications, fetchTicketNotifications, fetchLegalNotifications, fetchRhNotifications } from './notificationSources.js';
import { dismissKeyFor, dismissNotifications, fetchDismissedKeys } from './notificationDismissals.js';

export const notificationRouter = Router();

notificationRouter.get('/notifications', authRequired, async (req, res, next) => {
  try {
    const [tickets, legal, rh, assets, dismissed] = await Promise.all([
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
      fetchDismissedKeys(req.user.id),
    ]);
    const items = [...tickets.items, ...legal.items, ...rh.items, ...assets.items]
      .filter((item) => !dismissed.has(dismissKeyFor(item)))
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

// El usuario decide qué tan "vista" da una novedad -- una o varias a la vez
// (botón individual y "Descartar todas"). No hay verbo DELETE porque no se
// borra el ticket/documento, sólo se anota que ya se revisó.
notificationRouter.post('/notifications/dismiss', authRequired, async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'Indica al menos una notificación a descartar' });
    }
    const dismissedCount = await dismissNotifications(req.user.id, items);
    return res.json({ dismissed: dismissedCount });
  } catch (error) {
    return next(error);
  }
});
