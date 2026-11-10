// Тексти скриптів трьома мовами. Українські — тут, переклади приходять зі збірки
// (content/i18n/{en,cs}.json → js) у siteData.t. Дати форматує Intl під мову сторінки.
// Без імпорту з env.js: env → demo → i18n утворювало б цикл, і дані ще не були б готові.
const siteData = (() => {
  try {
    return JSON.parse(document.getElementById('site-data')?.textContent || '{}');
  } catch {
    return {};
  }
})();

const UA = {
  noteFull: 'усе зайнято',
  noteClosed: 'вихідний',
  retry: 'Спробувати ще раз',
  noServer: 'Немає звʼязку із сервером.',
  daysFail: 'Не вдалося завантажити дні.',
  noDays: 'Найближчим часом вільних днів немає. Напишіть мені в Instagram, і я підберу час.',
  pickDateFirst: 'Спершу оберіть дату',
  slotsFail: 'Не вдалося завантажити години.',
  dayFull: 'На цей день вільних годин уже немає. Оберіть, будь ласка, інший.',
  taken: 'зайнято',
  eName: 'Вкажіть, як до вас звертатися',
  eNameShort: 'Імʼя закоротке',
  eNameChars: 'Лише літери, пробіл, апостроф або дефіс',
  ePhone: 'Вкажіть телефон, щоб я могла підтвердити запис',
  ePhoneBad: 'Перевірте номер: 9–15 цифр, наприклад +420 777 123 456',
  eService: 'Оберіть послугу',
  eDate: 'Оберіть день',
  eTime: 'Оберіть вільну годину',
  eTimeFirst: 'Спершу день, потім година',
  sending: 'Надсилаю…',
  submit: 'Записатись',
  errNetwork: 'Не вдалося звʼязатися із сервером. Перевірте інтернет і спробуйте ще раз або напишіть мені в Instagram:',
  errFields: 'Перевірте, будь ласка, поля форми.',
  errTaken: 'Ой, цей час щойно зайняли. Оберіть, будь ласка, інший.',
  errSlotUnavailable: 'На цей час запис недоступний. Оберіть, будь ласка, інший.',
  errTooMany: 'З цього номера вже є кілька активних записів. Напишіть мені в Instagram, і я все узгоджу.',
  errRate: 'Забагато спроб. Зачекайте кілька хвилин або напишіть мені в Instagram:',
  errServer: 'Сервер тимчасово не відповідає. Спробуйте за хвилину або напишіть мені в Instagram:',
  errGeneric: 'Щось пішло не так. Спробуйте ще раз або напишіть мені в Instagram:',
  thanks: 'Дякую',
  booking: 'Запис',
  at: 'о',
  received: 'Запис отримано.',
  demoSub: 'Це демо-версія сайту: заявку не надіслано. На робочому сайті вона одразу потрапить до майстрині.',
  calSummary: 'манікюр',
  calDesc: 'Запис до Насті ({handle}). Якщо плани зміняться, напишіть в Instagram.',
  calAlarm: 'Нагадування про манікюр',
  calDetails: 'Запис до Насті. Instagram: ',
  icsFile: 'zapys-manikur.ics',
  hoursFallback: 'Графік уточнюйте в Instagram',
  dayOff: 'вихідний',
  today: 'Сьогодні',
  mapTitle: 'Карта',
  menuOpen: 'Відкрити меню',
  menuClose: 'Закрити меню',
  demoNotFound: 'Демо-версія: цей запит недоступний',
};

export const LOCALE = siteData.locale || 'uk-UA';
export const t = (key) => (siteData.t && siteData.t[key]) || UA[key] || key;

const utc = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (opts) => new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...opts });
const clean = (s) => s.replace(/\.$/, '');

/** «вт» / «út» / «Tue» */
export const weekdayShort = (date) => clean(fmt({ weekday: 'short' }).format(utc(date)));
/** «лист» / «lis» / «Nov» */
export const monthShort = (date) => clean(fmt({ month: 'short' }).format(utc(date)));
/** «вівторок, 10 листопада» / «úterý 10. listopadu» / «Tuesday 10 November» */
export const humanDate = (date) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(utc(date));
/** Коротка назва дня тижня за номером (0 = неділя), з великої літери */
export const weekdayName = (wd) => {
  const s = clean(fmt({ weekday: 'short' }).format(new Date(Date.UTC(2024, 0, 7 + wd))));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
