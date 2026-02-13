import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/notices";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Notifications – Terrible Football Liverpool" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { isAdmin, requireVerifiedUser } = await import("~/lib/auth.server");
  const { getDb, getNoticesForUser, getNoticesList } = await import("~/lib/db.server");
  const user = await requireVerifiedUser(request);
  const db = getDb();
  const admin = isAdmin(user);
  const notices = admin
    ? getNoticesList(db)
    : getNoticesForUser(db, user.id).map((n) => ({ ...n, event_title: null as string | null }));
  return { notices, isAdmin: admin };
}

function formatEventLabel(event_date: string, event_title: string | null) {
  const d = new Date(event_date + "T12:00:00");
  const dateStr = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return event_title?.trim() ? `${dateStr} – ${event_title}` : dateStr;
}

function formatCreatedAt(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Notices() {
  const { notices, isAdmin } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link to="/events" className="text-[15px] text-[#0A84FF] hover:opacity-80 inline-block">
            ← Back to sessions
          </Link>
          {isAdmin && (
            <Link
              to="/notices/create"
              className="rounded-xl bg-[#0A84FF] px-4 py-2.5 text-[15px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity shrink-0"
            >
              Create notification
            </Link>
          )}
        </div>
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
          Notifications
        </h1>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-8">
          {isAdmin
            ? "Notifications are shown as a toast to everyone signed up for the selected event."
            : "Updates for events you're signed up for."}
        </p>

        {notices.length === 0 ? (
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 rounded-2xl bg-white dark:bg-neutral-800/80 p-6 border border-neutral-200/60 dark:border-neutral-700/60">
            {isAdmin
              ? "No notifications yet. Create one to notify signed-up users about an event."
              : "No notifications for your events yet."}
          </p>
        ) : (
          <ul className="space-y-3">
            {notices.map((notice) => (
              <li key={notice.id}>
                <Link
                  to={`/notices/${notice.id}`}
                  className="block rounded-2xl bg-white dark:bg-neutral-800/80 p-4 border border-neutral-200/60 dark:border-neutral-700/60 hover:bg-neutral-50 dark:hover:bg-neutral-700/80 transition-colors"
                >
                  <p className="text-[15px] text-neutral-900 dark:text-white mb-1.5">
                    {notice.message}
                  </p>
                  <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
                    Event: {formatEventLabel(notice.event_date, notice.event_title)} · {formatCreatedAt(notice.created_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
