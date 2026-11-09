// Мінімальний логер: час + рівень. На Render/VPS (pm2, systemd) stdout/stderr збираються автоматично.
const stamp = () => new Date().toISOString();

export const log = {
  info: (...a) => console.log(stamp(), 'INFO ', ...a),
  warn: (...a) => console.warn(stamp(), 'WARN ', ...a),
  error: (...a) => console.error(stamp(), 'ERROR', ...a),
};
