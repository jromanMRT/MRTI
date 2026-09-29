import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { listRhPortalCandidates, linkRhPortalAccounts } from '../rhProvisioningClient.js';

export function generateTemporaryPassword() {
  return `${randomBytes(18).toString('base64url')}!7a`;
}

// dryRun sólo lee -- ni escribe user_profiles ni llama a RH para vincular
// expedientes -- para que el botón "Aprovisionar desde RH" pueda mostrar a
// quién se va a crear antes de que exista de verdad, en vez de un
// window.confirm() de una sola línea sobre una acción irreversible.
export function selectProvisioningCandidates(candidates, employeeId) {
  if (employeeId === null || employeeId === undefined) return candidates;
  return candidates.filter((candidate) => Number(candidate.employee_id) === Number(employeeId));
}

// Clasifica cada ficha de RH para el selector del alta individual: sólo las
// "available" se pueden crear; el resto se muestran para explicar por qué no.
export function classifyRhCandidates(candidates, existingByEmail) {
  return candidates.map((candidate) => {
    const email = String(candidate.email || '').trim().toLowerCase();
    const user = existingByEmail.get(email);
    let status = 'available';
    if (candidate.portal_user_id && (!user || user.id !== candidate.portal_user_id)) status = 'conflict';
    else if (user && candidate.portal_user_id === user.id) status = 'linked';
    else if (user) status = 'has_account';
    return {
      employee_id: candidate.employee_id,
      full_name: String(candidate.full_name || '').trim(),
      email,
      status,
      user_id: user?.id || null,
    };
  });
}

async function findUsersByEmail(emails) {
  const existingByEmail = new Map();
  if (!emails.length) return existingByEmail;
  const [existing] = await pool.query(
    `SELECT id, email FROM user_profiles WHERE email IN (${emails.map(() => '?').join(',')})`,
    emails
  );
  existing.forEach((user) => existingByEmail.set(user.email.toLowerCase(), user));
  return existingByEmail;
}

export async function listRhCandidatesForAccounts(authorization) {
  const source = await listRhPortalCandidates(authorization);
  const candidates = Array.isArray(source.data) ? source.data : [];
  const emails = [...new Set(candidates.map((item) => String(item.email || '').trim().toLowerCase()))];
  return {
    data: classifyRhCandidates(candidates, await findUsersByEmail(emails)),
    ambiguous: Array.isArray(source.ambiguous) ? source.ambiguous.length : 0,
  };
}

// account sólo aplica al alta de un solo empleado (employeeId): permite que el
// administrador elija rol, área, estado y, opcionalmente, la contraseña
// temporal. Sin account se conserva el comportamiento masivo (viewer, sin área).
export async function provisionRhUsers(authorization, { dryRun = false, employeeId = null, account = null } = {}) {
  const source = await listRhPortalCandidates(authorization);
  const allCandidates = Array.isArray(source.data) ? source.data : [];
  const candidates = selectProvisioningCandidates(allCandidates, employeeId);
  if (employeeId !== null && employeeId !== undefined && candidates.length !== 1) {
    const error = new Error('El empleado no tiene un correo corporativo único o confirmado en RH');
    error.status = 409;
    throw error;
  }
  const emails = [...new Set(candidates.map((item) => String(item.email || '').trim().toLowerCase()))];
  const existingByEmail = await findUsersByEmail(emails);
  const settings = employeeId !== null && employeeId !== undefined && account ? account : {};
  const role = settings.role || 'viewer';
  const accessAreaId = settings.accessAreaId || null;
  const isActive = settings.isActive === false ? 0 : 1;

  if (dryRun) {
    const toCreate = [];
    const conflicts = [];
    let existingCount = 0;
    for (const candidate of candidates) {
      const email = String(candidate.email || '').trim().toLowerCase();
      const user = existingByEmail.get(email);
      if (candidate.portal_user_id && (!user || user.id !== candidate.portal_user_id)) {
        conflicts.push({ email, reason: 'existing_rh_link_mismatch' });
        continue;
      }
      if (!user) toCreate.push({ full_name: candidate.full_name, email });
      else existingCount += 1;
    }
    return {
      dryRun: true,
      toCreate,
      existing: existingCount,
      ambiguous: employeeId === null ? (Array.isArray(source.ambiguous) ? source.ambiguous : []) : [],
      conflicts,
    };
  }

  const credentials = [];
  const links = [];
  const conflicts = [];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const candidate of candidates) {
      const email = String(candidate.email || '').trim().toLowerCase();
      let user = existingByEmail.get(email);
      if (candidate.portal_user_id && (!user || user.id !== candidate.portal_user_id)) {
        conflicts.push({ email, reason: 'existing_rh_link_mismatch' });
        continue;
      }
      if (!user) {
        const id = randomUUID();
        const temporaryPassword = settings.password || generateTemporaryPassword();
        await connection.query(
          `INSERT INTO user_profiles
            (id,email,password_hash,password_change_required,full_name,role,access_area_id,physical_area_id,is_active)
           VALUES (?,?,?,1,?,?,?,NULL,?)`,
          [id, email, await bcrypt.hash(temporaryPassword, 10), String(candidate.full_name || '').trim(), role, accessAreaId, isActive]
        );
        user = { id, email };
        existingByEmail.set(email, user);
        // Si el administrador escribió la contraseña ya la conoce: no se
        // devuelve de nuevo en la respuesta.
        credentials.push({ id, full_name: candidate.full_name, email, temporary_password: settings.password ? null : temporaryPassword });
      }
      links.push({ employee_id: candidate.employee_id, user_id: user.id, email });
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const linked = links.length ? await linkRhPortalAccounts(authorization, links) : { linked: 0, conflicts: [] };
  return {
    created: credentials,
    existing: links.length - credentials.length,
    linked: linked.linked,
    ambiguous: employeeId === null ? (Array.isArray(source.ambiguous) ? source.ambiguous : []) : [],
    conflicts: [...conflicts, ...(linked.conflicts || [])],
  };
}
