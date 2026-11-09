import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './log.js';

const COOKIE = 'nb_admin';
const TTL_MS = 12 * 60 * 60 * 1000;

// Без SESSION_SECRET генеруємо випадковий ключ: сесії скинуться після перезапуску сервера.
const secret = config.sessionSecret || crypto.randomBytes(32).toString('hex');
if (!config.sessionSecret) log.warn('SESSION_SECRET не задано: використовую тимчасовий ключ');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
// Хеш пароля в підписі: після зміни ADMIN_PASSWORD усі старі сесії стають недійсними.
const sign = (exp) =>
  crypto.createHmac('sha256', secret).update(`${exp}.${sha(config.adminPassword).toString('hex')}`).digest('base64url');

export const adminEnabled = () => config.adminPassword.length >= 8;

export function checkPassword(input) {
  if (!adminEnabled() || typeof input !== 'string') return false;
  return crypto.timingSafeEqual(sha(input), sha(config.adminPassword));
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function cookieAttrs(maxAgeSec) {
  return [`Path=/api/admin`, `Max-Age=${maxAgeSec}`, 'HttpOnly', 'SameSite=Strict', config.isProd ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}

export function issueSession(res) {
  const exp = Date.now() + TTL_MS;
  res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; ${cookieAttrs(TTL_MS / 1000)}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieAttrs(0)}`);
}

export function isAuthed(req) {
  const token = readCookie(req, COOKIE);
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(exp));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function requireAdmin(req, res, next) {
  if (!adminEnabled()) return res.status(503).json({ error: 'admin_disabled', message: 'Задайте ADMIN_PASSWORD (мін. 8 символів) у .env' });
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized', message: 'Увійдіть знову' });
  next();
}

/**
 * Захист від CSRF для змін в адмінці: потрібен заголовок X-Requested-With: fetch.
 * Крос-сайтова форма його не надішле, а fetch з чужого домену впреться в CORS preflight.
 */
export function requireXhr(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('x-requested-with') !== 'fetch') {
    return res.status(403).json({ error: 'forbidden', message: 'Запит відхилено' });
  }
  next();
}
