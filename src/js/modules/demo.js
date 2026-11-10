// ДЕМО-РЕЖИМ (збірка з DEMO=1, напр. GitHub Pages): сервера немає, тому API імітується в браузері.
// Логіка слотів повторює server/schedule.js, щоб показ клієнту виглядав як справжній сайт.
// Записи нікуди не надсилаються: лише зберігаються в памʼяті вкладки, щоб слот ставав «зайнятим».
import { siteData, wait } from './env.js';
import { t } from './i18n.js';

const TZ = 'Europe/Prague';
const SETTINGS = { slotMinutes: 120, leadMinutes: 120, horizonDays: 45 };
// той самий стартовий графік, що й на сервері (server/db.js)
const WEEK = [
  { weekday: 1, enabled: true, start: '10:00', end: '19:00' },
  { weekday: 2, enabled: true, start: '10:00', end: '19:00' },
  { weekday: 3, enabled: true, start: '10:00', end: '19:00' },
  { weekday: 4, enabled: true, start: '10:00', end: '19:00' },
  { weekday: 5, enabled: true, start: '10:00', end: '19:00' },
  { weekday: 6, enabled: true, start: '10:00', end: '16:00' },
  { weekday: 0, enabled: false, start: '10:00', end: '16:00' },
];
const booked = new Set(); // "YYYY-MM-DD HH:MM"

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const parts = (d) => Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
function nowLocal() {
  const p = parts(new Date());
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}
const offsetMs = (d) => {
  const p = parts(d);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000;
};
function localToUtc(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ts = guess - offsetMs(new Date(guess));
  const second = offsetMs(new Date(ts));
  if (second !== guess - ts) ts = guess - second;
  return new Date(ts);
}
const addDays = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekday = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Стабільна «зайнятість» частини слотів, щоб календар виглядав живим (однакова при кожному відкритті)
const pseudoTaken = (date, time) => {
  let h = 2166136261; // FNV-1a
  for (const ch of date + time) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100 < 20;
};

function daySlots(date, now = nowLocal()) {
  const res = { date, open: false, reason: null, slots: [] };
  if (date < now.date) return { ...res, reason: 'past' };
  if (date > addDays(now.date, SETTINGS.horizonDays)) return { ...res, reason: 'too_far' };
  const wh = WEEK.find((d) => d.weekday === weekday(date));
  if (!wh || !wh.enabled) return { ...res, reason: 'closed' };
  const len = SETTINGS.slotMinutes;
  for (let t = toMin(wh.start); t + len <= toMin(wh.end); t += len) {
    if (date === now.date && t < now.minutes + SETTINGS.leadMinutes) continue;
    const time = toHHMM(t);
    res.slots.push({ time, available: !booked.has(`${date} ${time}`) && !pseudoTaken(date, time) });
  }
  res.open = res.slots.some((s) => s.available);
  if (!res.open) res.reason = res.slots.length ? 'full' : 'closed';
  return res;
}

const ok = (data, status = 200) => ({ ok: true, status, data });

/** Імітація відповіді API (той самий формат, що й у справжнього сервера). */
export async function demoApi(url, opts = {}) {
  await wait(250 + Math.random() * 250); // трохи «мережі», щоб було видно стани завантаження
  const u = new URL(url, location.origin);
  const path = u.pathname.replace(/^.*\/api\//, '/api/');

  if (path === '/api/schedule') return ok({ timezone: TZ, week: WEEK });
  if (path === '/api/days') {
    const now = nowLocal();
    const days = [];
    for (let i = 0; i <= SETTINGS.horizonDays; i++) {
      const date = addDays(now.date, i);
      const d = daySlots(date, now);
      days.push({ date, status: d.open ? 'open' : d.reason === 'full' ? 'full' : 'closed' });
    }
    return ok({ days });
  }
  if (path === '/api/slots') return ok(daySlots(u.searchParams.get('date') || ''));
  if (path === '/api/booking' && opts.method === 'POST') {
    const b = JSON.parse(opts.body || '{}');
    const key = `${b.date} ${b.time}`;
    const slot = daySlots(b.date).slots.find((s) => s.time === b.time);
    if (!slot || !slot.available) {
      return { ok: false, status: 409, data: { error: 'slot_taken', message: t('errTaken') } };
    }
    booked.add(key);
    const start = localToUtc(b.date, b.time);
    const service = (siteData.services || []).find((s) => s.id === b.serviceId);
    return ok(
      {
        ok: true,
        booking: {
          id: 0,
          demo: true,
          name: String(b.name || '').trim(),
          serviceName: service ? service.name : t('booking'),
          date: b.date,
          time: b.time,
          startUtc: start.toISOString(),
          endUtc: new Date(start.getTime() + SETTINGS.slotMinutes * 60000).toISOString(),
        },
      },
      201,
    );
  }
  return { ok: false, status: 404, data: { error: 'not_found', message: t('demoNotFound') } };
}
