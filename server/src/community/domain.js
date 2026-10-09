import { createHmac, createHash, randomUUID, randomInt, timingSafeEqual } from 'node:crypto';
export const CATEGORIES = ['queja', 'denuncia', 'sugerencia'];
export const STATUSES = ['received', 'reviewing', 'resolved', 'spam'];
export const fail = (status, message) => Object.assign(new Error(message), { status });
export const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
export function text(value, label, max, min = 0) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw fail(400, `${label}: usa entre ${min} y ${max} caracteres.`);
  return value.trim();
}
export function normalizeReport(body = {}) {
  if (!CATEGORIES.includes(body.category)) throw fail(400, 'Selecciona el tipo de mensaje.');
  return { category: body.category, subject: text(body.subject, 'Asunto', 160, 5), body: text(body.body, 'Descripción', 5000, 20) };
}
export function normalizePoll(body = {}, now = Date.now()) {
  const question = text(body.question, 'Pregunta', 240, 5);
  if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 6) throw fail(400, 'Agrega entre 2 y 6 opciones.');
  const options = body.options.map(v => text(v, 'Opción', 120, 1));
  if (new Set(options.map(v => v.toLocaleLowerCase('es-MX'))).size !== options.length) throw fail(400, 'Las opciones deben ser distintas.');
  if (typeof body.closes_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.closes_at)) throw fail(400, 'Indica una fecha de cierre válida.');
  const end = Date.parse(body.closes_at);
  if (!Number.isFinite(end) || end <= now || end > now + 366 * 86400000) throw fail(400, 'El cierre debe ser futuro, dentro de un año.');
  return { question, options, closes_at: new Date(end).toISOString().slice(0,19).replace('T',' ') };
}
export function normalizeSettings(body = {}) {
  if (typeof body.reports_enabled !== 'boolean') throw fail(400, 'Indica si el canal está abierto.');
  const result = { reports_enabled: body.reports_enabled };
  for (const [key, max] of [['hourly_limit',100],['daily_limit',500],['global_daily_limit',5000]]) {
    if (!Number.isInteger(body[key]) || body[key] < 1 || body[key] > max) throw fail(400, `Límite inválido: ${key} (1–${max}).`);
    result[key] = body[key];
  }
  if (result.daily_limit < result.hourly_limit || result.global_daily_limit < result.daily_limit) throw fail(400, 'El límite diario debe cubrir al horario, y el global al diario.');
  return result;
}
export function createChallengeService(secret, now = () => Date.now()) {
  const sign = v => createHmac('sha256', secret).update(`community-challenge:${v}`).digest('hex');
  return {
    issue() {
      const a = randomInt(2,20), b = randomInt(2,20), nonce = randomUUID();
      const payload = Buffer.from(JSON.stringify({ nonce, issued: now(), answer: sign(`${nonce}:${a+b}`) })).toString('base64url');
      return { token: `${payload}.${sign(payload)}`, question: `¿Cuánto es ${a} + ${b}?` };
    },
    verify(token, answer, website = '') {
      if (website || typeof token !== 'string' || token.length > 1000) throw fail(400, 'No se pudo verificar el envío. Actualiza la verificación.');
      const [payload, sig, extra] = token.split('.');
      if (extra || !sig || !/^[a-f0-9]{64}$/.test(sig) || !timingSafeEqual(Buffer.from(sign(payload)), Buffer.from(sig))) throw fail(400, 'Verificación inválida.');
      let data;
      try { data = JSON.parse(Buffer.from(payload,'base64url')); } catch { throw fail(400,'Verificación inválida.'); }
      const age = now() - data.issued;
      if (age < 3000) throw fail(400, 'Espera unos segundos antes de enviar.');
      if (age > 15*60000) throw fail(400, 'La verificación venció. Actualízala e intenta de nuevo.');
      if (!/^\d{1,2}$/.test(String(answer)) || sign(`${data.nonce}:${answer}`) !== data.answer) throw fail(400, 'La respuesta de verificación no es correcta.');
      return data.nonce;
    },
    networkKey(network, date) { return createHmac('sha256',secret).update(`community-limit:${date}:${network}`).digest('hex'); },
  };
}
