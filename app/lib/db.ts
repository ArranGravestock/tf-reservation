import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "reservation.db");

let _db: Database.Database | null = null;

function createDb(): Database.Database {
  const db = new Database(DB_PATH);
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
      event_date TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS event_hosts (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (event_id, user_id)
    );

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
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "is_super_admin")) {
    // Super admins are the only ones who can grant/revoke admin status.
    db.exec("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0");
  }
  // Optional event details (admins can edit)
  let eventCols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  for (const col of ["title", "description", "location", "time"]) {
    if (!eventCols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE events ADD COLUMN ${col} TEXT`);
    }
    eventCols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  }
  eventCols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  if (!eventCols.some((c) => c.name === "cancelled")) {
    db.exec("ALTER TABLE events ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0");
  }
  eventCols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  if (!eventCols.some((c) => c.name === "custom")) {
    // One-off events an admin created directly, as opposed to the auto-generated
    // Saturday/Wednesday recurring ones; exempt from the recurring-day gate.
    db.exec("ALTER TABLE events ADD COLUMN custom INTEGER NOT NULL DEFAULT 0");
  }
  eventCols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  if (!eventCols.some((c) => c.name === "content")) {
    // Longer-form, Markdown-rendered content shown on the event page — separate
    // from the plain-text `description` used in listings/summaries.
    db.exec("ALTER TABLE events ADD COLUMN content TEXT");
  }
  // Drop the legacy UNIQUE(event_date) constraint so multiple events (e.g. a
  // custom event alongside the regular recurring one) can share a date. SQLite
  // can't drop an inline UNIQUE column constraint via ALTER TABLE, so rebuild
  // the table without it, preserving all rows and columns.
  const eventsTableDef = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'events'")
    .get() as { sql: string } | undefined;
  if (eventsTableDef && /event_date\s+TEXT\s+UNIQUE/i.test(eventsTableDef.sql)) {
    db.exec(`
      CREATE TABLE events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_date TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        title TEXT,
        description TEXT,
        location TEXT,
        time TEXT,
        cancelled INTEGER NOT NULL DEFAULT 0,
        custom INTEGER NOT NULL DEFAULT 0,
        content TEXT
      );
      INSERT INTO events_new (id, event_date, created_at, title, description, location, time, cancelled, custom, content)
        SELECT id, event_date, created_at, title, description, location, time, cancelled, custom, content FROM events;
      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;
      CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
    `);
  }
  let signupCols = db.prepare("PRAGMA table_info(event_signups)").all() as { name: string }[];
  if (!signupCols.some((c) => c.name === "guest_count")) {
    db.exec("ALTER TABLE event_signups ADD COLUMN guest_count INTEGER NOT NULL DEFAULT 0");
  }
  signupCols = db.prepare("PRAGMA table_info(event_signups)").all() as { name: string }[];
  if (!signupCols.some((c) => c.name === "attendance_status")) {
    // Admin-only marker: null (default), 'late', 'attended', or 'did_not_attend'.
    db.exec("ALTER TABLE event_signups ADD COLUMN attendance_status TEXT");
  }
  signupCols = db.prepare("PRAGMA table_info(event_signups)").all() as { name: string }[];
  if (!signupCols.some((c) => c.name === "late_ack")) {
    // Whether the user has dismissed the "you were marked late" modal for this
    // signup. Defaults to 1 (acknowledged) so the column doesn't retroactively
    // pop up warnings for signups that were already marked late before this
    // feature existed; it's explicitly reset to 0 when a signup is newly marked late.
    db.exec("ALTER TABLE event_signups ADD COLUMN late_ack INTEGER NOT NULL DEFAULT 1");
  }
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "late_count")) {
    // Total number of times this user has been marked late across all events.
    db.exec("ALTER TABLE users ADD COLUMN late_count INTEGER NOT NULL DEFAULT 0");
  }
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "blocked_until")) {
    // Unix seconds until which the user is blocked from signing up for events
    // (set after a repeat late marking); NULL when not blocked.
    db.exec("ALTER TABLE users ADD COLUMN blocked_until INTEGER");
  }
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "first_name")) {
    db.exec("ALTER TABLE users ADD COLUMN first_name TEXT");
  }
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "last_name")) {
    db.exec("ALTER TABLE users ADD COLUMN last_name TEXT");
  }
  // Tracks whether the account has ever completed email verification. Once true
  // it stays true even if the user later changes their email (which resets the
  // per-email `email_verified` flag), so a previously verified user keeps access
  // while re-verifying a new address.
  cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "ever_verified")) {
    db.exec("ALTER TABLE users ADD COLUMN ever_verified INTEGER NOT NULL DEFAULT 0");
    // Backfill: anyone currently verified has verified at least once.
    db.exec("UPDATE users SET ever_verified = 1 WHERE email_verified = 1");
  }

  // Enforce case-insensitive uniqueness for usernames and emails at the DB level
  // (the app also checks with LOWER(), but these indexes guard against races and
  // direct writes). Wrapped because index creation fails if the existing data
  // already contains case-variant duplicates — in that case they must be
  // reconciled manually before the constraint can apply.
  try {
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE)"
    );
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_nocase ON users(email COLLATE NOCASE)"
    );
  } catch (err) {
    console.error(
      "[db] Could not create case-insensitive unique indexes (existing case-variant duplicates?):",
      err
    );
  }

  // Bootstrap admins from the ADMIN_USERNAMES env var (comma-separated). Runs on
  // startup so the first admin can be granted with a Railway variable alone —
  // no shell access needed. Idempotent; only promotes existing users, never
  // revokes. Re-applies automatically if the DB is ever recreated.
  const adminUsernames = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminUsernames.length > 0) {
    const promote = db.prepare("UPDATE users SET is_admin = 1 WHERE username = ? AND is_admin = 0");
    for (const uname of adminUsernames) {
      const res = promote.run(uname);
      if (res.changes > 0) console.log(`[db] Promoted "${uname}" to admin via ADMIN_USERNAMES`);
    }
  }

  // ArranGravestock is the default super admin: only super admins can grant or
  // revoke admin status. Idempotent and re-applies if the DB is ever recreated.
  const superAdminPromote = db.prepare(
    "UPDATE users SET is_admin = 1, is_super_admin = 1 WHERE LOWER(username) = LOWER(?) AND is_super_admin = 0"
  );
  const superAdminResult = superAdminPromote.run("ArranGravestock");
  if (superAdminResult.changes > 0) {
    console.log('[db] Promoted "ArranGravestock" to super admin');
  }

  return db;
}

export type User = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  email_verified: number;
  ever_verified?: number;
  verification_token: string | null;
  verification_expires: number | null;
  created_at: number;
  profile_emoji?: string | null;
  reset_token?: string | null;
  reset_token_expires?: number | null;
  is_admin?: number;
  is_super_admin?: number;
  first_name?: string | null;
  last_name?: string | null;
  late_count?: number;
  blocked_until?: number | null;
};

/** True while the user is serving a lateness block (blocked_until is in the future). */
export function isUserBlocked(user: { blocked_until?: number | null }): boolean {
  return !!(user.blocked_until && user.blocked_until > Math.floor(Date.now() / 1000));
}

export type Event = {
  id: number;
  event_date: string;
  created_at: number;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  time?: string | null;
  cancelled?: number;
  custom?: number;
  content?: string | null;
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

/** True if the event’s start time + 2 hours is in the past (event has ended). */
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

/** True if the given YYYY-MM-DD date falls on a Saturday. */
export function isSaturdayEvent(eventDate: string): boolean {
  const [y, m, d] = eventDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d, 12, 0, 0, 0).getDay() === 6;
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
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function initDb(): Database.Database {
  ensureDbDirectory();
  _db = createDb();
  return _db;
}

// Weekdays that have recurring events, with their default start time.
// day: 0=Sun … 6=Sat. cutoff is the time after which "today" rolls to next week.
const RECURRING_EVENT_DAYS = [
  { day: 6, time: null as string | null, cutoffHour: 12, cutoffMinute: 0 }, // Saturday, 10:30am default
  { day: 3, time: "6:20pm", cutoffHour: 18, cutoffMinute: 20 }, // Wednesday, 6:20pm
];

/** Upcoming dates (YYYY-MM-DD) for a given weekday, skipping today if past the cutoff. */
function getNextWeekdayDates(
  count: number,
  targetDay: number,
  cutoffHour: number,
  cutoffMinute: number
): string[] {
  const dates: string[] = [];
  const now = new Date();
  const d = new Date(now);
  const daysUntil = (targetDay - d.getDay() + 7) % 7;
  const pastCutoff =
    now.getHours() > cutoffHour ||
    (now.getHours() === cutoffHour && now.getMinutes() >= cutoffMinute);
  if (daysUntil === 0 && pastCutoff) {
    d.setDate(d.getDate() + 7);
  } else {
    d.setDate(d.getDate() + (daysUntil || 7));
  }
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

export function getNextSaturdays(count: number): string[] {
  return getNextWeekdayDates(count, 6, 12, 0);
}

/** Ensure the next `count` occurrences of every recurring event day exist. */
export function ensureRecurringEvents(db: Database.Database, count = 12) {
  // event_date is no longer globally unique (custom events can share a date
  // with a recurring one), so dedupe recurring events explicitly by checking
  // for an existing non-custom event on that date instead of relying on a
  // DB-level UNIQUE constraint.
  const existing = db.prepare("SELECT 1 FROM events WHERE event_date = ? AND custom = 0");
  const withTime = db.prepare("INSERT INTO events (event_date, time) VALUES (?, ?)");
  const withoutTime = db.prepare("INSERT INTO events (event_date) VALUES (?)");
  for (const cfg of RECURRING_EVENT_DAYS) {
    const dates = getNextWeekdayDates(count, cfg.day, cfg.cutoffHour, cfg.cutoffMinute);
    for (const date of dates) {
      if (existing.get(date)) continue;
      if (cfg.time) withTime.run(date, cfg.time);
      else withoutTime.run(date);
    }
  }
}

/** Back-compat wrapper: ensures all recurring (Saturday + Wednesday) events. */
export function ensureSaturdayEvents(db: Database.Database, count = 12) {
  ensureRecurringEvents(db, count);
}

/** True if the date falls on a recurring event day (Saturday or Wednesday). */
export function isEventDate(eventDate: string): boolean {
  const [y, m, d] = eventDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  const day = new Date(y, m - 1, d, 12, 0, 0, 0).getDay();
  return RECURRING_EVENT_DAYS.some((cfg) => cfg.day === day);
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
    content?: string | null;
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
  if (updates.content !== undefined) {
    fields.push("content = ?");
    values.push(updates.content || null);
  }
  if (fields.length === 0) return;
  values.push(eventId);
  db.prepare(`UPDATE events SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

/** Create a one-off admin event on any date (not restricted to the recurring Saturday/Wednesday slots). */
export function createCustomEvent(
  db: Database.Database,
  opts: {
    event_date: string;
    title?: string | null;
    description?: string | null;
    location?: string | null;
    time?: string | null;
    content?: string | null;
  }
): Event {
  const run = db
    .prepare(
      "INSERT INTO events (event_date, title, description, location, time, content, custom) VALUES (?, ?, ?, ?, ?, ?, 1)"
    )
    .run(
      opts.event_date,
      opts.title || null,
      opts.description || null,
      opts.location || null,
      opts.time || null,
      opts.content || null
    );
  return db.prepare("SELECT * FROM events WHERE id = ?").get(run.lastInsertRowid) as Event;
}

/** Usernames that host every event by default (case-insensitive). */
export const DEFAULT_HOST_USERNAMES = ["ArranGravestock", "Joel_Okoro"];

export type HostUser = {
  id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  profile_emoji: string | null;
};

/**
 * Hosts for an event: the default host users plus any admins who added
 * themselves via `event_hosts`. Default hosts are listed first, in order.
 */
export function getEventHosts(db: Database.Database, eventId: number): HostUser[] {
  const defaultPlaceholders = DEFAULT_HOST_USERNAMES.map(() => "LOWER(?)").join(", ");
  const rows = db
    .prepare(
      `SELECT id, username, first_name, last_name, profile_emoji FROM users
       WHERE LOWER(username) IN (${defaultPlaceholders})
          OR id IN (SELECT user_id FROM event_hosts WHERE event_id = ?)`
    )
    .all(...DEFAULT_HOST_USERNAMES, eventId) as HostUser[];
  const defaultOrder = DEFAULT_HOST_USERNAMES.map((u) => u.toLowerCase());
  return rows.sort((a, b) => {
    const ai = defaultOrder.indexOf(a.username.toLowerCase());
    const bi = defaultOrder.indexOf(b.username.toLowerCase());
    const ar = ai === -1 ? defaultOrder.length : ai;
    const br = bi === -1 ? defaultOrder.length : bi;
    if (ar !== br) return ar - br;
    return a.username.localeCompare(b.username);
  });
}

/** True if the user is a host of the event (default host or added themselves). */
export function isEventHost(db: Database.Database, eventId: number, userId: number): boolean {
  return getEventHosts(db, eventId).some((h) => h.id === userId);
}

/** Add or remove a user as an event host (via the event_hosts table). */
export function setEventHost(
  db: Database.Database,
  eventId: number,
  userId: number,
  isHost: boolean
): void {
  if (isHost) {
    db.prepare(
      "INSERT OR IGNORE INTO event_hosts (event_id, user_id) VALUES (?, ?)"
    ).run(eventId, userId);
  } else {
    db.prepare("DELETE FROM event_hosts WHERE event_id = ? AND user_id = ?").run(eventId, userId);
  }
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

export const LATE_BLOCK_SECONDS = 7 * 24 * 60 * 60;

export type LateWarning = {
  signupId: number;
  eventId: number;
  eventDate: string;
  eventTitle: string | null;
  blocked: boolean;
  blockedUntil: number | null;
};

/** Most recent not-yet-dismissed "you were marked late" warning for the user, or null. */
export function getLateWarningForUser(db: Database.Database, userId: number): LateWarning | null {
  const row = db
    .prepare(
      `SELECT s.id as signupId, s.event_id as eventId, e.event_date as eventDate, e.title as eventTitle
       FROM event_signups s
       JOIN events e ON e.id = s.event_id
       WHERE s.user_id = ? AND s.attendance_status = 'late' AND s.late_ack = 0
       ORDER BY s.created_at DESC
       LIMIT 1`
    )
    .get(userId) as { signupId: number; eventId: number; eventDate: string; eventTitle: string | null } | undefined;
  if (!row) return null;
  const user = db.prepare("SELECT blocked_until FROM users WHERE id = ?").get(userId) as
    | { blocked_until: number | null }
    | undefined;
  return {
    ...row,
    blocked: isUserBlocked({ blocked_until: user?.blocked_until ?? null }),
    blockedUntil: user?.blocked_until ?? null,
  };
}

export function acknowledgeLateWarning(db: Database.Database, userId: number, signupId: number): void {
  db.prepare("UPDATE event_signups SET late_ack = 1 WHERE id = ? AND user_id = ?").run(signupId, userId);
}
