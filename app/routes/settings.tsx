import { Form, Link, redirect, useActionData, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useState, useEffect } from "react";
import type { Route } from "./+types/settings";
import { requireVerifiedUser, updateUserProfile } from "~/lib/auth.server";
import { ANIMAL_EMOJIS, DEFAULT_PROFILE_EMOJI } from "~/lib/emoji";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Settings – Terrible Football Liverpool" }];
}

export async function loader({ request }: { request: Request }) {
  const user = await requireVerifiedUser(request);
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      profileEmoji: user.profile_emoji ?? null,
    },
  };
}

export async function action({ request }: { request: Request }) {
  const user = await requireVerifiedUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "profile") {
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const profileEmoji = formData.get("profileEmoji");
    if (!firstName) return { intent: "profile", error: "First name is required." };
    if (!lastName) return { intent: "profile", error: "Last name is required." };
    const error = await updateUserProfile(user.id, {
      firstName: firstName || null,
      lastName: lastName || null,
      profileEmoji:
        profileEmoji !== undefined && profileEmoji !== null && String(profileEmoji).trim() !== ""
          ? String(profileEmoji).trim()
          : undefined,
    });
    if (error) return { intent: "profile", error: error.error };
    return redirect("/settings?updated=profile");
  }

  if (intent === "email") {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const emailChanging = email !== (user.email ?? "").toLowerCase();
    if (emailChanging && !currentPassword.trim()) {
      return { intent: "email", error: "Current password is required to change email." };
    }
    const error = await updateUserProfile(user.id, {
      email: email || undefined,
      currentPassword: emailChanging ? currentPassword : undefined,
    });
    if (error) return { intent: "email", error: error.error };
    return redirect("/settings?updated=email");
  }

  if (intent === "password") {
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    const allEmpty = !currentPassword.trim() && !newPassword.trim() && !confirmPassword.trim();
    if (allEmpty) {
      return { intent: "password", error: "Fill in the fields below to change your password." };
    }
    if (newPassword.length > 0 && newPassword !== confirmPassword) {
      return { intent: "password", error: "New password and confirmation do not match." };
    }
    if (newPassword.length > 0 && !currentPassword.trim()) {
      return { intent: "password", error: "Current password is required to change password." };
    }
    if (newPassword.length === 0) {
      return redirect("/settings");
    }
    const error = await updateUserProfile(user.id, {
      currentPassword,
      newPassword,
    });
    if (error) return { intent: "password", error: error.error };
    return redirect("/settings?updated=password");
  }

  return redirect("/settings");
}

export default function Settings() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const updatedProfile = searchParams.get("updated") === "profile";
  const updatedEmail = searchParams.get("updated") === "email";
  const updatedPassword = searchParams.get("updated") === "password";
  const resolvedInitialEmoji =
    user.profileEmoji && ANIMAL_EMOJIS.includes(user.profileEmoji as (typeof ANIMAL_EMOJIS)[number])
      ? user.profileEmoji
      : DEFAULT_PROFILE_EMOJI;
  const [selectedEmoji, setSelectedEmoji] = useState(resolvedInitialEmoji);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
  const navigate = useNavigate();

  useEffect(() => {
    if (updatedProfile) {
      const t = setTimeout(() => navigate("/settings", { replace: true }), 3000);
      return () => clearTimeout(t);
    }
  }, [updatedProfile, navigate]);

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-xl mx-auto">
        <Link
          to="/events"
          className="text-[15px] text-[#0A84FF] hover:opacity-80 mb-6 inline-block"
        >
          ← Back to sessions
        </Link>
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
          Settings
        </h1>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-8">
          Update your profile and account settings.
        </p>

        <div className="rounded-3xl bg-white dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 shadow-sm p-8 mb-8 text-center">
          <div className="flex justify-center mb-4">
            <span
              className="text-6xl sm:text-7xl w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-700/50 border border-neutral-200/80 dark:border-neutral-600/60"
              aria-hidden
            >
              {selectedEmoji}
            </span>
          </div>
          <p className="text-[22px] font-semibold text-neutral-900 dark:text-white tracking-tight">
            {fullName}
          </p>
          {user.email && (
            <p className="mt-1 text-[15px] text-neutral-500 dark:text-neutral-400">
              {user.email}
            </p>
          )}
        </div>

        {updatedProfile && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-neutral-800 dark:bg-neutral-700 text-white pl-5 pr-2 py-3 text-[15px] font-medium shadow-lg border border-neutral-700/80"
          >
            <span>Profile updated.</span>
            <button
              type="button"
              onClick={() => navigate("/settings", { replace: true })}
              className="rounded-lg p-1.5 hover:bg-white/10 active:bg-white/20 transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {updatedEmail && (
          <div className="rounded-2xl bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400 px-4 py-3 mb-6 text-[15px]">
            Email updated.
          </div>
        )}
        {updatedPassword && (
          <div className="rounded-2xl bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400 px-4 py-3 mb-6 text-[15px]">
            Password updated.
          </div>
        )}

        <Form
          method="post"
          className="space-y-5 rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60 mb-8"
        >
          <input type="hidden" name="intent" value="profile" />
          {actionData?.intent === "profile" && actionData?.error && (
            <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
              {actionData.error}
            </div>
          )}

          <div>
            <label className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-3">
              Profile emoji
            </label>
            <input type="hidden" name="profileEmoji" value={selectedEmoji} readOnly aria-hidden />
            <div className="flex flex-wrap gap-2">
              {ANIMAL_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-colors ${
                    selectedEmoji === emoji
                      ? "bg-[#0A84FF]/15 dark:bg-[#0A84FF]/20 ring-2 ring-[#0A84FF] ring-offset-2 dark:ring-offset-neutral-800"
                      : "bg-neutral-100 dark:bg-neutral-700/50 hover:bg-neutral-200 dark:hover:bg-neutral-600/50"
                  }`}
                  title={`Choose ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
              Pick an animal emoji to show next to your name.
            </p>
          </div>

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
              defaultValue={user.firstName ?? ""}
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
              defaultValue={user.lastName ?? ""}
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
              type="text"
              defaultValue={user.username}
              disabled
              aria-readonly
              className="w-full rounded-xl bg-neutral-200/80 dark:bg-neutral-700/80 border-0 px-4 py-3 text-[17px] text-neutral-600 dark:text-neutral-400 cursor-not-allowed"
            />
            <p className="mt-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
              Username cannot be changed.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 px-4 py-3 text-[17px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
          >
            Save profile
          </button>
        </Form>

        <Form
          method="post"
          className="space-y-5 rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60 mb-8"
        >
          <input type="hidden" name="intent" value="email" />
          {actionData?.intent === "email" && actionData?.error && (
            <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
              {actionData.error}
            </div>
          )}

          <h2 className="text-[17px] font-semibold text-neutral-900 dark:text-white">
            Email
          </h2>
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400 -mt-1">
            Changing your email requires your current password.
          </p>

          <div>
            <label htmlFor="accountEmail" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Email
            </label>
            <input
              id="accountEmail"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={user.email}
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
            />
            <p className="mt-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
              If you change your email, you’ll need to verify it again.
            </p>
          </div>

          <div>
            <label htmlFor="emailCurrentPassword" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Current password
            </label>
            <input
              id="emailCurrentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="Required when changing email"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 px-4 py-3 text-[17px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
          >
            Save email
          </button>
        </Form>

        <Form
          method="post"
          className="space-y-5 rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60"
        >
          <input type="hidden" name="intent" value="password" />
          {actionData?.intent === "password" && actionData?.error && (
            <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
              {actionData.error}
            </div>
          )}

          <h2 className="text-[17px] font-semibold text-neutral-900 dark:text-white">
            Password
          </h2>
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400 -mt-1">
            Enter your current password and a new password to change it.
          </p>

          <div>
            <label htmlFor="passwordCurrentPassword" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Current password
            </label>
            <input
              id="passwordCurrentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="Current password"
            />
          </div>

          <div>
            <label htmlFor="accountNewPassword" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              New password
            </label>
            <input
              id="accountNewPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="accountConfirmPassword" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Confirm new password
            </label>
            <input
              id="accountConfirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Confirm your new password"
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 px-4 py-3 text-[17px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
          >
            Save password
          </button>
        </Form>
      </div>
    </main>
  );
}
