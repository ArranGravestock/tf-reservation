import {
  Form,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { getUser } from "~/lib/auth.server";
import { getDb, getNoticesForUser } from "~/lib/db";
import "./app.css";

export const links: Route.LinksFunction = () => [];

export async function loader({ request }: { request: Request }) {
  const user = await getUser(request);
  const notices = user
    ? getNoticesForUser(getDb(), user.id).map((n) => ({
        id: n.id,
        message: n.message,
        event_id: n.event_id,
        event_date: n.event_date,
      }))
    : [];
  return {
    user: user
      ? {
          id: user.id,
          username: user.username,
          profileEmoji: user.profile_emoji ?? null,
          isAdmin: !!(user as { is_admin?: number }).is_admin,
        }
      : null,
    notices,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData("root") as {
    user: { id: number; username: string; profileEmoji: string | null; isAdmin: boolean } | null;
    notices: { id: number; message: string; event_id: number; event_date: string }[];
  } | undefined;
  const user = data?.user ?? null;
  const notices = data?.notices ?? [];

  return (
    <>
      {user && (
        <nav className="sticky top-0 z-10 border-b border-neutral-200/80 bg-white/80 backdrop-blur-xl dark:border-neutral-700/50 dark:bg-black/70 px-6">
          <div className="max-w-2xl lg:max-w-5xl mx-auto h-14 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link
                to="/events"
                className="text-[17px] font-semibold text-neutral-900 dark:text-white"
              >
                Terrible Football{" "}
                <span className="bg-gradient-to-r from-red-500 via-red-600 to-red-700 dark:from-red-400 dark:via-red-500 dark:to-red-600 bg-clip-text text-transparent">
                  Liverpool
                </span>
              </Link>
              <Link
                to="/events"
                className="text-[15px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
              >
                Sessions
              </Link>
              {user.isAdmin && (
                <>
                  <Link
                    to="/admin/users"
                    className="text-[15px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                  >
                    Users
                  </Link>
                  <Link
                    to="/notices"
                    className="text-[15px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                  >
                    Notices
                  </Link>
                </>
              )}
              <Link
                to="/faq"
                className="text-[15px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
              >
                FAQ
              </Link>
            </div>
            <div className="flex items-center gap-6">
              <Link
                to="/settings"
                className="text-[15px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
              >
                Settings
              </Link>
              <span className="flex items-center gap-2 text-[15px] text-neutral-500 dark:text-neutral-400">
                {user.profileEmoji && (
                  <span className="text-lg leading-none" aria-hidden>
                    {user.profileEmoji}
                  </span>
                )}
                {user.username}
              </span>
              <Form method="post" action="/logout">
                <button
                  type="submit"
                  className="text-[15px] text-[#0A84FF] hover:opacity-80"
                >
                  Log out
                </button>
              </Form>
            </div>
          </div>
        </nav>
      )}
      <Outlet />

      {user && notices.length > 0 && (
        <div
          className="fixed top-14 left-0 right-0 z-50 pt-4 px-4 flex flex-col gap-3 items-center pointer-events-none"
          aria-live="polite"
        >
          <div className="w-full max-w-2xl lg:max-w-5xl mx-auto flex flex-col gap-3 pointer-events-auto">
            {notices.map((notice) => {
              const dateStr = new Date(notice.event_date + "T12:00:00").toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              return (
                <div
                  key={notice.id}
                  className="rounded-2xl bg-neutral-700 dark:bg-neutral-600 text-white px-4 py-3 shadow-lg border border-neutral-600 dark:border-neutral-500 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-neutral-300 dark:text-neutral-200 mb-0.5">{dateStr}</p>
                    <Link
                      to={`/notices/${notice.id}`}
                      className="text-[15px] leading-snug font-medium underline hover:no-underline"
                    >
                      An event you&apos;re signed up for has an update
                    </Link>
                  </div>
                  <Form method="post" action="/notices/dismiss" className="shrink-0">
                    <input type="hidden" name="notice_id" value={notice.id} />
                    <button
                      type="submit"
                      className="rounded-lg p-1.5 bg-white/20 hover:bg-white/30 text-white transition-colors"
                      aria-label="Dismiss"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </Form>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error && typeof error === "object" && "message" in error && typeof (error as Error).message === "string") {
    details = (error as Error).message;
    if (error instanceof Error && error.stack && import.meta.env.DEV) stack = error.stack;
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] pt-16 px-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-[22px] font-semibold text-neutral-900 dark:text-white mb-2">
          {message}
        </h1>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400">
          {details}
        </p>
        {stack && (
          <pre className="mt-6 w-full rounded-2xl bg-white dark:bg-neutral-800/80 p-4 overflow-x-auto text-[13px] text-neutral-600 dark:text-neutral-400 border border-neutral-200/60 dark:border-neutral-700/60">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
