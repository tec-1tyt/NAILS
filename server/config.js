import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(env.PORT) || 3000,
  isProd: env.NODE_ENV === 'production',
  siteUrl: (env.SITE_URL || '').replace(/\/$/, ''),
  dbPath: env.DB_PATH ? path.resolve(ROOT, env.DB_PATH) : path.join(ROOT, 'data', 'bookings.db'),
  distDir: path.join(ROOT, 'dist'),
  trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : false,
  corsOrigins: list(env.CORS_ORIGINS),
  adminPassword: env.ADMIN_PASSWORD || '',
  sessionSecret: env.SESSION_SECRET || '',
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || '',
    chatId: env.TELEGRAM_CHAT_ID || '',
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 465,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : true,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || env.SMTP_USER || '',
    to: env.MAIL_TO || '',
  },
};

export const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'site.json'), 'utf8'));
export const servicesById = new Map(content.services.map((s) => [s.id, s]));
export const TZ = content.site.timezone || 'Europe/Prague';
