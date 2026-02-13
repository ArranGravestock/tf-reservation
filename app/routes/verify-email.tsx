import { Form, redirect, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/verify-email";
import { getUserId } from "~/lib/auth.server";
import { getDb } from "~/lib/db";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Verify email – Terrible Football Liverpool" }];
}

export async function loader({ request }: { request: Request }) {
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

  return { sent: !!sent, hasUserId: !!userId };
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return redirect("/verify-email");
  if (process.env.NODE_ENV === "production") return redirect("/verify-email");
  const userId = await getUserId(request);
  if (!userId) return redirect("/login");
  const db = getDb();
  db.prepare(
    "UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?"
  ).run(userId);
  return redirect("/events");
}

export default function VerifyEmail() {
  const { sent, hasUserId } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const isDev = import.meta.env.DEV;

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
        {sent ? (
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            We&apos;ve sent you a verification link. Click the link in the email to verify your account, then sign in.
          </p>
        ) : (
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Enter the verification link from your email in the address bar, or request a new one from your account settings.
          </p>
        )}
        <div className="flex flex-col gap-3">
          <a
            href="/login"
            className="inline-block rounded-xl bg-[#0A84FF] px-5 py-2.5 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Back to sign in
          </a>
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
