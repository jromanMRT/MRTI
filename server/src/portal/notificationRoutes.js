import { Router } from 'express';
import { authRequired } from '../auth/shared.js';
import { fetchTicketNotifications } from './notificationSources.js';

export const notificationRouter = Router();

notificationRouter.get('/notifications', authRequired, async (req, res, next) => {
  try {
    const result = await fetchTicketNotifications({
      authorization: req.headers.authorization,
      userId: req.user.id,
      canOpenTickets: req.user.role === 'administrator' || req.user.allowed_modules?.includes('tickets'),
    });
    if (result.sources.every((source) => !source.ok)) {
      return res.status(502).json({ error: 'No fue posible consultar las notificaciones en este momento' });
    }
    return res.json({
      data: result.items,
      count: result.items.length,
      generated_at: new Date().toISOString(),
      sources: result.sources,
    });
  } catch (error) {
    return next(error);
  }
});
