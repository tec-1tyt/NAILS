import nodemailer from 'nodemailer';
import { config } from './config.js';
import { log } from './log.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const WEEKDAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];
function humanDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y} (${wd})`;
}

async function sendTelegram(b) {
  const { token, chatId } = config.telegram;
  if (!token || !chatId) return 'skipped';
  const lines = [
    '<b>💅 Новий запис</b>',
    '',
    `<b>${esc(b.name)}</b>`,
    `📞 ${esc(b.phone)}`,
    `✨ ${esc(b.serviceName)}`,
    `📅 ${humanDate(b.date)}, <b>${esc(b.time)}</b>`,
  ];
  if (b.comment) lines.push(`💬 ${esc(b.comment)}`);
  if (config.siteUrl) lines.push('', `<a href="${esc(config.siteUrl)}/admin">Відкрити адмінку</a>`);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return 'sent';
}

let transporter;
async function sendEmail(b) {
  const s = config.smtp;
  if (!s.host || !s.to) return 'skipped';
  transporter ||= nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  const rows = [
    ['Імʼя', b.name],
    ['Телефон', b.phone],
    ['Послуга', b.serviceName],
    ['Дата', humanDate(b.date)],
    ['Час', b.time],
    ['Коментар', b.comment || '—'],
  ];
  await transporter.sendMail({
    from: s.from,
    to: s.to,
    subject: `Новий запис: ${b.name}, ${b.date} ${b.time}`,
    text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
    html: `<h2 style="font-family:Georgia,serif">Новий запис</h2><table cellpadding="6">${rows
      .map(([k, v]) => `<tr><td style="color:#777">${k}</td><td><b>${esc(v)}</b></td></tr>`)
      .join('')}</table>`,
  });
  return 'sent';
}

/** Сповіщення майстрині. Ніколи не кидає помилку: запис уже збережено, а збої лише логуються. */
export async function notifyNewBooking(booking) {
  const [tg, mail] = await Promise.allSettled([sendTelegram(booking), sendEmail(booking)]);
  if (tg.status === 'rejected') log.error('Telegram-сповіщення не надіслано:', tg.reason?.message || tg.reason);
  if (mail.status === 'rejected') log.error('Email-сповіщення не надіслано:', mail.reason?.message || mail.reason);
  if (tg.value === 'skipped' && mail.value === 'skipped') {
    log.warn('Сповіщення вимкнені: заповніть TELEGRAM_* або SMTP_* у .env');
  }
}
