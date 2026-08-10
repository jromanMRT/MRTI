const MRTI_INFRA_URL = process.env.MRTI_INFRA_URL || 'http://127.0.0.1:3002';
const TIMEOUT_MS = 3000;

// Autoservicio de MRTI-Infra (topología física y dispositivos) — Core ya no
// consulta esas tablas por SQL directo (Fase 3 de CORE_INFRA_MIGRATION_GUIDE.md).
// Las lecturas degradan a null/[] si Infra no responde: un módulo caído no
// debe tumbar el login ni el resto del dashboard personal.

async function fetchJson(path, { authorizationHeader, method = 'GET', body } = {}) {
  const response = await fetch(`${MRTI_INFRA_URL}${path}`, {
    method,
    headers: {
      ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response;
}

export async function getPhysicalArea(areaId, authorizationHeader) {
  if (!areaId) return null;
  try {
    const response = await fetchJson(`/api/self/physical-areas/${encodeURIComponent(areaId)}`, { authorizationHeader });
    if (!response.ok) return null;
    const body = await response.json();
    return body.data || null;
  } catch {
    return null;
  }
}

export async function listPhysicalAreas(authorizationHeader) {
  try {
    const response = await fetchJson('/api/self/physical-areas', { authorizationHeader });
    if (!response.ok) return [];
    const body = await response.json();
    return body.data || [];
  } catch {
    return [];
  }
}

export async function listDevices({ areaId, authorizationHeader } = {}) {
  try {
    const query = areaId ? `?area_id=${encodeURIComponent(areaId)}` : '';
    const response = await fetchJson(`/api/self/devices${query}`, { authorizationHeader });
    if (!response.ok) return [];
    const body = await response.json();
    return body.data || [];
  } catch {
    return [];
  }
}

// A diferencia de las lecturas, esta escritura no degrada en silencio: si
// Infra no responde, quien llama debe convertirlo en un error explícito.
export async function setPrimaryDevice({ userId, deviceId, userName, authorizationHeader }) {
  const response = await fetchJson(`/api/self/users/${encodeURIComponent(userId)}/primary-device`, {
    method: 'POST',
    authorizationHeader,
    body: { device_id: deviceId, user_name: userName },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `MRTI Infra respondió ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}
