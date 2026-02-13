import { useState } from "react";
import { Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/signup";
import { getUser, hashPassword, createVerificationToken } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { ANIMAL_EMOJIS, DEFAULT_PROFILE_EMOJI, isAllowedProfileEmoji } from "~/lib/emoji";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign up – Terrible Football Liverpool" }];
}

export async function loader({ request }: { request: Request }) {
  const user = await getUser(request);
  if (user?.email_verified) return redirect("/events");
  if (user && !user.email_verified) return redirect("/verify-email");
  return null;
}

export async function action({ request }: { request: Request }) {
  try {
    const formData = await request.formData();
    const username = String(formData.get("username") ?? "").trim();
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");
    const rawEmoji = String(formData.get("profileEmoji") ?? "").trim();
    const profileEmoji = isAllowedProfileEmoji(rawEmoji) ? rawEmoji.slice(0, 8) : DEFAULT_PROFILE_EMOJI;

    if (!username || !firstName || !lastName || !email || !password) {
      return { error: "All fields are required." };
    }
    if (username.length < 2) {
      return { error: "Username must be at least 2 characters." };
    }
    if (firstName.length < 1) {
      return { error: "Please enter your first name." };
    }
    if (lastName.length < 1) {
      return { error: "Please enter your last name." };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Please enter a valid email address." };
    }
    if (password.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }
    if (password !== confirm) {
      return { error: "Passwords do not match." };
    }

    const db = getDb();
    if (db.prepare("SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)").get(username)) {
      return { error: "Username is already taken." };
    }
    if (db.prepare("SELECT 1 FROM users WHERE LOWER(email) = ?").get(email)) {
      return { error: "An account with this email already exists." };
    }

    const passwordHash = await hashPassword(password);
    const { token, expires } = createVerificationToken();
    try {
      db.prepare(
        `INSERT INTO users (username, email, password_hash, email_verified, verification_token, verification_expires, first_name, last_name, profile_emoji)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`
      ).run(username, email, passwordHash, token, Math.floor(expires / 1000), firstName, lastName, profileEmoji);
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
      if (msg.includes("UNIQUE constraint failed") && msg.includes("username")) {
        return { error: "Username is already taken." };
      }
      if (msg.includes("UNIQUE constraint failed") && msg.includes("email")) {
        return { error: "An account with this email already exists." };
      }
      throw err;
    }

    const origin = getOrigin(request);
    const verifyUrl = `${origin}/verify-email?token=${token}`;

    const { isEmailConfigured, sendVerificationEmail } = await import("~/lib/email.server");
    if (!isEmailConfigured()) {
      return { error: "Email is not configured. Set SMTP_USER and SMTP_PASS." };
    }
    try {
      await sendVerificationEmail(email, verifyUrl);
    } catch (err) {
      console.error("Failed to send verification email:", err);
      const raw = err instanceof Error ? err.message : String(err);
      const isAuthError = /535|authentication failed|Invalid login/i.test(raw);
      const message = isAuthError
        ? "SMTP authentication failed. For Proton Mail: use a custom-domain address and the SMTP token from Settings → Proton Mail → IMAP/SMTP → SMTP tokens (not your account password)."
        : `Could not send email: ${raw}`;
      return { error: message };
    }
    return redirect("/verify-email?sent=1");
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status >= 300 && status < 400) throw err;
    }
    console.error("Signup action error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Something went wrong. Please try again. (${message})` };
  }
}

function getOrigin(request: Request): string {
  try {
    const url = new URL(request.url);
    return url.origin;
  } catch {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return host ? `${proto}://${host}` : "https://localhost";
  }
}

export default function Signup() {
  const actionData = useActionData<typeof action>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedEmojiIndex, setSelectedEmojiIndex] = useState(0);
  const selectedEmoji = ANIMAL_EMOJIS[selectedEmojiIndex];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6">
      <div className="w-full max-w-xl space-y-8">
        <div className="text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900 dark:text-white">
            Create account
          </h1>
          <p className="mt-2 text-[15px] text-neutral-500 dark:text-neutral-400">
            Terrible Football Liverpool
          </p>
          {import.meta.env.DEV && (
            <p className="mt-2 text-[13px] text-amber-600 dark:text-amber-400">
              Set SMTP_USER and SMTP_PASS in .env to receive the verification email.
            </p>
          )}
        </div>
        <Form
          method="post"
          action="/signup"
          className="space-y-5 rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60"
        >
          {actionData?.error && (
            <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
              {actionData.error}
            </div>
          )}
          <div>
            <label htmlFor="firstName" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              required
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="Your first name"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              required
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="Your last name"
            />
          </div>
          <div>
            <label htmlFor="username" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              minLength={2}
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="Choose a username"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="password" className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                Password
              </label>
              <span className="text-[13px] text-neutral-500 dark:text-neutral-400 shrink-0">
                At least 8 characters.
              </span>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 pr-12 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
                placeholder="Choose your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-600/50 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {showPassword ? "🙈" : "👁️"}
                </span>
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                placeholder="Confirm your password"
                className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 pr-12 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-600/50 transition-colors"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {showConfirmPassword ? "🙈" : "👁️"}
                </span>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-3">
              Profile emoji
            </label>
            <input type="hidden" name="profileEmoji" value={selectedEmoji} readOnly aria-hidden />
            <div className="flex flex-wrap gap-2">
              {ANIMAL_EMOJIS.map((emoji, index) => {
                const isSelected = index === selectedEmojiIndex;
                return (
                  <button
                    key={`emoji-${index}`}
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      setSelectedEmojiIndex(index);
                      (e.currentTarget as HTMLButtonElement).blur();
                    }}
                    aria-pressed={isSelected}
                    className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border-2 transition-colors focus:outline-none focus:ring-0 [&:focus]:outline-none [&:focus]:ring-0 ${
                      isSelected
                        ? "!border-[#0A84FF] !bg-[#0A84FF]/10 dark:!bg-[#0A84FF]/15"
                        : "border-neutral-100 bg-neutral-100 dark:border-neutral-700/50 dark:bg-neutral-700/50 hover:bg-neutral-200 dark:hover:bg-neutral-600/50"
                    }`}
                    title={`Choose ${emoji}`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
              Pick an animal emoji to show next to your name.
            </p>
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#0A84FF] px-4 py-3 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Sign up
          </button>
          <p className="text-center text-[15px] text-neutral-500 dark:text-neutral-400">
            Already have an account?{" "}
            <a href="/login" className="text-[#0A84FF] hover:underline">
              Sign in
            </a>
          </p>
        </Form>
      </div>
    </main>
  );
}
