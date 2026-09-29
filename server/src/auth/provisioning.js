import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { confirmRhWorkEmail, linkRhPortalAccounts, listRhEmployeesForAccounts, listRhPortalCandidates } from '../rhProvisioningClient.js';

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

export const CORPORATE_EMAIL_PATTERN = /^[^@\s]+@mrtcorporativo\.mx$/;

// Clasifica cada empleado activo de RH para el selector del alta individual:
// "available" se crea con el correo que ya confirmó RH; "needs_email" requiere
// que el administrador capture su correo corporativo; el resto se muestra para
// explicar por qué no se puede crear.
export function classifyRhEmployees(employees, existingByEmail, existingIds) {
  return employees.map((employee) => {
    const email = employee.email ? String(employee.email).trim().toLowerCase() : null;
    const user = email ? existingByEmail.get(email) : null;
    let status;
    if (employee.portal_user_id) status = existingIds.has(employee.portal_user_id) ? 'linked' : 'conflict';
    else if (employee.email_state !== 'trusted' || !email) status = 'needs_email';
    else status = user ? 'has_account' : 'available';
    return {
      employee_id: employee.employee_id,
      employee_number: employee.employee_number || null,
      full_name: String(employee.full_name || '').trim(),
      job_title: employee.job_title || null,
      department_name: employee.department_name || null,
      email: employee.email_state === 'trusted' ? email : null,
      // Correo corporativo compartido con otra ficha: se sugiere, pero sólo se
      // usa si el administrador lo confirma para esta persona.
      suggested_email: employee.email_state === 'duplicate' ? email : null,
      email_state: employee.email_state,
      status,
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
  const source = await listRhEmployeesForAccounts(authorization);
  const employees = Array.isArray(source.data) ? source.data : [];
  const emails = [...new Set(employees.map((item) => String(item.email || '').trim().toLowerCase()).filter(Boolean))];
  const ids = [...new Set(employees.map((item) => item.portal_user_id).filter(Boolean))];
  const existingIds = new Set();
  if (ids.length) {
    const [rows] = await pool.query(`SELECT id FROM user_profiles WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    rows.forEach((row) => existingIds.add(row.id));
  }
  return { data: classifyRhEmployees(employees, await findUsersByEmail(emails), existingIds) };
}

// Captura y confirma en RH el correo corporativo de un empleado que aún no lo
// tiene, justo antes de aprovisionarlo. Se rechaza si el correo ya pertenece a
// una cuenta de Core, para no vincular la ficha a la identidad de otra persona.
export async function confirmWorkEmailForProvisioning(authorization, employeeId, rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!CORPORATE_EMAIL_PATTERN.test(email)) {
    const error = new Error('El correo debe terminar exactamente en @mrtcorporativo.mx');
    error.status = 400;
    throw error;
  }
  const existing = await findUsersByEmail([email]);
  if (existing.size) {
    const error = new Error('Ya existe una cuenta de la plataforma con ese correo');
    error.status = 409;
    throw error;
  }
  await confirmRhWorkEmail(authorization, employeeId, email);
  return email;
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
