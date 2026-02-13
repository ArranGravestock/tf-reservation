import { useEffect, useState } from "react";
import { data, Form, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/verify-email";

const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

export function meta({}: Route.MetaArgs) {
  return [{ title: "Verify email – Terrible Football Liverpool" }];
}

export async function loader({ request }: { request: Request }) {
  const { getUserId } = await import("~/lib/auth.server");
  const { getDb } = await import("~/lib/db.server");
  const { getSession } = await import("~/lib/session.server");
  const userId = await getUserId(request);
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const sent = url.searchParams.get("sent");

  if (userId && !token) {
    const db = getDb();
    const user = db.prepare("SELECT email_verified FROM users WHERE id = ?").get(userId) as { email_verified: number } | undefined;
    if (user?.email_verified) return redirect("/events");
  }

  if (token) {
    const db = getDb();
    const row = db.prepare(
      "SELECT id FROM users WHERE verification_token = ? AND verification_expires > unixepoch()"
    ).get(token) as { id: number } | undefined;
    if (row) {
      db.prepare(
        "UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?"
      ).run(row.id);
      return redirect("/login?verified=1");
    }
  }

  const session = await getSession(request);
  const lastResend = session.get("lastVerificationResend") as number | undefined;
  const resendCooldownUntil = lastResend ? lastResend + RESEND_COOLDOWN_MS : null;

  return { sent: !!sent, hasUserId: !!userId, resendCooldownUntil };
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return redirect("/verify-email");
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "resend") {
    const { getUserId, createVerificationToken } = await import("~/lib/auth.server");
    const { getDb } = await import("~/lib/db.server");
    const { getSession, commitSession } = await import("~/lib/session.server");
    const { isEmailConfigured, sendVerificationEmail } = await import("~/lib/email.server");
    const userId = await getUserId(request);
    if (!userId) return redirect("/login");
    const session = await getSession(request);
    const lastResend = session.get("lastVerificationResend") as number | undefined;
    const now = Date.now();
    if (lastResend != null && now < lastResend + RESEND_COOLDOWN_MS) {
      return {
        error: "Please wait a minute before requesting another email.",
        resendCooldownUntil: lastResend + RESEND_COOLDOWN_MS,
      };
    }
    if (!isEmailConfigured()) {
      return { error: "Email is not configured.", resendCooldownUntil: null };
    }
    const db = getDb();
    const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string } | undefined;
    if (!user) return redirect("/login");
    const { token, expires } = createVerificationToken();
    db.prepare("UPDATE users SET verification_token = ?, verification_expires = ? WHERE id = ?").run(
      token,
      Math.floor(expires / 1000),
      userId
    );
    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/verify-email?token=${token}`;
    try {
      await sendVerificationEmail(user.email, verifyUrl);
    } catch (err) {
      console.error("Resend verification email failed:", err);
      const message = err instanceof Error ? err.message : "Failed to send email.";
      return { error: `Could not send email: ${message}`, resendCooldownUntil: null };
    }
    session.set("lastVerificationResend", now);
    const headers = new Headers();
    headers.set("Set-Cookie", await commitSession(session));
    return data({ ok: true, resendCooldownUntil: now + RESEND_COOLDOWN_MS }, { headers });
  }

  if (process.env.NODE_ENV !== "production") {
    const { getUserId } = await import("~/lib/auth.server");
    const { getDb } = await import("~/lib/db.server");
    const userId = await getUserId(request);
    if (!userId) return redirect("/login");
    const db = getDb();
    db.prepare(
      "UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?"
    ).run(userId);
    return redirect("/events");
  }

  return redirect("/verify-email");
}

export default function VerifyEmail() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { sent, hasUserId, resendCooldownUntil: loaderCooldown } = loaderData;
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const isDev = import.meta.env.DEV;

  const resendCooldownUntil = (actionData && "resendCooldownUntil" in actionData && actionData.resendCooldownUntil) ?? loaderCooldown ?? null;
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    resendCooldownUntil ? Math.max(0, Math.ceil((resendCooldownUntil - Date.now()) / 1000)) : 0
  );

  useEffect(() => {
    if (resendCooldownUntil) {
      setSecondsLeft(Math.max(0, Math.ceil((resendCooldownUntil - Date.now()) / 1000)));
    }
  }, [resendCooldownUntil]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        const next = resendCooldownUntil ? Math.max(0, Math.ceil((resendCooldownUntil - Date.now()) / 1000)) : 0;
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldownUntil, secondsLeft]);

  if (token) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6">
        <div className="text-center text-[15px] text-neutral-500 dark:text-neutral-400">
          Verifying...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-800/80 p-8 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60 text-center space-y-5">
        <h1 className="text-[22px] font-semibold text-neutral-900 dark:text-white">
          Check your email
        </h1>
        {sent || (actionData && "ok" in actionData && actionData.ok) ? (
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            We&apos;ve sent you a verification link. Click the link in the email to verify your account, then sign in.
          </p>
        ) : (
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Enter the verification link from your email in the address bar, or request a new one below.
          </p>
        )}
        {actionData && "error" in actionData && actionData.error && (
          <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
            {actionData.error}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {hasUserId && (
            <Form method="post" className="contents">
              <input type="hidden" name="intent" value="resend" />
              <button
                type="submit"
                disabled={secondsLeft > 0}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 px-5 py-2.5 text-[17px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {secondsLeft > 0 ? `Resend email in ${secondsLeft}s` : "Resend email"}
              </button>
            </Form>
          )}
          <form method="post" action="/logout" className="contents">
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0A84FF] px-5 py-2.5 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
            >
              Back to sign in
            </button>
          </form>
          {isDev && hasUserId && (
            <Form method="post">
              <button
                type="submit"
                className="text-[15px] text-neutral-500 dark:text-neutral-400 hover:text-[#0A84FF] underline"
              >
                Development: mark my account as verified and go to sessions
              </button>
            </Form>
          )}
        </div>
      </div>
    </main>
  );
}
