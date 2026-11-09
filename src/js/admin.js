// Адмін-панель: вхід, записи, графік, вихідні. Без сторонніх бібліотек.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const WD_FULL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
const WD_SHORT = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const STATUS = { new: 'Новий', confirmed: 'Підтверджено', cancelled: 'Скасовано' };

const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};
const humanDate = (s) => {
  const p = parseDate(s);
  return `${WD_SHORT[p.wd]}, ${p.d} ${MONTHS_GEN[p.m - 1]} ${p.y}`;
};
const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtDuration = (m) => (m % 60 ? (m >= 60 ? `${Math.floor(m / 60)} год ${m % 60} хв` : `${m} хв`) : `${m / 60} год`);

/* global __BASE__, __DEMO__ */
// Підставляються під час збирання: шлях сайту (GitHub Pages — підпапка) і демо-режим без сервера
const BASE = __BASE__;
const DEMO = __DEMO__;

async function api(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(BASE + url.replace(/^\//, ''), {
      ...opts,
      credentials: 'same-origin',
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'X-Requested-With': 'fetch', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* не JSON */
    }
    if (res.status === 401 && !url.endsWith('/login')) showLogin();
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { message: 'Немає звʼязку із сервером' } };
  } finally {
    clearTimeout(t);
  }
}

let toastTimer;
function toast(text, err = false) {
  const t = $('[data-toast]');
  t.textContent = text;
  t.classList.toggle('toast--err', err);
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 3200);
}

function busy(btn, on) {
  btn.disabled = on;
  btn.setAttribute('aria-busy', String(on));
}

// ---------- вхід ----------
const views = { login: $('[data-view="login"]'), app: $('[data-view="app"]') };
let started = false;

function showLogin(message = '') {
  views.app.hidden = true;
  views.login.hidden = false;
  stopPolling();
  $('[data-login-err]').textContent = message;
  setTimeout(() => $('#a-pass').focus(), 50);
}
function showApp() {
  views.login.hidden = true;
  views.app.hidden = false;
  if (!started) {
    started = true;
    initApp();
  } else {
    loadBookings();
  }
  startPolling();
}

$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = $('button[type="submit"]', form);
  const err = $('[data-login-err]');
  const password = form.elements.password.value;
  if (!password) {
    err.textContent = 'Введіть пароль';
    return;
  }
  busy(btn, true);
  const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
  busy(btn, false);
  if (r.ok) {
    form.reset();
    err.textContent = '';
    showApp();
  } else {
    err.textContent = r.data?.message || 'Не вдалося увійти';
    form.elements.password.select();
  }
});

$('[data-logout]').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST', body: '{}' });
  showLogin();
});

// ---------- вкладки ----------
function initTabs() {
  const tabs = $$('[role="tab"]');
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (tab.id === 't-bookings') loadBookings();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });
}

// ---------- записи ----------
let scope = 'upcoming';
const listBox = $('[data-bookings]');

function actionBtn(label, cls, onClick) {
  const b = el('button', `btn ${cls}`);
  b.type = 'button';
  b.append(el('span', 'btn__label', label));
  b.addEventListener('click', onClick);
  return b;
}

/** Кнопка «Скасувати» з підтвердженням другим натисканням. */
function cancelBtn(onConfirm) {
  const b = actionBtn('Скасувати', 'btn--danger', () => {
    if (b.classList.contains('is-confirm')) {
      onConfirm(b);
      return;
    }
    b.classList.add('is-confirm');
    b.firstChild.textContent = 'Точно скасувати?';
    setTimeout(() => {
      b.classList.remove('is-confirm');
      b.firstChild.textContent = 'Скасувати';
    }, 5000);
  });
  return b;
}

async function setStatus(id, status, btn) {
  busy(btn, true);
  const r = await api(`/api/admin/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  busy(btn, false);
  if (!r.ok) return toast(r.data?.message || 'Не вдалося змінити статус', true);
  toast(status === 'confirmed' ? 'Запис підтверджено' : status === 'cancelled' ? 'Запис скасовано, слот вільний' : 'Запис відновлено');
  loadBookings();
}

function bookingCard(b) {
  const card = el('article', `bk bk--${b.status}`);
  const row1 = el('div', 'bk__row');
  row1.append(el('span', 'bk__time', b.time), el('span', `status status--${b.status}`, STATUS[b.status]));
  const name = el('p', 'bk__name', b.name);
  const phone = el('a', 'bk__phone', b.phone);
  phone.href = `tel:${b.phone}`;
  const svc = el('p', 'bk__svc', b.serviceName);
  card.append(row1, name, phone, svc);
  if (b.comment) card.append(el('p', 'bk__comment', b.comment));
  const created = new Date(b.createdAt);
  card.append(el('p', 'bk__meta', `#${b.id} · створено ${created.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}`));

  const actions = el('div', 'bk__actions');
  if (b.status === 'new') actions.append(actionBtn('Підтвердити', 'btn--primary', (e) => setStatus(b.id, 'confirmed', e.currentTarget)));
  if (b.status !== 'cancelled') actions.append(cancelBtn((btn) => setStatus(b.id, 'cancelled', btn)));
  else actions.append(actionBtn('Відновити', 'btn--ghost', (e) => setStatus(b.id, 'new', e.currentTarget)));
  card.append(actions);
  return card;
}

let lastNewIds = null;
async function loadBookings() {
  const r = await api(`/api/admin/bookings?scope=${scope}`);
  if (!r.ok) {
    if (r.status !== 401) listBox.replaceChildren(el('p', 'empty', r.data?.message || 'Не вдалося завантажити записи'));
    return;
  }
  const items = r.data.bookings;
  if (scope === 'upcoming') {
    const newOnes = items.filter((b) => b.status === 'new');
    const badge = $('[data-new-count]');
    badge.hidden = !newOnes.length;
    badge.textContent = String(newOnes.length);
    document.title = `${newOnes.length ? `(${newOnes.length}) ` : ''}Адмінка — nailsby.nstjky`;
    const ids = new Set(newOnes.map((b) => b.id));
    if (lastNewIds && [...ids].some((id) => !lastNewIds.has(id))) toast('Новий запис!');
    lastNewIds = ids;
  }
  if (!items.length) {
    const msg = { upcoming: 'Майбутніх записів поки немає', past: 'Минулих записів немає', cancelled: 'Скасованих записів немає', all: 'Записів ще немає' }[scope];
    listBox.replaceChildren(el('p', 'empty', msg));
    return;
  }
  const groups = new Map();
  items.forEach((b) => {
    if (!groups.has(b.date)) groups.set(b.date, []);
    groups.get(b.date).push(b);
  });
  listBox.replaceChildren(
    ...[...groups].map(([date, list]) => {
      const sec = el('section', 'day');
      const h = el('h2', 'day__title', humanDate(date));
      const active = list.filter((b) => b.status !== 'cancelled').length;
      h.append(el('small', '', `${active} ${active === 1 ? 'запис' : active > 1 && active < 5 ? 'записи' : 'записів'}`));
      const cards = el('div', 'day__cards');
      cards.append(...list.sort((a, b) => a.time.localeCompare(b.time)).map(bookingCard));
      sec.append(h, cards);
      return sec;
    }),
  );
}

$$('[data-scope]').forEach((b) =>
  b.addEventListener('click', () => {
    scope = b.dataset.scope;
    $$('[data-scope]').forEach((x) => {
      x.classList.toggle('is-active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    listBox.replaceChildren(el('p', 'empty', 'Завантажую…'));
    loadBookings();
  }),
);
$('[data-refresh]').addEventListener('click', loadBookings);

let pollTimer;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && !$('#p-bookings').hidden) loadBookings();
  }, 60000);
}
function stopPolling() {
  clearInterval(pollTimer);
}

// ---------- графік ----------
const SLOT_OPTIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 240];
const LEAD_OPTIONS = [0, 30, 60, 120, 180, 240, 360, 720, 1440, 2880];
let settings = null;
let week = [];

function fillSelect(sel, values, fmt, current) {
  const vals = values.includes(current) ? values : [...values, current].sort((a, b) => a - b);
  sel.replaceChildren(...vals.map((v) => Object.assign(el('option', '', fmt(v)), { value: String(v), selected: v === current })));
}

function slotsPreview(d, slot) {
  if (!d.enabled) return 'Вихідний';
  if (!d.start || !d.end || d.start >= d.end) return 'Перевірте години';
  const out = [];
  for (let t = toMin(d.start); t + slot <= toMin(d.end); t += slot) out.push(toHHMM(t));
  return out.length ? `Слоти: ${out.join(', ')}` : 'Жодного слоту не вміщується';
}

function renderWeek() {
  const box = $('[data-week]');
  const slot = Number($('#s-slot').value) || settings.slotMinutes;
  box.replaceChildren(
    ...ORDER.map((wd) => {
      const d = week.find((x) => x.weekday === wd);
      const row = el('div', `wd${d.enabled ? '' : ' wd--off'}`);
      const sw = el('label', 'switch');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = d.enabled;
      cb.addEventListener('change', () => {
        d.enabled = cb.checked;
        renderWeek();
      });
      sw.append(cb, el('span', 'switch__ui'), el('span', '', WD_FULL[wd]));
      const mk = (key, label) => {
        const i = el('input', 'field__input');
        i.type = 'time';
        i.step = 900;
        i.value = d[key];
        i.disabled = !d.enabled;
        i.setAttribute('aria-label', `${WD_FULL[wd]}: ${label}`);
        i.addEventListener('change', () => {
          d[key] = i.value;
          prev.textContent = slotsPreview(d, Number($('#s-slot').value));
        });
        return i;
      };
      const prev = el('p', 'wd__slots', slotsPreview(d, slot));
      row.append(sw, mk('start', 'початок'), mk('end', 'кінець'), prev);
      return row;
    }),
  );
}

async function loadSettings() {
  const r = await api('/api/admin/settings');
  if (!r.ok) return toast(r.data?.message || 'Не вдалося завантажити графік', true);
  settings = r.data.settings;
  week = r.data.week.map((d) => ({ ...d }));
  fillSelect($('#s-slot'), SLOT_OPTIONS, fmtDuration, settings.slotMinutes);
  fillSelect($('#s-lead'), LEAD_OPTIONS, (v) => (v === 0 ? 'без обмеження' : `за ${fmtDuration(v)}`), settings.leadMinutes);
  $('#s-horizon').value = settings.horizonDays;
  $('#s-max').value = settings.maxActivePerPhone;
  renderWeek();
  renderDaysOff(r.data.daysOff);
}

$('#s-slot').addEventListener('change', renderWeek);
$('[data-schedule]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('[data-sched-err]');
  err.textContent = '';
  const bad = week.find((d) => d.enabled && (!d.start || !d.end || d.start >= d.end));
  if (bad) {
    err.textContent = `${WD_FULL[bad.weekday]}: початок має бути раніше за кінець`;
    return;
  }
  const body = {
    slotMinutes: Number($('#s-slot').value),
    leadMinutes: Number($('#s-lead').value),
    horizonDays: Number($('#s-horizon').value),
    maxActivePerPhone: Number($('#s-max').value),
    week: week.map(({ weekday, enabled, start, end }) => ({ weekday, enabled, start, end })),
  };
  if (!Number.isInteger(body.horizonDays) || body.horizonDays < 1 || body.horizonDays > 365) {
    err.textContent = 'Кількість днів для запису: від 1 до 365';
    return;
  }
  if (!Number.isInteger(body.maxActivePerPhone) || body.maxActivePerPhone < 1 || body.maxActivePerPhone > 20) {
    err.textContent = 'Ліміт записів на номер: від 1 до 20';
    return;
  }
  const btn = $('button[type="submit"]', e.currentTarget);
  busy(btn, true);
  const r = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
  busy(btn, false);
  if (!r.ok) {
    err.textContent = r.data?.message || 'Не вдалося зберегти';
    return;
  }
  settings = r.data.settings;
  week = r.data.week.map((d) => ({ ...d }));
  renderWeek();
  toast('Графік збережено');
});

// ---------- вихідні ----------
function renderDaysOff(list) {
  const box = $('[data-off-list]');
  if (!list.length) {
    box.replaceChildren(el('li', 'empty', 'Запланованих вихідних немає'));
    return;
  }
  box.replaceChildren(
    ...list.map((d) => {
      const li = el('li', 'off-item');
      const del = el('button', 'btn btn--danger btn--sm');
      del.type = 'button';
      del.append(el('span', 'btn__label', 'Прибрати'));
      del.setAttribute('aria-label', `Прибрати вихідний ${humanDate(d.date)}`);
      del.addEventListener('click', async () => {
        busy(del, true);
        const r = await api(`/api/admin/days-off/${d.date}`, { method: 'DELETE' });
        busy(del, false);
        if (!r.ok) return toast(r.data?.message || 'Не вдалося', true);
        renderDaysOff(r.data.daysOff);
        toast('Вихідний прибрано');
      });
      li.append(el('span', 'off-item__date', humanDate(d.date)), el('span', 'off-item__note', d.note || ''), del);
      return li;
    }),
  );
}

$('[data-off-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const err = $('[data-off-err]');
  err.textContent = '';
  const date = form.elements.date.value;
  if (!date) {
    err.textContent = 'Оберіть дату';
    return;
  }
  const r = await api('/api/admin/days-off', { method: 'POST', body: JSON.stringify({ date, note: form.elements.note.value }) });
  if (!r.ok) {
    err.textContent = r.data?.message || 'Не вдалося додати';
    return;
  }
  form.reset();
  renderDaysOff(r.data.daysOff);
  toast('Вихідний додано');
});

function initApp() {
  initTabs();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date());
  $('#o-date').min = today;
  loadBookings();
  loadSettings();
}

// ---------- старт ----------
(async () => {
  if (DEMO) {
    // на статичному хостингу (GitHub Pages) сервера немає — адмінка працює лише на Render/VPS
    showLogin('Це демо-версія для показу. Адмінка запрацює, коли сайт буде розгорнуто разом із сервером (див. README).');
    $$('[data-login] input, [data-login] button').forEach((n) => (n.disabled = true));
    return;
  }
  const r = await api('/api/admin/me');
  if (r.ok && r.data?.ok) showApp();
  else if (r.ok && r.data && !r.data.enabled) showLogin('Адмінку вимкнено: задайте ADMIN_PASSWORD (мін. 8 символів) у файлі .env і перезапустіть сервер.');
  else showLogin(r.status === 0 ? 'Немає звʼязку із сервером' : '');
})();
