import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/** Resolved at runtime so env vars (e.g. on Netlify) are read when the function runs, not at bundle time. */
function getDbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  // Serverless (Netlify, etc.): only /tmp is writable. Use it when in production so we don't rely on NETLIFY being in the bundle.
  if (process.env.NODE_ENV === "production") return path.join("/tmp", "reservation.db");
  return path.join(process.cwd(), "data", "reservation.db");
}

let _db: Database.Database | null = null;

function createDb(): Database.Database {
  const dbPath = getDbPath();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      verification_expires INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_date TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS event_signups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(event_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
    CREATE INDEX IF NOT EXISTS idx_signups_event ON event_signups(event_id);
    CREATE INDEX IF NOT EXISTS idx_signups_user ON event_signups(user_id);

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      created_by INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS notice_dismissals (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, notice_id)
    );
    CREATE INDEX IF NOT EXISTS idx_notices_event ON notices(event_id);
  `);
  // Migration: add profile_emoji if missing (existing DBs)
  let cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "profile_emoji")) {
    db.exec("ALTER TABLE users ADD COLUMN profile_emoji TEXT");
  }
  if (!cols.some((c) => c.name === "reset_token")) {
    db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT");
  }
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "reset_token_expires")) {
    db.exec("ALTER TABLE users ADD COLUMN reset_token_expires INTEGER");
  }
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }
  // Optional event details (admins can edit)
  let eventCols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  for (const col of ["title", "description", "location", "time"]) {
    if (!eventCols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE events ADD COLUMN ${col} TEXT`);
    }
    eventCols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  }
  const signupCols = db.prepare("PRAGMA table_info(event_signups)").all() as { name: string }[];
  if (!signupCols.some((c) => c.name === "guest_count")) {
    db.exec("ALTER TABLE event_signups ADD COLUMN guest_count INTEGER NOT NULL DEFAULT 0");
  }
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "first_name")) {
    db.exec("ALTER TABLE users ADD COLUMN first_name TEXT");
  }
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "last_name")) {
    db.exec("ALTER TABLE users ADD COLUMN last_name TEXT");
  }
  return db;
}

export type User = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  email_verified: number;
  verification_token: string | null;
  verification_expires: number | null;
  created_at: number;
  profile_emoji?: string | null;
  reset_token?: string | null;
  reset_token_expires?: number | null;
  is_admin?: number;
  first_name?: string | null;
  last_name?: string | null;
};

export type Event = {
  id: number;
  event_date: string;
  created_at: number;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  time?: string | null;
};

const DEFAULT_EVENT_HOUR = 10;
const DEFAULT_EVENT_MINUTE = 30;
const EVENT_END_HOURS_AFTER_START = 2;

/** Parse time string like "10:30am" or "14:00" to { hour, minute } in 24h. Default 10:30. */
function parseEventTime(timeStr: string | null | undefined): { hour: number; minute: number } {
  if (!timeStr || typeof timeStr !== "string") {
    return { hour: DEFAULT_EVENT_HOUR, minute: DEFAULT_EVENT_MINUTE };
  }
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):?(\d{2})\s*(am|pm)?$/i);
  if (!match) return { hour: DEFAULT_EVENT_HOUR, minute: DEFAULT_EVENT_MINUTE };
  let hour = parseInt(match[1], 10);
  const minute = Math.min(59, Math.max(0, parseInt(match[2], 10) || 0));
  const ampm = (match[3] || "").toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  return { hour: Math.min(23, Math.max(0, hour)), minute };
}

/** True if the event's start time + 2 hours is in the past (event has ended). */
/** True if the event start time is in the past (no more sign-ups). */
export function isEventStarted(event: { event_date: string; time?: string | null }): boolean {
  const [y, m, d] = event.event_date.split("-").map(Number);
  if (!y || !m || !d) return false;
  const { hour, minute } = parseEventTime(event.time);
  const start = new Date(y, m - 1, d, hour, minute, 0, 0);
  return Date.now() >= start.getTime();
}

/** True if the event start time + 2 hours is in the past (event has ended). */
export function isEventEnded(event: { event_date: string; time?: string | null }): boolean {
  const [y, m, d] = event.event_date.split("-").map(Number);
  if (!y || !m || !d) return false;
  const { hour, minute } = parseEventTime(event.time);
  const start = new Date(y, m - 1, d, hour, minute, 0, 0);
  const end = new Date(start.getTime() + EVENT_END_HOURS_AFTER_START * 60 * 60 * 1000);
  return Date.now() > end.getTime();
}

export type EventSignup = {
  id: number;
  event_id: number;
  user_id: number;
  created_at: number;
  guest_count?: number;
};

export function getDb(): Database.Database {
  if (!_db) {
    ensureDbDirectory();
    _db = createDb();
  }
  return _db;
}

export function ensureDbDirectory() {
  const dbPath =
    process.env.DATABASE_PATH ??
    (process.env.NODE_ENV === "production" ? path.join("/tmp", "reservation.db") : path.join(process.cwd(), "data", "reservation.db"));
  const dir = path.dirname(dbPath);
  if (dir !== "/tmp" && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function initDb(): Database.Database {
  ensureDbDirectory();
  _db = createDb();
  return _db;
}

export function getNextSaturdays(count: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  let d = new Date(now);
  const day = d.getDay();
  const daysUntilSaturday = (6 - day + 7) % 7;
  if (daysUntilSaturday === 0 && d.getHours() >= 12) {
    d.setDate(d.getDate() + 7);
  } else {
    d.setDate(d.getDate() + (daysUntilSaturday || 7));
  }
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

/** SQLite %w: 0=Sunday, 6=Saturday. Only Saturday sessions are kept. */
const SATURDAY_DOW = "6";

export function ensureSaturdayEvents(db: Database.Database, count = 12) {
  // Remove any non-Saturday events (e.g. Friday); signups/notices CASCADE
  db.prepare("DELETE FROM events WHERE strftime('%w', event_date) != ?").run(SATURDAY_DOW);
  const saturdays = getNextSaturdays(count);
  const insert = db.prepare("INSERT OR IGNORE INTO events (event_date) VALUES (?)");
  for (const date of saturdays) {
    insert.run(date);
  }
}

/** True if event_date (YYYY-MM-DD) is a Saturday. */
export function isSaturdayEvent(eventDate: string): boolean {
  const [y, m, d] = eventDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  const day = new Date(y, m - 1, d).getDay();
  return day === 6;
}

export function updateEvent(
  db: Database.Database,
  eventId: number,
  updates: {
    event_date?: string;
    title?: string | null;
    description?: string | null;
    location?: string | null;
    time?: string | null;
  }
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.event_date !== undefined) {
    fields.push("event_date = ?");
    values.push(updates.event_date);
  }
  if (updates.title !== undefined) {
    fields.push("title = ?");
    values.push(updates.title || null);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description || null);
  }
  if (updates.location !== undefined) {
    fields.push("location = ?");
    values.push(updates.location || null);
  }
  if (updates.time !== undefined) {
    fields.push("time = ?");
    values.push(updates.time || null);
  }
  if (fields.length === 0) return;
  values.push(eventId);
  db.prepare(`UPDATE events SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export type Notice = {
  id: number;
  event_id: number;
  message: string;
  created_at: number;
  created_by: number | null;
};

export function createNotice(
  db: Database.Database,
  opts: { eventId: number; message: string; createdBy?: number }
): Notice {
  const run = db
    .prepare("INSERT INTO notices (event_id, message, created_by) VALUES (?, ?, ?)")
    .run(opts.eventId, opts.message.trim(), opts.createdBy ?? null);
  const row = db.prepare("SELECT id, event_id, message, created_at, created_by FROM notices WHERE id = ?").get(
    run.lastInsertRowid
  ) as Notice;
  return row;
}

/** Notices for events the user has signed up for, excluding dismissed, newest first */
export function getNoticesForUser(db: Database.Database, userId: number): (Notice & { event_date: string })[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.event_id, n.message, n.created_at, n.created_by, e.event_date
       FROM notices n
       INNER JOIN events e ON e.id = n.event_id
       INNER JOIN event_signups s ON s.event_id = n.event_id AND s.user_id = ?
       LEFT JOIN notice_dismissals d ON d.notice_id = n.id AND d.user_id = ?
       WHERE d.notice_id IS NULL
       ORDER BY n.created_at DESC`
    )
    .all(userId, userId) as (Notice & { event_date: string })[];
  return rows;
}

export function dismissNotice(db: Database.Database, userId: number, noticeId: number): void {
  db.prepare("INSERT OR IGNORE INTO notice_dismissals (user_id, notice_id) VALUES (?, ?)").run(userId, noticeId);
}

/** Single notice by id with event info, or null */
export function getNoticeById(
  db: Database.Database,
  noticeId: number
): (Notice & { event_date: string; event_title: string | null }) | null {
  const row = db
    .prepare(
      `SELECT n.id, n.event_id, n.message, n.created_at, n.created_by, e.event_date, e.title as event_title
       FROM notices n
       JOIN events e ON e.id = n.event_id
       WHERE n.id = ?`
    )
    .get(noticeId) as (Notice & { event_date: string; event_title: string | null }) | undefined;
  return row ?? null;
}

/** All notices with event info, newest first (for admin listing) */
export function getNoticesList(db: Database.Database): (Notice & { event_date: string; event_title: string | null })[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.event_id, n.message, n.created_at, n.created_by, e.event_date, e.title as event_title
       FROM notices n
       JOIN events e ON e.id = n.event_id
       ORDER BY n.created_at DESC`
    )
    .all() as (Notice & { event_date: string; event_title: string | null })[];
  return rows;
}
