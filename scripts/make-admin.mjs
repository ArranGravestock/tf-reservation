/**
 * One-off script: grant (or revoke) admin for a user by username.
 *
 * Run from project root against whichever DB the env points at:
 *   node scripts/make-admin.mjs <username>          # grant admin
 *   node scripts/make-admin.mjs <username> --revoke  # remove admin
 *
 * On Railway, run it INSIDE the deployment (so it opens the container's DB):
 *   railway ssh
 *   node scripts/make-admin.mjs ArranGravestock
 */
import Database from "better-sqlite3";
import path from "path";

const username = process.argv[2];
const revoke = process.argv.includes("--revoke");
if (!username) {
  console.error("Usage: node scripts/make-admin.mjs <username> [--revoke]");
  process.exit(1);
}

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "reservation.db");
const db = new Database(DB_PATH);

const user = db
  .prepare("SELECT id, username, email, is_admin FROM users WHERE username = ?")
  .get(username);

if (!user) {
  console.error(`No user found with username "${username}" in ${DB_PATH}`);
  process.exit(1);
}

const value = revoke ? 0 : 1;
db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(value, user.id);

const updated = db
  .prepare("SELECT id, username, email, is_admin FROM users WHERE id = ?")
  .get(user.id);
console.log(
  `${revoke ? "Revoked admin from" : "Granted admin to"} ${updated.username} ` +
    `(id=${updated.id}, email=${updated.email}) — is_admin=${updated.is_admin}`
);
