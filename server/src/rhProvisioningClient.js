const RH_URL = process.env.MRTI_RH_URL || 'http://127.0.0.1:3004';

async function request(path, authorization, options = {}) {
  const response = await fetch(`${RH_URL}/api/rh${path}`, {
    ...options,
    headers: {
      Authorization: authorization,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `RH respondió HTTP ${response.status}`);
    error.status = response.status >= 500 ? 503 : response.status;
    throw error;
  }
  return body;
}

export function listRhPortalCandidates(authorization) {
  return request('/portal-accounts/candidates', authorization);
}

export function linkRhPortalAccounts(authorization, links) {
  return request('/portal-accounts/links', authorization, {
    method: 'POST',
    body: JSON.stringify({ links }),
  });
}

export function listRhEmployeesForAccounts(authorization) {
  return request('/portal-accounts/employees', authorization);
}

// RH es propietario del correo laboral: Core no lo escribe en su base, pide a
// RH que lo guarde y lo confirme a nombre del administrador de la sesión.
export function confirmRhWorkEmail(authorization, employeeId, email) {
  return request(`/employees/${Number(employeeId)}`, authorization, {
    method: 'PATCH',
    body: JSON.stringify({ work_email: email, verify_work_email: true }),
  });
}
