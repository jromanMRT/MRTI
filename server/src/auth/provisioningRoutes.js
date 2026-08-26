import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from './shared.js';
import { provisionRhUsers } from './provisioning.js';
import { recordAudit } from '../audit.js';

export const provisioningRouter = Router();

provisioningRouter.get('/password-status', authRequired, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT password_change_required FROM user_profiles WHERE id = ? LIMIT 1',
      [req.user.id],
    );
    res.json({ required: Boolean(rows[0]?.password_change_required) });
  } catch (error) {
    next(error);
  }
});

provisioningRouter.post('/users/provision-rh', authRequired, async (req, res, next) => {
  try {
    if (req.user.role !== 'administrator') return res.status(403).json({ error: 'Sólo un administrador puede aprovisionar usuarios' });
    const result = await provisionRhUsers(req.headers.authorization);
    await recordAudit({
      req,
      action: 'users.provisioned_from_rh',
      entityType: 'user',
      metadata: {
        created: result.created.length,
        existing: result.existing,
        linked: result.linked,
        ambiguous: result.ambiguous.length,
        conflicts: result.conflicts.length,
      },
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
