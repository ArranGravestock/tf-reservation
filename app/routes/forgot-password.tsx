import { Form, Link, useActionData } from "react-router";
import type { Route } from "./+types/forgot-password";
import { requestPasswordReset } from "~/lib/auth.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Forgot password – Terrible Football Liverpool" }];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const result = await requestPasswordReset(email);
  if (result.error) return { error: result.error };
  return { success: true };
}

export default function ForgotPassword() {
  const actionData = useActionData<typeof action>();

  if (actionData?.success) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6">
        <div className="w-full max-w-[340px] rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60 text-center space-y-4">
          <h1 className="text-[22px] font-semibold text-neutral-900 dark:text-white">
            Check your email
          </h1>
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            If an account exists for that email, we&apos;ve sent a link to reset your password. The link expires in 1 hour.
          </p>
          <Link
            to="/login"
            className="inline-block rounded-xl bg-[#0A84FF] px-5 py-2.5 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6">
      <div className="w-full max-w-[340px] space-y-8">
        <div className="text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900 dark:text-white">
            Forgot password?
          </h1>
          <p className="mt-2 text-[15px] text-neutral-500 dark:text-neutral-400">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
        </div>
        <Form
          method="post"
          className="space-y-5 rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60"
        >
          {actionData?.error && (
            <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
              {actionData.error}
            </div>
          )}
          <div>
            <label
              htmlFor="email"
              className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="Your email address"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#0A84FF] px-4 py-3 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Send reset link
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
