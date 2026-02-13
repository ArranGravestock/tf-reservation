import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { redirect } from "react-router";
import { getDb, type User } from "./db";
import { getSession, commitSession, destroySession } from "./session.server";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getUserId(request: Request): Promise<number | null> {
  const session = await getSession(request);
  const userId = session.get("userId");
  if (typeof userId === "number") return userId;
  if (typeof userId === "string") return parseInt(userId, 10) || null;
  return null;
}

export async function getUser(request: Request): Promise<User | null> {
  const userId = await getUserId(request);
  if (!userId) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as User | undefined;
  return row ?? null;
}

export async function requireUserId(request: Request): Promise<number> {
  const userId = await getUserId(request);
  if (!userId) throw redirect("/login");
  return userId;
}

export async function requireVerifiedUser(request: Request): Promise<User> {
  const user = await getUser(request);
  if (!user) throw redirect("/login");
  if (!user.email_verified) throw redirect("/verify-email");
  return user;
}

export function isAdmin(user: User): boolean {
  return !!(user as { is_admin?: number }).is_admin;
}

export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireVerifiedUser(request);
  if (!isAdmin(user)) throw new Response("Forbidden", { status: 403 });
  return user;
}

export async function login(
  request: Request,
  username: string,
  password: string
): Promise<{ error: string } | { headers: Headers }> {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as User | undefined;
  if (!user) return { error: "Invalid username or password" };
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { error: "Invalid username or password" };
  const session = await getSession(request);
  session.set("userId", user.id);
  const headers = new Headers();
  headers.set("Set-Cookie", await commitSession(session));
  return { headers };
}

export async function logout(request: Request): Promise<Headers> {
  const session = await getSession(request);
  const headers = new Headers();
  headers.set("Set-Cookie", await destroySession(session));
  return headers;
}

export function createVerificationToken(): { token: string; expires: number } {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + 24 * 60 * 60 * 1000; // 24h
  return { token, expires };
}

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export function createPasswordResetToken(): { token: string; expires: number } {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + RESET_TOKEN_EXPIRY_MS;
  return { token, expires };
}

/** Request password reset: find user by email, set token, and send reset link. In dev, logs link to console. */
export async function requestPasswordReset(email: string): Promise<{ error?: string; ok?: true }> {
  const db = getDb();
  const normalized = String(email).trim().toLowerCase();
  if (!normalized) return { error: "Please enter your email address." };
  const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(normalized) as
    | { id: number; email: string }
    | undefined;
  if (!user) {
    // Don't reveal whether the email exists
    return { ok: true };
  }
  const { token, expires } = createPasswordResetToken();
  db.prepare("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?").run(
    token,
    expires,
    user.id
  );
  const baseUrl = process.env.ORIGIN ?? "http://localhost:5173";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  if (process.env.NODE_ENV === "production") {
    // TODO: send email via Resend/SendGrid/etc.
    // await sendPasswordResetEmail(user.email, resetUrl);
  } else {
    console.log("[dev] Password reset link:", resetUrl);
  }
  return { ok: true };
}

/** Validate reset token and set new password. Returns error message or null on success. */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ error: string } | null> {
  const t = String(token).trim();
  if (!t) return { error: "Invalid or expired reset link." };
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };
  const db = getDb();
  const user = db
    .prepare(
      "SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?"
    )
    .get(t, Date.now()) as { id: number } | undefined;
  if (!user) return { error: "Invalid or expired reset link. Please request a new one." };
  const hash = await hashPassword(newPassword);
  db.prepare(
    "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?"
  ).run(hash, user.id);
  return null;
}

export async function updateUserProfile(
  userId: number,
  options: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string;
    email?: string;
    profileEmoji?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }
): Promise<{ error: string } | null> {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as User | undefined;
  if (!user) return { error: "User not found" };

  const emailChanging =
    options.email !== undefined && options.email.trim().toLowerCase() !== (user.email ?? "");
  const passwordChanging =
    options.newPassword !== undefined && options.newPassword.length > 0;
  const needsVerification = emailChanging || passwordChanging;
  if (needsVerification) {
    if (!options.currentPassword || options.currentPassword.trim() === "") {
      return { error: "Current password is required to change email or password." };
    }
    const ok = await verifyPassword(options.currentPassword, user.password_hash);
    if (!ok) return { error: "Current password is incorrect." };
  }

  if (options.firstName !== undefined) {
    const v = options.firstName === "" ? null : String(options.firstName).trim().slice(0, 100);
    db.prepare("UPDATE users SET first_name = ? WHERE id = ?").run(v, userId);
  }
  if (options.lastName !== undefined) {
    const v = options.lastName === "" ? null : String(options.lastName).trim().slice(0, 100);
    db.prepare("UPDATE users SET last_name = ? WHERE id = ?").run(v, userId);
  }

  if (options.profileEmoji !== undefined && options.profileEmoji !== null && String(options.profileEmoji).trim() !== "") {
    const emoji = String(options.profileEmoji).trim().slice(0, 8);
    db.prepare("UPDATE users SET profile_emoji = ? WHERE id = ?").run(emoji, userId);
  }

  if (options.username !== undefined) {
    const u = String(options.username).trim();
    if (u.length < 2) return { error: "Username must be at least 2 characters." };
    if (u !== user.username && db.prepare("SELECT 1 FROM users WHERE username = ?").get(u)) {
      return { error: "Username is already taken." };
    }
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run(u, userId);
  }

  if (options.email !== undefined) {
    const e = String(options.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { error: "Please enter a valid email address." };
    if (e !== user.email && db.prepare("SELECT 1 FROM users WHERE email = ?").get(e)) {
      return { error: "An account with this email already exists." };
    }
    db.prepare(
      "UPDATE users SET email = ?, email_verified = 0, verification_token = NULL, verification_expires = NULL WHERE id = ?"
    ).run(e, userId);
  }

  if (options.newPassword !== undefined && options.newPassword.length > 0) {
    if (options.newPassword.length < 8) return { error: "New password must be at least 8 characters." };
    const hash = await hashPassword(options.newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
  }

  return null;
}
