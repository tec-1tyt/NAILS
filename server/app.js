import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config.js';
import { createRepo, openDb } from './db.js';
import { log } from './log.js';
import { adminRoutes } from './routes/admin.js';
import { publicRoutes } from './routes/public.js';

export function createApp({ dbPath = config.dbPath, bookingLimit, apiLimit = 300 } = {}) {
  const repo = createRepo(openDb(dbPath));
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'frame-src': ['https://www.google.com', 'https://maps.google.com'],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': config.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(compression());

  // API: CORS лише для доменів з CORS_ORIGINS (за замовчуванням тільки same-origin).
  app.use(
    '/api',
    cors({ origin: config.corsOrigins.length ? config.corsOrigins : false, credentials: true }),
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: apiLimit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'rate_limited', message: 'Забагато запитів. Спробуйте трохи пізніше.' },
    }),
    express.json({ limit: '10kb' }),
  );
  app.use('/api/admin', adminRoutes(repo));
  app.use('/api', publicRoutes(repo, { bookingLimit }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'Немає такого API' }));

  // Статика
  const dist = config.distDir;
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    log.warn('dist/ не знайдено: запустіть `npm run build`');
  }
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use('/fonts', express.static(path.join(dist, 'fonts'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.get('/admin', (req, res) => {
    res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-cache' });
    res.sendFile(path.join(dist, 'admin.html'));
  });
  app.use(
    express.static(dist, {
      extensions: ['html'],
      maxAge: '7d',
      setHeaders(res, file) {
        if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.use((req, res) => {
    const page = path.join(dist, '404.html');
    if (req.method === 'GET' && fs.existsSync(page)) return res.status(404).sendFile(page);
    res.status(404).type('text').send('Not found');
  });

  // Помилки
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'bad_json', message: 'Некоректні дані запиту' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'too_large', message: 'Забагато даних' });
    }
    if (err?.status === 404 || err?.statusCode === 404) {
      return res.status(404).type('text').send('Not found');
    }
    log.error(`${req.method} ${req.originalUrl}`, err?.stack || err);
    if (res.headersSent) return;
    if (req.originalUrl.startsWith('/api')) {
      return res.status(500).json({ error: 'server_error', message: 'Щось пішло не так на сервері. Спробуйте ще раз або напишіть мені в Instagram.' });
    }
    res.status(500).type('text').send('Server error');
  });

  return { app, repo };
}
