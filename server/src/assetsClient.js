const MRTI_ASSETS_URL = process.env.MRTI_ASSETS_URL || 'http://127.0.0.1:3003';
const TIMEOUT_MS = 3000;

async function request(path, { authorizationHeader, method = 'GET', body } = {}) {
  const response = await fetch(`${MRTI_ASSETS_URL}${path}`, {
    method,
    headers: {
      ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `MRTI Activos respondió ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function listAssignableAssets(authorizationHeader) {
  try {
    const body = await request('/api/activos/assignment-options', { authorizationHeader });
    return body.data || [];
  } catch {
    return [];
  }
}

export async function listMyAssets(authorizationHeader) {
  try {
    const body = await request('/api/activos-self/me', { authorizationHeader });
    return body.data || [];
  } catch {
    return [];
  }
}

export async function setPrimaryAsset({ userId, assetId, userName, authorizationHeader }) {
  return request('/api/activos/primary-assignment', {
    authorizationHeader,
    method: 'POST',
    body: { portal_user_id: userId, asset_id: assetId, user_name: userName },
  });
}
