import { config } from './config.js';
import { createApp } from './app.js';
import { log } from './log.js';
import { adminEnabled } from './auth.js';

const { app, repo } = createApp();

const server = app.listen(config.port, () => {
  log.info(`Сайт працює: http://localhost:${config.port}`);
  if (!adminEnabled()) log.warn('ADMIN_PASSWORD не задано (або коротший за 8 символів): /admin недоступна');
});

function shutdown(signal) {
  log.info(`${signal}: зупиняю сервер`);
  server.close(() => {
    repo.db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (e) => log.error('unhandledRejection', e));
