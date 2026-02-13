import { useState } from "react";
import { Form, redirect, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { getUserId } from "~/lib/auth.server";
import { login } from "~/lib/auth.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Login – Terrible Football Liverpool" }];
}

export async function loader({ request }: { request: Request }) {
  const userId = await getUserId(request);
  if (userId) return redirect("/events");
  return null;
}

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) {
    return { error: "Username and password are required." };
  }
  const result = await login(request, username, password);
  if ("error" in result) return { error: result.error };
  return redirect("/events", { headers: result.headers });
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const verified = searchParams.get("verified") === "1";
  const reset = searchParams.get("reset") === "1";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6">
      <div className="w-full max-w-[340px] space-y-8">
        <div className="text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900 dark:text-white">
            Terrible Football{" "}
            <span className="bg-gradient-to-r from-red-500 via-red-600 to-red-700 dark:from-red-400 dark:via-red-500 dark:to-red-600 bg-clip-text text-transparent">
              Liverpool
            </span>
          </h1>
          <p className="mt-2 text-[15px] text-neutral-500 dark:text-neutral-400">
            Sign in to your account
          </p>
        </div>
        {verified && (
          <div className="rounded-2xl bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400 px-4 py-3 text-center text-[15px]">
            Your email has been verified. You can sign in now.
          </div>
        )}
        {reset && (
          <div className="rounded-2xl bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400 px-4 py-3 text-center text-[15px]">
            Your password has been reset. You can sign in now.
          </div>
        )}
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
            <label htmlFor="username" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="Your username"
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="password" className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                Password
              </label>
              <a href="/forgot-password" className="text-[13px] text-[#0A84FF] hover:underline shrink-0">
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="Your password"
                className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 pr-12 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
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
          <button
            type="submit"
            className="w-full rounded-xl bg-[#0A84FF] px-4 py-3 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Sign in
          </button>
          <p className="text-center text-[15px] text-neutral-500 dark:text-neutral-400">
            Don&apos;t have an account?{" "}
            <a href="/signup" className="text-[#0A84FF] hover:underline">
              Sign up
            </a>
          </p>
        </Form>
      </div>
    </main>
  );
}
