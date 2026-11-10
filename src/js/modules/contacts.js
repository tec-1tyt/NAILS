// Години роботи (з адмінки через API) і карта Google, що вантажиться лише після кліку.
import { $, api, el, siteData } from './env.js';
import { t, weekdayName } from './i18n.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

function todayInPrague() {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', weekday: 'short' }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

async function hours() {
  const list = $('[data-hours]');
  if (!list) return;
  const r = await api('/api/schedule');
  if (!r.ok || !Array.isArray(r.data?.week)) {
    const li = el('li', 'hours__state', `${t('hoursFallback')} `);
    const a = el('a', 'link-u', siteData.instagramHandle || 'Instagram');
    a.href = siteData.instagram || '#';
    a.target = '_blank';
    a.rel = 'noopener';
    li.append(a);
    list.replaceChildren(li);
    return;
  }
  const byDay = new Map(r.data.week.map((d) => [d.weekday, d]));
  const key = (d) => (d.enabled ? `${d.start}-${d.end}` : 'off');
  const groups = [];
  for (const wd of ORDER) {
    const d = byDay.get(wd);
    if (!d) continue;
    const last = groups[groups.length - 1];
    if (last && last.key === key(d)) last.days.push(wd);
    else groups.push({ key: key(d), d, days: [wd] });
  }
  const today = todayInPrague();
  list.replaceChildren(
    ...groups.map((g) => {
      const li = el('li');
      const first = weekdayName(g.days[0]);
      const lastDay = weekdayName(g.days[g.days.length - 1]);
      const label = g.days.length > 1 ? `${first} – ${lastDay}` : first;
      li.append(el('span', '', label), el('span', '', g.d.enabled ? `${g.d.start} – ${g.d.end}` : t('dayOff')));
      if (g.days.includes(today)) {
        li.classList.add('is-today');
        li.setAttribute('aria-label', `${t('today')}: ${g.d.enabled ? `${g.d.start} – ${g.d.end}` : t('dayOff')}`);
      }
      return li;
    }),
  );
}

function map() {
  const box = $('[data-map]');
  const btn = $('[data-map-load]');
  if (!box || !btn) return;
  btn.addEventListener('click', () => {
    if ($('iframe', box)) return;
    const q = encodeURIComponent(siteData.mapQuery || siteData.address || '');
    const frame = el('iframe');
    frame.src = `https://www.google.com/maps?q=${q}&hl=${siteData.lang || 'uk'}&z=16&output=embed`;
    frame.title = `${t('mapTitle')}: ${siteData.address || ''}`;
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.allowFullscreen = true;
    box.append(frame);
    frame.focus?.();
  });
}

export function initContacts() {
  hours();
  map();
}
