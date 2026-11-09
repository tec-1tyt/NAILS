import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { log } from '../log.js';
import { adminEnabled, checkPassword, clearSession, issueSession, isAuthed, requireAdmin, requireXhr } from '../auth.js';
import { isValidDate, nowLocal, toMin } from '../time.js';
import { dayOffSchema, fieldErrors, settingsSchema, statusSchema } from '../validation.js';

const toDto = (b) => ({
  id: b.id,
  name: b.name,
  phone: b.phone,
  serviceId: b.service_id,
  serviceName: b.service_name,
  date: b.date,
  time: b.time,
  durationMin: b.duration_min,
  comment: b.comment,
  status: b.status,
  createdAt: b.created_at,
  updatedAt: b.updated_at,
});

export function adminRoutes(repo) {
  const r = Router();
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  r.use(requireXhr);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Забагато спроб входу. Спробуйте через 15 хвилин.' },
  });

  r.post('/login', loginLimiter, (req, res) => {
    if (!adminEnabled()) {
      return res.status(503).json({ error: 'admin_disabled', message: 'Адмінку вимкнено: задайте ADMIN_PASSWORD (мін. 8 символів) у .env' });
    }
    if (!checkPassword(req.body?.password)) {
      log.warn('Невдала спроба входу в адмінку');
      return res.status(401).json({ error: 'bad_password', message: 'Невірний пароль' });
    }
    issueSession(res);
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => res.json({ ok: adminEnabled() && isAuthed(req), enabled: adminEnabled() }));

  r.use(requireAdmin);

  r.get('/bookings', (req, res) => {
    const scope = ['upcoming', 'past', 'cancelled', 'all'].includes(req.query.scope) ? req.query.scope : 'upcoming';
    res.json({ bookings: repo.listBookings(scope, nowLocal().date).map(toDto) });
  });

  r.patch('/bookings/:id', (req, res) => {
    const id = Number(req.params.id);
    const parsed = statusSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: 'validation', message: 'Невірний запит' });
    const { status } = parsed.data;

    let result;
    try {
      result = repo.transaction(() => {
        const b = repo.getBooking(id);
        if (!b) return { code: 404, body: { error: 'not_found', message: 'Запис не знайдено' } };
        if (b.status === 'cancelled' && status !== 'cancelled') {
          // Відновлення скасованого запису: перевіряємо, що час не зайняли інші.
          const start = toMin(b.time);
          const clash = repo
            .activeOnDate(b.date)
            .some((o) => o.id !== b.id && start < toMin(o.time) + o.duration_min && toMin(o.time) < start + b.duration_min);
          if (clash) return { code: 409, body: { error: 'slot_taken', message: 'Цей час уже зайнятий іншим записом' } };
        }
        repo.setStatus(id, status);
        return { code: 200, body: { ok: true, booking: toDto(repo.getBooking(id)) } };
      })();
    } catch (err) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'slot_taken', message: 'Цей час уже зайнятий іншим записом' });
      }
      throw err;
    }
    res.status(result.code).json(result.body);
  });

  r.get('/settings', (req, res) => {
    res.json({ settings: repo.getSettings(), week: repo.getWeek(), daysOff: repo.listDaysOff(nowLocal().date) });
  });

  r.put('/settings', (req, res) => {
    const parsed = settingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'Перевірте графік', fields: fieldErrors(parsed.error) });
    const { week, ...settings } = parsed.data;
    repo.transaction(() => {
      repo.setSettings(settings);
      week.forEach((d) => repo.setWorkHour(d));
    })();
    res.json({ ok: true, settings: repo.getSettings(), week: repo.getWeek() });
  });

  r.post('/days-off', (req, res) => {
    const parsed = dayOffSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'Невірна дата', fields: fieldErrors(parsed.error) });
    repo.addDayOff(parsed.data.date, parsed.data.note);
    res.status(201).json({ ok: true, daysOff: repo.listDaysOff(nowLocal().date) });
  });

  r.delete('/days-off/:date', (req, res) => {
    if (!isValidDate(req.params.date)) return res.status(400).json({ error: 'validation', message: 'Невірна дата' });
    repo.deleteDayOff(req.params.date);
    res.json({ ok: true, daysOff: repo.listDaysOff(nowLocal().date) });
  });

  return r;
}
