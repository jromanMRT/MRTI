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
