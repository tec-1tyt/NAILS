// Онлайн-запис: дні → години → валідація → POST /api/booking → вікно успіху + календар.
import { gsap } from 'gsap';
import { $, $$, api, el, finePointer, lockScroll, reduced, scrollToTarget, siteData, trapFocus, unlockScroll } from './env.js';
import { humanDate, monthShort, t, weekdayShort } from './i18n.js';

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} '’ʼ.-]{1,59}$/u;
const BS = String.fromCharCode(92);

const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};
const normPhone = (v) => {
  let p = v.replace(/[\s().-]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  return p;
};

// ---------- календар ----------
const icsStamp = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) =>
  String(s).split(BS).join(BS + BS).replace(/;/g, `${BS};`).replace(/,/g, `${BS},`).replace(/\r?\n/g, `${BS}n`);
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 73) {
      out.push(cur);
      cur = ` ${ch}`;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}
function buildIcs(b) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//nailsby.nstjky//booking//UK',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:booking-${b.id || Date.now()}@nailsby.nstjky`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(b.startUtc)}`,
    `DTEND:${icsStamp(b.endUtc)}`,
    `SUMMARY:${icsText(`${b.serviceName} — ${siteData.brand || t('calSummary')}`)}`,
    `LOCATION:${icsText(siteData.address || '')}`,
    `DESCRIPTION:${icsText(t('calDesc').replace('{handle}', siteData.instagramHandle || ''))}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(t('calAlarm'))}`,
    'TRIGGER:-PT2H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
function googleCalUrl(b) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${b.serviceName} — ${siteData.brand || ''}`,
    dates: `${icsStamp(b.startUtc)}/${icsStamp(b.endUtc)}`,
    details: `${t('calDetails')}${siteData.instagram || ''}`,
    location: siteData.address || '',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function initBooking() {
  const form = $('#booking-form');
  if (!form) return;

  const f = {
    name: form.elements.name,
    phone: form.elements.phone,
    service: form.elements.serviceId,
    comment: form.elements.comment,
    website: form.elements.website,
  };
  const daysBox = $('[data-days]', form);
  const timesBox = $('[data-times]', form);
  const alertBox = $('[data-alert]', form);
  const submit = $('[data-submit]', form);
  const submitLabel = $('.btn__label', submit);
  const counter = $('[data-counter]', form);
  const prev = $('[data-days-prev]', form);
  const next = $('[data-days-next]', form);
  const errs = { name: $('#e-name'), phone: $('#e-phone'), serviceId: $('#e-service'), date: $('#e-date'), time: $('#e-time') };
  const inputs = { name: f.name, phone: f.phone, serviceId: f.service };
  const sum = { box: $('.summary'), service: $('[data-sum="service"]'), price: $('[data-sum="price"]'), when: $('[data-sum="when"]') };

  let selDate = '';
  let selTime = '';
  let submitting = false;
  let slotsReq = 0;
  const touched = new Set();

  // ---------- стани блоків ----------
  const skeletons = (box, n) => box.replaceChildren(...Array.from({ length: n }, () => el('div', 'skeleton')));
  function stateMsg(box, text, retry) {
    const p = el('p', 'picker__state', text);
    if (retry) {
      const b = el('button', 'link-u', t('retry'));
      b.type = 'button';
      b.addEventListener('click', retry);
      p.append(b);
    }
    box.replaceChildren(p);
  }

  function updateSummary() {
    const opt = f.service.selectedOptions[0];
    sum.service.textContent = opt && opt.value ? opt.textContent.split(' — ')[0] : '—';
    sum.price.textContent = opt && opt.value ? opt.dataset.price : '—';
    sum.when.textContent = selDate ? `${humanDate(selDate)}${selTime ? `, ${selTime}` : ''}` : '—';
  }
  function flashSummary() {
    if (reduced) return;
    sum.box.classList.remove('is-flash');
    void sum.box.offsetWidth;
    sum.box.classList.add('is-flash');
  }

  // ---------- дні ----------
  function dayChip(d) {
    const p = parseDate(d.date);
    const label = el('label', 'chip');
    const input = el('input');
    input.type = 'radio';
    input.name = 'date';
    input.value = d.date;
    input.disabled = d.status !== 'open';
    const note = d.status === 'full' ? t('noteFull') : d.status === 'closed' ? t('noteClosed') : '';
    input.setAttribute('aria-label', `${humanDate(d.date)}${note ? `, ${note}` : ''}`);
    if (note) label.title = note[0].toUpperCase() + note.slice(1);
    const inner = el('span', 'chip__in');
    inner.setAttribute('aria-hidden', 'true');
    inner.append(el('span', 'chip__wd', weekdayShort(d.date)), el('span', 'chip__d', String(p.d)), el('span', 'chip__m', monthShort(d.date)));
    label.append(input, inner);
    return label;
  }

  async function loadDays(keep = '') {
    skeletons(daysBox, 7);
    const r = await api('/api/days');
    if (!r.ok || !Array.isArray(r.data?.days)) {
      stateMsg(daysBox, r.network ? t('noServer') : t('daysFail'), () => loadDays(keep));
      updateNav();
      return;
    }
    const days = r.data.days;
    if (!days.some((d) => d.status === 'open')) {
      stateMsg(daysBox, t('noDays'));
      updateNav();
      return;
    }
    daysBox.replaceChildren(...days.map(dayChip));
    const keepInput = keep && daysBox.querySelector(`input[value="${keep}"]`);
    if (keepInput && !keepInput.disabled) keepInput.checked = true;
    else if (keep) {
      selDate = '';
      selTime = '';
      stateMsg(timesBox, t('pickDateFirst'));
      updateSummary();
    }
    daysBox.scrollLeft = 0;
    updateNav();
  }

  function updateNav() {
    if (!prev || !next) return;
    const max = daysBox.scrollWidth - daysBox.clientWidth;
    prev.disabled = daysBox.scrollLeft <= 4;
    next.disabled = daysBox.scrollLeft >= max - 4;
  }
  daysBox.addEventListener('scroll', updateNav, { passive: true });
  const page = (dir) => daysBox.scrollBy({ left: dir * daysBox.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
  prev?.addEventListener('click', () => page(-1));
  next?.addEventListener('click', () => page(1));
  // колесо миші гортає дні горизонтально
  daysBox.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && daysBox.scrollWidth > daysBox.clientWidth) {
        const atStart = daysBox.scrollLeft <= 0 && e.deltaY < 0;
        const atEnd = daysBox.scrollLeft >= daysBox.scrollWidth - daysBox.clientWidth - 1 && e.deltaY > 0;
        if (atStart || atEnd) return;
        e.preventDefault();
        daysBox.scrollLeft += e.deltaY;
      }
    },
    { passive: false },
  );

  daysBox.addEventListener('change', (e) => {
    if (e.target.name !== 'date') return;
    selDate = e.target.value;
    selTime = '';
    setError('date', '');
    setError('time', '');
    updateSummary();
    loadSlots(selDate);
  });

  // ---------- години ----------
  function timeChip(s) {
    const label = el('label', 'chip');
    const input = el('input');
    input.type = 'radio';
    input.name = 'time';
    input.value = s.time;
    input.disabled = !s.available;
    input.setAttribute('aria-label', `${s.time}${s.available ? '' : `, ${t('taken')}`}`);
    const inner = el('span', 'chip__in', s.time);
    inner.setAttribute('aria-hidden', 'true');
    if (!s.available) label.title = t('taken');
    label.append(input, inner);
    return label;
  }

  async function loadSlots(date) {
    const id = ++slotsReq;
    skeletons(timesBox, 4);
    const r = await api(`/api/slots?date=${encodeURIComponent(date)}`);
    if (id !== slotsReq) return; // прийшла відповідь на старий запит
    if (!r.ok || !Array.isArray(r.data?.slots)) {
      stateMsg(timesBox, r.network ? t('noServer') : t('slotsFail'), () => loadSlots(date));
      return;
    }
    const slots = r.data.slots;
    if (!slots.some((s) => s.available)) {
      stateMsg(timesBox, t('dayFull'));
      return;
    }
    timesBox.replaceChildren(...slots.map(timeChip));
    if (!reduced) gsap.fromTo(timesBox.children, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.035, ease: 'power3.out' });
  }

  timesBox.addEventListener('change', (e) => {
    if (e.target.name !== 'time') return;
    selTime = e.target.value;
    setError('time', '');
    updateSummary();
  });

  // ---------- валідація ----------
  function setError(key, msg) {
    errs[key].textContent = msg || '';
    inputs[key]?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function validate() {
    const e = {};
    const name = f.name.value.trim().replace(/\s+/g, ' ');
    if (!name) e.name = t('eName');
    else if (name.length < 2) e.name = t('eNameShort');
    else if (!NAME_RE.test(name)) e.name = t('eNameChars');
    const phone = normPhone(f.phone.value);
    if (!phone) e.phone = t('ePhone');
    else if (!/^\+?\d{9,15}$/.test(phone)) e.phone = t('ePhoneBad');
    if (!f.service.value) e.serviceId = t('eService');
    if (!selDate) e.date = t('eDate');
    if (!selTime) e.time = selDate ? t('eTime') : t('eTimeFirst');
    return e;
  }
  function showErrors(e) {
    Object.keys(errs).forEach((k) => setError(k, e[k]));
  }
  function focusFirst(e) {
    if (e.name) return f.name.focus();
    if (e.phone) return f.phone.focus();
    if (e.serviceId) return f.service.focus();
    if (e.date) return (daysBox.querySelector('input:not(:disabled)') || daysBox).focus?.();
    if (e.time) return (timesBox.querySelector('input:not(:disabled)') || timesBox).focus?.();
  }
  const validateField = (key) => {
    if (!touched.has(key)) return;
    setError(key, validate()[key]);
  };
  ['name', 'phone'].forEach((key) => {
    f[key].addEventListener('blur', () => {
      if (f[key].value.trim()) touched.add(key);
      validateField(key);
    });
    f[key].addEventListener('input', () => {
      if (errs[key].textContent) validateField(key);
    });
  });
  f.phone.addEventListener('input', () => {
    const clean = f.phone.value.replace(/[^\d+\s()-]/g, '');
    if (clean !== f.phone.value) f.phone.value = clean;
  });
  f.service.addEventListener('change', () => {
    setError('serviceId', '');
    updateSummary();
    flashSummary();
  });
  f.comment.addEventListener('input', () => {
    counter.textContent = String(f.comment.value.length);
  });

  // ---------- кнопки «Обрати» в картках послуг ----------
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-book]') : null;
    if (!b) return;
    f.service.value = b.dataset.book;
    f.service.dispatchEvent(new Event('change', { bubbles: true }));
    scrollToTarget('#booking', { offset: -10 });
    setTimeout(() => (finePointer && !f.name.value ? f.name : f.service).focus({ preventScroll: true }), reduced ? 0 : 1000);
  });

  // ---------- повідомлення ----------
  function showAlert(text, withInsta = true) {
    alertBox.replaceChildren(text);
    if (withInsta && siteData.instagram) {
      const a = el('a', 'link-u', siteData.instagramHandle || 'Instagram');
      a.href = siteData.instagram;
      a.target = '_blank';
      a.rel = 'noopener';
      alertBox.append(' ', a);
    }
    alertBox.classList.add('is-visible');
  }
  const hideAlert = () => {
    alertBox.classList.remove('is-visible');
    alertBox.textContent = '';
  };

  function setBusy(on) {
    submit.disabled = on;
    submit.setAttribute('aria-busy', String(on));
    submitLabel.textContent = on ? t('sending') : t('submit');
  }

  function handleError(r) {
    const d = r.data || {};
    if (r.network || r.status === 0) {
      showAlert(t('errNetwork'));
      return;
    }
    if (r.status === 400 && d.fields) {
      const mapped = {};
      // тексти помилок сервера українські — показуємо власні, мовою сторінки
      const byField = { name: 'eNameChars', phone: 'ePhoneBad', serviceId: 'eService', date: 'eDate', time: 'eTime' };
      for (const k of Object.keys(errs)) if (d.fields[k]) mapped[k] = t(byField[k]);
      showErrors(mapped);
      showAlert(d.error === 'slot_unavailable' ? t('errSlotUnavailable') : t('errFields'), false);
      if (d.fields.time && selDate) {
        selTime = '';
        loadSlots(selDate);
        updateSummary();
      }
      focusFirst(mapped);
      return;
    }
    if (r.status === 409 && d.error === 'slot_taken') {
      showAlert(t('errTaken'), false);
      selTime = '';
      updateSummary();
      loadSlots(selDate);
      return;
    }
    if (r.status === 409 && d.error === 'too_many') {
      showAlert(t('errTooMany'));
      return;
    }
    if (r.status === 429) {
      showAlert(t('errRate'));
      return;
    }
    if (r.status >= 500) {
      showAlert(t('errServer'));
      return;
    }
    showAlert(t('errGeneric'));
  }

  // ---------- успіх ----------
  const success = $('[data-success]');
  let lastBooking = null;
  let lastFocus = null;
  const onSuccessKey = (e) => {
    if (e.key === 'Escape') closeSuccess();
    else trapFocus(success, e);
  };
  function openSuccess(b) {
    lastBooking = b;
    const first = (b.name || '').split(' ')[0];
    const title = $('#success-title', success);
    const em = el('em', '', first ? `${first}!` : '');
    title.replaceChildren(first ? `${t('thanks')}, ` : `${t('thanks')}!`, ...(first ? [em] : []));
    $('[data-success-text]', success).textContent = b.date ? `${b.serviceName || t('booking')}: ${humanDate(b.date)} ${t('at')} ${b.time}.` : t('received');
    if (b.demo) {
      $('.success__sub', success).textContent = t('demoSub');
    }
    const g = $('[data-cal-google]', success);
    const icsBtn = $('[data-cal-ics]', success);
    const hasTime = !!(b.startUtc && b.endUtc);
    g.hidden = !hasTime;
    icsBtn.hidden = !hasTime;
    if (hasTime) g.href = googleCalUrl(b);
    lastFocus = document.activeElement;
    success.hidden = false;
    lockScroll();
    if (!reduced) gsap.fromTo('.success__card', { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'expo.out' });
    document.addEventListener('keydown', onSuccessKey);
    (hasTime ? g : $('.success__close', success)).focus();
  }
  function closeSuccess() {
    if (success.hidden) return;
    success.hidden = true;
    unlockScroll();
    document.removeEventListener('keydown', onSuccessKey);
    (lastFocus && document.contains(lastFocus) ? lastFocus : f.name).focus({ preventScroll: true });
  }
  $$('[data-success-close]', success).forEach((b) => b.addEventListener('click', closeSuccess));
  $('[data-cal-ics]', success).addEventListener('click', () => {
    if (!lastBooking) return;
    const blob = new Blob([buildIcs(lastBooking)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = t('icsFile');
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  // ---------- надсилання ----------
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (submitting) return; // захист від подвійного натискання
    hideAlert();
    ['name', 'phone'].forEach((k) => touched.add(k));
    const e = validate();
    showErrors(e);
    if (Object.keys(e).length) {
      focusFirst(e);
      return;
    }
    submitting = true;
    setBusy(true);
    const payload = {
      name: f.name.value,
      phone: f.phone.value,
      serviceId: f.service.value,
      date: selDate,
      time: selTime,
      comment: f.comment.value,
      website: f.website.value,
    };
    const r = await api('/api/booking', { method: 'POST', body: JSON.stringify(payload) }, 15000);
    submitting = false;
    setBusy(false);
    if (r.ok && r.data?.booking) {
      // сервер зберігає назву послуги українською (для майстрині); клієнту показуємо мовою сторінки
      const localName = f.service.selectedOptions[0]?.textContent.split(' — ')[0];
      if (localName) r.data.booking.serviceName = localName;
      form.reset();
      touched.clear();
      showErrors({});
      counter.textContent = '0';
      selDate = '';
      selTime = '';
      updateSummary();
      stateMsg(timesBox, t('pickDateFirst'));
      openSuccess(r.data.booking);
      loadDays();
      return;
    }
    handleError(r);
  });

  updateSummary();
  loadDays();
}
