import { addDays, isValidDate, nowLocal, toHHMM, toMin, weekdayOf } from './time.js';

const overlaps = (aStart, aLen, bStart, bLen) => aStart < bStart + bLen && bStart < aStart + aLen;

/**
 * Слоти на день. Слот доступний, якщо не перетинається з жодним активним записом.
 * Минулі слоти (і ближчі за leadMinutes) не повертаються взагалі.
 * @returns {{date: string, open: boolean, reason: string|null, slots: {time: string, available: boolean}[]}}
 */
export function daySlots(repo, date, now = nowLocal(), settings = repo.getSettings()) {
  const res = { date, open: false, reason: null, slots: [] };
  if (!isValidDate(date)) return { ...res, reason: 'invalid' };
  if (date < now.date) return { ...res, reason: 'past' };
  if (date > addDays(now.date, settings.horizonDays)) return { ...res, reason: 'too_far' };
  if (repo.getDayOff(date)) return { ...res, reason: 'day_off' };

  const wh = repo.getWorkHour(weekdayOf(date));
  if (!wh || !wh.enabled) return { ...res, reason: 'closed' };

  const len = settings.slotMinutes;
  const busy = repo.activeOnDate(date).map((b) => [toMin(b.time), b.duration_min]);
  const end = toMin(wh.end);

  for (let t = toMin(wh.start); t + len <= end; t += len) {
    if (date === now.date && t < now.minutes + settings.leadMinutes) continue;
    const free = !busy.some(([bs, bl]) => overlaps(t, len, bs, bl));
    res.slots.push({ time: toHHMM(t), available: free });
  }
  res.open = res.slots.some((s) => s.available);
  if (!res.open) res.reason = res.slots.length ? 'full' : 'closed';
  return res;
}

/** Стан кожного дня на горизонті запису: open | full | closed. */
export function daysOverview(repo, now = nowLocal()) {
  const settings = repo.getSettings();
  const out = [];
  for (let i = 0; i <= settings.horizonDays; i++) {
    const date = addDays(now.date, i);
    const d = daySlots(repo, date, now, settings);
    out.push({ date, status: d.open ? 'open' : d.reason === 'full' ? 'full' : 'closed' });
  }
  return out;
}
