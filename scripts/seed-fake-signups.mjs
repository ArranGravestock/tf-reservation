/**
 * One-off script: creates 100 fake users and signs them up for the first event.
 * Run from project root: node scripts/seed-fake-signups.mjs
 */
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "reservation.db");
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Ensure we have at least one event (same logic as app)
const existing = db.prepare("SELECT id FROM events ORDER BY event_date ASC LIMIT 1").get();
let eventId;
if (existing) {
  eventId = existing.id;
} else {
  const now = new Date();
  let d = new Date(now);
  const day = d.getDay();
  const daysUntilSaturday = (6 - day + 7) % 7;
  d.setDate(d.getDate() + (daysUntilSaturday || 7));
  const dateStr = d.toISOString().slice(0, 10);
  db.prepare("INSERT INTO events (event_date, created_at) VALUES (?, unixepoch())").run(dateStr);
  eventId = db.prepare("SELECT id FROM events ORDER BY id DESC LIMIT 1").get().id;
}

const passwordHash = await bcrypt.hash("fake-password-123", 10);
const insertUser = db.prepare(
  "INSERT OR IGNORE INTO users (username, email, password_hash, email_verified, created_at) VALUES (?, ?, ?, 1, unixepoch())"
);
const insertSignup = db.prepare(
  "INSERT OR IGNORE INTO event_signups (event_id, user_id, created_at) VALUES (?, ?, unixepoch())"
);

console.log("Using event id", eventId, "- creating 100 fake users and signups...");

for (let i = 1; i <= 100; i++) {
  const username = `fake_user_${i}`;
  const email = `fake${i}@example.com`;
  insertUser.run(username, email, passwordHash);
  const row = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (row) insertSignup.run(eventId, row.id);
}

const count = db.prepare("SELECT COUNT(*) as n FROM event_signups WHERE event_id = ?").get(eventId);
console.log("Done. Event", eventId, "now has", count.n, "signups.");
