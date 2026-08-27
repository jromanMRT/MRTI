const MIN_SECRET_LENGTH = 32;
const configuredJwtSecret = String(process.env.JWT_SECRET || '').trim();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && configuredJwtSecret.length < MIN_SECRET_LENGTH) {
  throw new Error(`JWT_SECRET debe estar configurado con al menos ${MIN_SECRET_LENGTH} caracteres`);
}

export const JWT_SECRET = configuredJwtSecret || 'development-only-change-me';

const configuredOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isLocalDevelopmentOrigin(origin) {
  if (isProduction) return false;
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isPrivateNetworkOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    if (!['http:', 'https:'].includes(protocol)) return false;
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return true;
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
    const match172 = hostname.match(/^172\.(\d{1,3})\./);
    if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
    return !hostname.includes('.') || hostname.endsWith('.local');
  } catch {
    return false;
  }
}

// Las peticiones del mismo origen no incluyen Origin. En producción cualquier
// origen público cruzado debe declararse explícitamente en CORS_ORIGIN. Se
// permiten los nombres y rangos privados usados dentro de la red local.
export function validateCorsOrigin(origin, callback) {
  if (
    !origin ||
    configuredOrigins.includes(origin) ||
    isPrivateNetworkOrigin(origin) ||
    isLocalDevelopmentOrigin(origin)
  ) {
    callback(null, true);
    return;
  }
  const error = new Error('Origen no permitido por CORS');
  error.status = 403;
  callback(error);
}

export const PASSWORD_MIN_LENGTH = 6;
export const PUBLIC_REGISTRATION_ENABLED =
  String(process.env.ALLOW_PUBLIC_REGISTRATION || 'true').toLowerCase() === 'true';
