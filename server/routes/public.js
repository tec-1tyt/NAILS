import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { content, servicesById } from '../config.js';
import { log } from '../log.js';
import { notifyNewBooking } from '../notify.js';
import { daySlots, daysOverview } from '../schedule.js';
import { localToUtc, nowLocal } from '../time.js';
import { bookingSchema, fieldErrors } from '../validation.js';

const limitMessage = (message) => ({ error: 'rate_limited', message });

export function publicRoutes(repo, { bookingLimit = 8 } = {}) {
  const r = Router();

  const bookingLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: bookingLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: limitMessage('Забагато спроб запису. Зачекайте 10 хвилин або напишіть мені в Instagram.'),
  });

  r.get('/health', (req, res) => res.json({ ok: true }));

  r.get('/schedule', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ timezone: content.site.timezone, week: repo.getWeek() });
  });

  r.get('/days', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ days: daysOverview(repo) });
  });

  r.get('/slots', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    const day = daySlots(repo, date);
    if (day.reason === 'invalid') return res.status(400).json({ error: 'invalid_date', message: 'Невірна дата' });
    res.json(day);
  });

  r.post('/booking', bookingLimiter, (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'json_required', message: 'Очікується JSON' });

    const parsed = bookingSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Перевірте, будь ласка, поля форми', fields: fieldErrors(parsed.error) });
    }
    const data = parsed.data;

    // Honeypot: бот заповнив приховане поле. Відповідаємо «успіхом», але нічого не зберігаємо.
    if (data.website) {
      log.warn('Honeypot спрацював, запис відкинуто');
      return res.status(201).json({ ok: true, booking: { id: 0, name: data.name, date: data.date, time: data.time } });
    }

    const service = servicesById.get(data.serviceId);
    if (!service) {
      return res.status(400).json({ error: 'validation', message: 'Оберіть послугу зі списку', fields: { serviceId: 'Оберіть послугу зі списку' } });
    }

    const now = nowLocal();
    let result;
    try {
      result = repo.transaction(() => {
        const settings = repo.getSettings();
        // Повторне надсилання тієї ж форми (подвійний клік, ретрай мережі) повертає вже створений запис.
        const same = repo.findActive(data.phone, data.date, data.time);
        if (same) return { status: 200, row: same, duplicate: true };

        const day = daySlots(repo, data.date, now, settings);
        const slot = day.slots.find((s) => s.time === data.time);
        if (!slot) {
          return {
            status: 400,
            body: { error: 'slot_unavailable', message: 'На цей час запис недоступний. Оберіть, будь ласка, інший.', fields: { time: 'Оберіть інший час' } },
          };
        }
        if (!slot.available) {
          return { status: 409, body: { error: 'slot_taken', message: 'Ой, цей час щойно зайняли. Оберіть, будь ласка, інший.' } };
        }
        if (repo.activeCountForPhone(data.phone, now.date) >= settings.maxActivePerPhone) {
          return {
            status: 409,
            body: { error: 'too_many', message: 'З цього номера вже є кілька активних записів. Напишіть мені в Instagram, і я все узгоджу.' },
          };
        }
        const id = repo.insertBooking({
          name: data.name,
          phone: data.phone,
          serviceId: service.id,
          serviceName: service.name,
          date: data.date,
          time: data.time,
          durationMin: settings.slotMinutes,
          comment: data.comment,
        });
        return { status: 201, row: repo.getBooking(id) };
      })();
    } catch (err) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'slot_taken', message: 'Ой, цей час щойно зайняли. Оберіть, будь ласка, інший.' });
      }
      throw err;
    }

    if (!result.row) return res.status(result.status).json(result.body);

    const b = result.row;
    const start = localToUtc(b.date, b.time);
    const booking = {
      id: b.id,
      name: b.name,
      phone: b.phone,
      serviceName: b.service_name,
      date: b.date,
      time: b.time,
      comment: b.comment,
      startUtc: start.toISOString(),
      endUtc: new Date(start.getTime() + b.duration_min * 60000).toISOString(),
    };

    if (!result.duplicate) {
      log.info(`Новий запис #${b.id}: ${b.date} ${b.time}, ${b.service_id}`);
      notifyNewBooking(booking);
    }
    res.status(result.status).json({ ok: true, booking });
  });

  return r;
}
