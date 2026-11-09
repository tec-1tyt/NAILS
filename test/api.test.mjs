// Інтеграційні тести API: node --test test/
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

process.env.ADMIN_PASSWORD = 'test-password-123';
process.env.SESSION_SECRET = 'test-secret';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.SMTP_HOST = '';

const { createApp } = await import('../server/app.js');
const { localToUtc, weekdayOf } = await import('../server/time.js');

function start(opts) {
  const { app, repo } = createApp({ dbPath: ':memory:', ...opts });
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, repo, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

const json = (body, headers = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

let ctx;
before(async () => {
  ctx = await start({ bookingLimit: 1000 });
});
after(() => ctx.server.close());

async function openSlot(skip = 0) {
  const { days } = await (await fetch(`${ctx.base}/api/days`)).json();
  const open = days.filter((d) => d.status === 'open').slice(1); // не сьогодні — без впливу leadMinutes
  for (const d of open) {
    const day = await (await fetch(`${ctx.base}/api/slots?date=${d.date}`)).json();
    const free = day.slots.filter((s) => s.available);
    if (free.length > skip) return { date: d.date, time: free[skip].time };
    skip -= free.length;
  }
  throw new Error('no open slot');
}

const valid = (slot, extra = {}) => ({
  name: 'Олена Коваль',
  phone: '+420 777 123 456',
  serviceId: 'mani-gel',
  date: slot.date,
  time: slot.time,
  comment: 'Перший візит',
  ...extra,
});

describe('time', () => {
  test('Europe/Prague → UTC з урахуванням літнього/зимового часу', () => {
    assert.equal(localToUtc('2026-07-01', '10:00').toISOString(), '2026-07-01T08:00:00.000Z');
    assert.equal(localToUtc('2026-12-01', '10:00').toISOString(), '2026-12-01T09:00:00.000Z');
    assert.equal(weekdayOf('2026-11-09'), 1);
  });
});

describe('public API', () => {
  test('health, schedule, days', async () => {
    assert.equal((await fetch(`${ctx.base}/api/health`)).status, 200);
    const sch = await (await fetch(`${ctx.base}/api/schedule`)).json();
    assert.equal(sch.week.length, 7);
    const { days } = await (await fetch(`${ctx.base}/api/days`)).json();
    assert.equal(days.length, 46);
    assert.ok(days.some((d) => d.status === 'open'));
  });

  test('slots: невірна дата → 400, минула дата → порожньо', async () => {
    assert.equal((await fetch(`${ctx.base}/api/slots?date=2026-02-31`)).status, 400);
    assert.equal((await fetch(`${ctx.base}/api/slots`)).status, 400);
    const past = await (await fetch(`${ctx.base}/api/slots?date=2020-01-01`)).json();
    assert.equal(past.open, false);
    assert.equal(past.reason, 'past');
  });

  test('порожня форма → 400 з помилками всіх полів', async () => {
    const res = await fetch(`${ctx.base}/api/booking`, json({}));
    assert.equal(res.status, 400);
    const body = await res.json();
    for (const f of ['name', 'phone', 'serviceId', 'date', 'time']) assert.ok(body.fields[f], `немає помилки для ${f}`);
  });

  test('невірний телефон, імʼя, послуга', async () => {
    const slot = await openSlot();
    let body = await (await fetch(`${ctx.base}/api/booking`, json(valid(slot, { phone: '12-34' })))).json();
    assert.ok(body.fields.phone);
    body = await (await fetch(`${ctx.base}/api/booking`, json(valid(slot, { name: '<script>' })))).json();
    assert.ok(body.fields.name);
    body = await (await fetch(`${ctx.base}/api/booking`, json(valid(slot, { serviceId: 'nope' })))).json();
    assert.ok(body.fields.serviceId);
  });

  test('не JSON → 415, зламаний JSON → 400', async () => {
    let res = await fetch(`${ctx.base}/api/booking`, { method: 'POST', body: 'name=x' });
    assert.equal(res.status, 415);
    res = await fetch(`${ctx.base}/api/booking`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'bad_json');
  });

  test('honeypot: «успіх», але нічого не збережено', async () => {
    const slot = await openSlot();
    const res = await fetch(`${ctx.base}/api/booking`, json(valid(slot, { website: 'http://spam' })));
    assert.equal(res.status, 201);
    const day = await (await fetch(`${ctx.base}/api/slots?date=${slot.date}`)).json();
    assert.equal(day.slots.find((s) => s.time === slot.time).available, true);
  });

  test('запис, повтор (подвійний клік), зайнятий слот', async () => {
    const slot = await openSlot();
    const r1 = await fetch(`${ctx.base}/api/booking`, json(valid(slot)));
    assert.equal(r1.status, 201);
    const b1 = await r1.json();
    assert.equal(b1.booking.phone, '+420777123456');
    assert.ok(b1.booking.startUtc < b1.booking.endUtc);

    const r2 = await fetch(`${ctx.base}/api/booking`, json(valid(slot)));
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).booking.id, b1.booking.id);

    const r3 = await fetch(`${ctx.base}/api/booking`, json(valid(slot, { phone: '+380671112233' })));
    assert.equal(r3.status, 409);
    assert.equal((await r3.json()).error, 'slot_taken');

    const day = await (await fetch(`${ctx.base}/api/slots?date=${slot.date}`)).json();
    assert.equal(day.slots.find((s) => s.time === slot.time).available, false);
  });

  test('паралельні запити на один слот: успішний лише один', async () => {
    const slot = await openSlot();
    const phones = ['+420700000001', '+420700000002', '+420700000003', '+420700000004'];
    const codes = await Promise.all(phones.map((p) => fetch(`${ctx.base}/api/booking`, json(valid(slot, { phone: p }))).then((r) => r.status)));
    assert.equal(codes.filter((c) => c === 201).length, 1);
    assert.equal(codes.filter((c) => c === 409).length, 3);
  });

  test('час поза графіком і вихідний день', async () => {
    const slot = await openSlot();
    let res = await fetch(`${ctx.base}/api/booking`, json(valid(slot, { time: '03:00', phone: '+420711111111' })));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'slot_unavailable');

    const other = await openSlot();
    ctx.repo.addDayOff(other.date, 'тест');
    res = await fetch(`${ctx.base}/api/booking`, json(valid(other, { phone: '+420722222222' })));
    assert.equal(res.status, 400);
    ctx.repo.deleteDayOff(other.date);
  });

  test('ліміт активних записів на один номер', async () => {
    const phone = '+420733333333';
    for (let i = 0; i < 3; i++) {
      const s = await openSlot();
      assert.equal((await fetch(`${ctx.base}/api/booking`, json(valid(s, { phone })))).status, 201);
    }
    const s = await openSlot();
    const res = await fetch(`${ctx.base}/api/booking`, json(valid(s, { phone })));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'too_many');
  });

  test('невідомий API → 404 JSON', async () => {
    const res = await fetch(`${ctx.base}/api/nope`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'not_found');
  });
});

describe('admin API', () => {
  const xhr = { 'X-Requested-With': 'fetch' };
  let cookie = '';

  test('без X-Requested-With → 403, без сесії → 401', async () => {
    assert.equal((await fetch(`${ctx.base}/api/admin/login`, json({ password: 'x' }))).status, 403);
    assert.equal((await fetch(`${ctx.base}/api/admin/bookings`)).status, 401);
  });

  test('вхід: невірний пароль → 401, вірний → cookie', async () => {
    assert.equal((await fetch(`${ctx.base}/api/admin/login`, json({ password: 'wrong' }, xhr))).status, 401);
    const res = await fetch(`${ctx.base}/api/admin/login`, json({ password: 'test-password-123' }, xhr));
    assert.equal(res.status, 200);
    cookie = res.headers.get('set-cookie').split(';')[0];
    assert.match(res.headers.get('set-cookie'), /HttpOnly/);
    const me = await (await fetch(`${ctx.base}/api/admin/me`, { headers: { cookie } })).json();
    assert.equal(me.ok, true);
  });

  test('підроблена cookie не проходить', async () => {
    const forged = cookie.replace(/=(\d+)\./, (m, exp) => `=${Number(exp) + 1000}.`);
    assert.equal((await fetch(`${ctx.base}/api/admin/bookings`, { headers: { cookie: forged } })).status, 401);
  });

  test('список, скасування звільняє слот, відновлення', async () => {
    const { bookings } = await (await fetch(`${ctx.base}/api/admin/bookings`, { headers: { cookie } })).json();
    assert.ok(bookings.length > 0);
    const b = bookings[0];
    const patch = (status) =>
      fetch(`${ctx.base}/api/admin/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { cookie, 'Content-Type': 'application/json', ...xhr },
        body: JSON.stringify({ status }),
      });
    assert.equal((await patch('cancelled')).status, 200);
    let day = await (await fetch(`${ctx.base}/api/slots?date=${b.date}`)).json();
    assert.equal(day.slots.find((s) => s.time === b.time).available, true);
    assert.equal((await patch('confirmed')).status, 200);
    day = await (await fetch(`${ctx.base}/api/slots?date=${b.date}`)).json();
    assert.equal(day.slots.find((s) => s.time === b.time).available, false);
    assert.equal((await patch('bogus')).status, 400);
  });

  test('графік: валідація і збереження, вихідні', async () => {
    const cur = await (await fetch(`${ctx.base}/api/admin/settings`, { headers: { cookie } })).json();
    const put = (body) =>
      fetch(`${ctx.base}/api/admin/settings`, {
        method: 'PUT',
        headers: { cookie, 'Content-Type': 'application/json', ...xhr },
        body: JSON.stringify(body),
      });
    const bad = { ...cur.settings, week: cur.week.map((d) => ({ ...d, start: '19:00', end: '10:00' })) };
    assert.equal((await put(bad)).status, 400);
    const good = { ...cur.settings, slotMinutes: 90, week: cur.week };
    const res = await put(good);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).settings.slotMinutes, 90);

    const date = '2099-01-01';
    let r = await fetch(`${ctx.base}/api/admin/days-off`, {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json', ...xhr },
      body: JSON.stringify({ date, note: 'Свято' }),
    });
    assert.equal(r.status, 201);
    r = await fetch(`${ctx.base}/api/admin/days-off/${date}`, { method: 'DELETE', headers: { cookie, ...xhr } });
    assert.equal(r.status, 200);
  });
});

describe('rate limit', () => {
  test('після ліміту → 429 з повідомленням', async () => {
    const small = await start({ bookingLimit: 2 });
    try {
      const codes = [];
      for (let i = 0; i < 3; i++) codes.push((await fetch(`${small.base}/api/booking`, json({}))).status);
      assert.deepEqual(codes, [400, 400, 429]);
    } finally {
      small.server.close();
    }
  });
});
