import { Form, Link, redirect, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/reset-password";
import { resetPasswordWithToken } from "~/lib/auth.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Reset password – Terrible Football Liverpool" }];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { error: "Invalid or expired reset link. Please request a new one." };
  if (password !== confirm) return { error: "Passwords do not match." };
  const err = await resetPasswordWithToken(token, password);
  if (err) return { error: err.error };
  return redirect("/login?reset=1");
}

export default function ResetPassword() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  if (!token) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6">
        <div className="w-full max-w-[340px] rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60 text-center space-y-4">
          <h1 className="text-[22px] font-semibold text-neutral-900 dark:text-white">
            Invalid link
          </h1>
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            This reset link is missing or invalid. Please request a new password reset from the sign in page.
          </p>
          <Link
            to="/forgot-password"
            className="inline-block rounded-xl bg-[#0A84FF] px-5 py-2.5 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Request reset link
          </Link>
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400">
            <Link to="/login" className="text-[#0A84FF] hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6">
      <div className="w-full max-w-[340px] space-y-8">
        <div className="text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900 dark:text-white">
            Set new password
          </h1>
          <p className="mt-2 text-[15px] text-neutral-500 dark:text-neutral-400">
            Enter your new password below.
          </p>
        </div>
        <Form
          method="post"
          className="space-y-5 rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60"
        >
          <input type="hidden" name="token" value={token} />
          {actionData?.error && (
            <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
              {actionData.error}
            </div>
          )}
          <div>
            <label
              htmlFor="password"
              className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5"
            >
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label
              htmlFor="confirm"
              className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5"
            >
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="Confirm your password"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#0A84FF] px-4 py-3 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Reset password
          </button>
          <p className="text-center text-[15px] text-neutral-500 dark:text-neutral-400">
            <Link to="/login" className="text-[#0A84FF] hover:underline">
              Back to sign in
            </Link>
          </p>
        </Form>
      </div>
    </main>
  );
}
