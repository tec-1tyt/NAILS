import { z } from 'zod';
import { isValidDate, isValidTime } from './time.js';

// Прибирає керівні символи (крім переносу рядка), зайві пробіли по краях.
const clean = (s) => s.replace(/\r\n?/g, '\n').replace(/(?!\n)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim();
const oneLine = (s) => clean(s).replace(/\s+/g, ' ');

/** Телефон: дозволяємо пробіли, дефіси, дужки, крапки; 00 на початку → +. 9–15 цифр. */
export function normalizePhone(raw) {
  let p = String(raw).replace(/[\s().\-]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  return p;
}
const PHONE_RE = /^\+?\d{9,15}$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} '’ʼ.\-]{1,59}$/u;

export const bookingSchema = z.object({
  name: z
    .string({ error: 'Вкажіть імʼя' })
    .transform(oneLine)
    .pipe(
      z
        .string()
        .min(2, 'Імʼя закоротке')
        .max(60, 'Імʼя задовге')
        .regex(NAME_RE, 'Лише літери, пробіл, апостроф або дефіс'),
    ),
  phone: z
    .string({ error: 'Вкажіть телефон' })
    .transform(normalizePhone)
    .pipe(z.string().regex(PHONE_RE, 'Перевірте номер: 9–15 цифр, можна з +420 / +380')),
  serviceId: z.string({ error: 'Оберіть послугу' }).trim().min(1, 'Оберіть послугу').max(40),
  date: z.string({ error: 'Оберіть дату' }).refine(isValidDate, 'Оберіть дату'),
  time: z.string({ error: 'Оберіть час' }).refine(isValidTime, 'Оберіть час'),
  comment: z
    .string()
    .optional()
    .default('')
    .transform(clean)
    .pipe(z.string().max(500, 'Коментар до 500 символів')),
  website: z.string().optional().default(''), // honeypot
});

const hhmm = z.string().refine(isValidTime, 'Час у форматі ГГ:ХХ');

export const settingsSchema = z.object({
  slotMinutes: z.number().int().min(15).max(480),
  leadMinutes: z.number().int().min(0).max(7 * 24 * 60),
  horizonDays: z.number().int().min(1).max(365),
  maxActivePerPhone: z.number().int().min(1).max(20),
  week: z
    .array(
      z
        .object({ weekday: z.number().int().min(0).max(6), enabled: z.boolean(), start: hhmm, end: hhmm })
        .refine((d) => d.start < d.end, { message: 'Початок має бути раніше за кінець', path: ['end'] }),
    )
    .length(7),
});

export const dayOffSchema = z.object({
  date: z.string().refine(isValidDate, 'Невірна дата'),
  note: z.string().optional().default('').transform(oneLine).pipe(z.string().max(80)),
});

export const statusSchema = z.object({ status: z.enum(['new', 'confirmed', 'cancelled']) });

/** zod-помилки → { поле: повідомлення } */
export function fieldErrors(error) {
  const out = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
