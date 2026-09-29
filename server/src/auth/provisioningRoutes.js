import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, USER_ROLES } from './shared.js';
import { listRhCandidatesForAccounts, provisionRhUsers } from './provisioning.js';
import { PASSWORD_MIN_LENGTH } from '../config/security.js';
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

// Fichas de RH para el alta individual desde el Centro de control; RH sigue
// siendo propietario del nombre y correo, Core sólo cruza con sus cuentas.
provisioningRouter.get('/users/rh-candidates', authRequired, async (req, res, next) => {
  try {
    if (req.user.role !== 'administrator') return res.status(403).json({ error: 'Sólo un administrador puede consultar expedientes de RH' });
    res.json(await listRhCandidatesForAccounts(req.headers.authorization));
  } catch (error) {
    next(error);
  }
});

// Valida la configuración opcional de la cuenta en un alta individual. Regresa
// null si no se envió nada (comportamiento anterior) o un mensaje de error.
async function parseAccountSettings(body) {
  const hasSettings = ['role', 'access_area_id', 'is_active', 'password'].some((key) => body?.[key] !== undefined);
  if (!hasSettings) return { account: null };
  const role = String(body.role || 'viewer');
  if (!USER_ROLES.includes(role)) return { error: 'Rol no válido' };
  const accessAreaId = body.access_area_id || null;
  if (accessAreaId) {
    const [[area]] = await pool.query('SELECT id FROM access_areas WHERE id = ? AND is_active = 1', [accessAreaId]);
    if (!area) return { error: 'El área seleccionada no existe o está inactiva' };
  }
  const password = body.password ? String(body.password) : '';
  if (password && (password.length < PASSWORD_MIN_LENGTH || password.length > 128)) {
    return { error: `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y 128 caracteres` };
  }
  return { account: { role, accessAreaId, isActive: body.is_active !== false, password: password || null } };
}

provisioningRouter.post('/users/provision-rh', authRequired, async (req, res, next) => {
  try {
    if (req.user.role !== 'administrator') return res.status(403).json({ error: 'Sólo un administrador puede aprovisionar usuarios' });
    const dryRun = req.body?.dry_run === true;
    const employeeId = req.body?.employee_id === undefined ? null : Number(req.body.employee_id);
    if (employeeId !== null && (!Number.isInteger(employeeId) || employeeId < 1)) {
      return res.status(400).json({ error: 'employee_id no es válido' });
    }
    const { account, error: accountError } = await parseAccountSettings(req.body);
    if (accountError) return res.status(400).json({ error: accountError });
    if (account && employeeId === null) return res.status(400).json({ error: 'El rol y el área sólo se pueden elegir al crear la cuenta de un solo empleado' });
    const result = await provisionRhUsers(req.headers.authorization, { dryRun, employeeId, account });
    if (!dryRun) {
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
          employee_id: employeeId,
          ...(account ? { role: account.role, access_area_id: account.accessAreaId, is_active: account.isActive } : {}),
        },
      });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});
