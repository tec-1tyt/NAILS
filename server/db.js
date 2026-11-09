import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Стартовий графік. ЦЕ ЗАГЛУШКА: реальних годин роботи в матеріалах не було.
// Майстриня змінює графік в /admin → «Графік».
const DEFAULT_WEEK = [
  { weekday: 1, enabled: 1, start: '10:00', end: '19:00' },
  { weekday: 2, enabled: 1, start: '10:00', end: '19:00' },
  { weekday: 3, enabled: 1, start: '10:00', end: '19:00' },
  { weekday: 4, enabled: 1, start: '10:00', end: '19:00' },
  { weekday: 5, enabled: 1, start: '10:00', end: '19:00' },
  { weekday: 6, enabled: 1, start: '10:00', end: '16:00' },
  { weekday: 0, enabled: 0, start: '10:00', end: '16:00' },
];

export const DEFAULT_SETTINGS = {
  slotMinutes: 120, // тривалість одного слоту (найдовша послуга 1 год 30 хв + запас)
  leadMinutes: 120, // мінімум часу до запису від «зараз»
  horizonDays: 45, // на скільки днів уперед відкритий запис
  maxActivePerPhone: 3, // скільки майбутніх активних записів може мати один номер
};

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      phone        TEXT    NOT NULL,
      service_id   TEXT    NOT NULL,
      service_name TEXT    NOT NULL,
      date         TEXT    NOT NULL,
      time         TEXT    NOT NULL,
      duration_min INTEGER NOT NULL,
      comment      TEXT    NOT NULL DEFAULT '',
      status       TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','cancelled')),
      created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_slot ON bookings(date, time) WHERE status <> 'cancelled';
    CREATE INDEX IF NOT EXISTS ix_bookings_date ON bookings(date);
    CREATE INDEX IF NOT EXISTS ix_bookings_phone ON bookings(phone);

    CREATE TABLE IF NOT EXISTS work_hours (
      weekday    INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
      enabled    INTEGER NOT NULL,
      start_time TEXT    NOT NULL,
      end_time   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS days_off (
      date TEXT PRIMARY KEY,
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const hasWeek = db.prepare('SELECT COUNT(*) AS n FROM work_hours').get().n > 0;
  if (!hasWeek) {
    const ins = db.prepare('INSERT INTO work_hours (weekday, enabled, start_time, end_time) VALUES (?, ?, ?, ?)');
    db.transaction(() => DEFAULT_WEEK.forEach((d) => ins.run(d.weekday, d.enabled, d.start, d.end)))();
  }
  const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, JSON.stringify(v));

  return db;
}

export function createRepo(db) {
  const q = {
    settings: db.prepare('SELECT key, value FROM settings'),
    setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    week: db.prepare('SELECT weekday, enabled, start_time AS start, end_time AS end FROM work_hours ORDER BY weekday'),
    workHour: db.prepare('SELECT weekday, enabled, start_time AS start, end_time AS end FROM work_hours WHERE weekday = ?'),
    setWorkHour: db.prepare('UPDATE work_hours SET enabled = ?, start_time = ?, end_time = ? WHERE weekday = ?'),
    dayOff: db.prepare('SELECT date, note FROM days_off WHERE date = ?'),
    daysOffFrom: db.prepare('SELECT date, note FROM days_off WHERE date >= ? ORDER BY date'),
    addDayOff: db.prepare('INSERT INTO days_off (date, note) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET note = excluded.note'),
    delDayOff: db.prepare('DELETE FROM days_off WHERE date = ?'),
    activeOnDate: db.prepare("SELECT id, time, duration_min FROM bookings WHERE date = ? AND status <> 'cancelled'"),
    findActive: db.prepare("SELECT * FROM bookings WHERE phone = ? AND date = ? AND time = ? AND status <> 'cancelled'"),
    activeForPhone: db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE phone = ? AND status <> 'cancelled' AND date >= ?"),
    insert: db.prepare(`INSERT INTO bookings (name, phone, service_id, service_name, date, time, duration_min, comment)
                        VALUES (@name, @phone, @serviceId, @serviceName, @date, @time, @durationMin, @comment)`),
    byId: db.prepare('SELECT * FROM bookings WHERE id = ?'),
    setStatus: db.prepare("UPDATE bookings SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"),
    listUpcoming: db.prepare("SELECT * FROM bookings WHERE date >= ? AND status <> 'cancelled' ORDER BY date, time"),
    listPast: db.prepare("SELECT * FROM bookings WHERE date < ? AND status <> 'cancelled' ORDER BY date DESC, time DESC LIMIT 300"),
    listCancelled: db.prepare("SELECT * FROM bookings WHERE status = 'cancelled' ORDER BY date DESC, time DESC LIMIT 300"),
    listAll: db.prepare('SELECT * FROM bookings ORDER BY date DESC, time DESC LIMIT 500'),
  };

  return {
    db,
    transaction: (fn) => db.transaction(fn),
    getSettings() {
      const out = { ...DEFAULT_SETTINGS };
      for (const row of q.settings.all()) out[row.key] = JSON.parse(row.value);
      return out;
    },
    setSettings(obj) {
      for (const [k, v] of Object.entries(obj)) q.setSetting.run(k, JSON.stringify(v));
    },
    getWeek: () => q.week.all().map((d) => ({ ...d, enabled: !!d.enabled })),
    getWorkHour: (weekday) => {
      const d = q.workHour.get(weekday);
      return d ? { ...d, enabled: !!d.enabled } : null;
    },
    setWorkHour: (d) => q.setWorkHour.run(d.enabled ? 1 : 0, d.start, d.end, d.weekday),
    getDayOff: (date) => q.dayOff.get(date) || null,
    listDaysOff: (fromDate) => q.daysOffFrom.all(fromDate),
    addDayOff: (date, note) => q.addDayOff.run(date, note),
    deleteDayOff: (date) => q.delDayOff.run(date).changes,
    activeOnDate: (date) => q.activeOnDate.all(date),
    findActive: (phone, date, time) => q.findActive.get(phone, date, time) || null,
    activeCountForPhone: (phone, fromDate) => q.activeForPhone.get(phone, fromDate).n,
    insertBooking: (b) => q.insert.run(b).lastInsertRowid,
    getBooking: (id) => q.byId.get(id) || null,
    setStatus: (id, status) => q.setStatus.run(status, id).changes,
    listBookings(scope, today) {
      if (scope === 'past') return q.listPast.all(today);
      if (scope === 'cancelled') return q.listCancelled.all();
      if (scope === 'all') return q.listAll.all();
      return q.listUpcoming.all(today);
    },
  };
}
