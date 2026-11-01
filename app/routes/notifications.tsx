import { Link, useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/notifications";
import { requireVerifiedUser, isAdmin } from "~/lib/auth.server";
import { getDb, getNoticesList, getNoticesForUser, type NoticeKind } from "~/lib/db.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Notifications – Terrible Football Liverpool" }];
}

type ListedNotice = {
  id: number;
  /** Null for direct messages. */
  event_id: number | null;
  kind: NoticeKind;
  important: boolean;
  message: string;
  created_at: number;
  event_date: string | null;
  event_title: string | null;
  /** Only tracked for a player's own notifications; admins see every notice. */
  read: boolean | null;
  /** Admin view only: who a direct message went to. */
  recipient_count?: number;
  recipient_names?: string | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireVerifiedUser(request);
  const db = getDb();
  const admin = isAdmin(user);
  // Admins manage every notification; players see the ones sent to them.
  const notices: ListedNotice[] = admin
    ? getNoticesList(db).map((n) => ({ ...n, read: null }))
    : getNoticesForUser(db, user.id, 200);
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

export default function Notifications() {
  const { notices, isAdmin } = useLoaderData<typeof loader>();
  const markAll = useFetcher();
  const markingAll = markAll.state !== "idle";
  const hasUnread = !markingAll && notices.some((n) => n.read === false);

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link to="/events" className="text-[15px] text-[#f56772] hover:opacity-80 inline-block">
            ← Back to events
          </Link>
          {isAdmin ? (
            <Link
              to="/notifications/create"
              className="rounded-xl bg-[#f56772] px-4 py-2.5 text-[15px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity shrink-0"
            >
              Send notification
            </Link>
          ) : (
            hasUnread && (
              <markAll.Form method="post" action="/notifications/read">
                <input type="hidden" name="all" value="1" />
                <button type="submit" className="text-[15px] font-medium text-[#f56772] hover:opacity-80">
                  Mark all as read
                </button>
              </markAll.Form>
            )
          )}
        </div>
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
          Notifications
        </h1>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-8">
          {isAdmin
            ? "Notifications appear in the notification panel of everyone signed up for the selected event."
            : "Updates and cancellations for events you've signed up for."}
        </p>

        {notices.length === 0 ? (
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 rounded-2xl bg-white dark:bg-neutral-800/80 p-6 border border-neutral-200/60 dark:border-neutral-700/60">
            {isAdmin
              ? "No notifications yet. Send one to let signed-up players know about an event update."
              : "No notifications yet."}
          </p>
        ) : (
          <ul className="space-y-3">
            {notices.map((notice) => {
              const unread = notice.read === false && !markingAll;
              return (
                <li
                  key={notice.id}
                  className={`rounded-2xl p-4 border transition-colors ${
                    unread
                      ? "bg-[#f56772]/[0.06] dark:bg-[#f56772]/10 border-[#f56772]/30"
                      : "bg-white dark:bg-neutral-800/80 border-neutral-200/60 dark:border-neutral-700/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="flex items-center gap-2 shrink-0">
                      {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#f56772]" aria-label="Unread" />}
                      {notice.kind === "cancelled" ? (
                        <span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-[12px] font-medium text-red-600 dark:text-red-400">
                          Cancelled
                        </span>
                      ) : notice.kind === "message" ? (
                        <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-[12px] font-medium text-violet-700 dark:text-violet-300">
                          Message
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-sky-500/15 px-2 py-0.5 text-[12px] font-medium text-sky-700 dark:text-sky-300">
                          Update
                        </span>
                      )}
                      {notice.important && (
                        <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                          Important
                        </span>
                      )}
                    </span>
                    {notice.event_id && notice.event_date ? (
                      <Link
                        to={`/events/${notice.event_id}`}
                        className="min-w-0 text-right text-[13px] font-medium text-[#f56772] hover:underline"
                      >
                        {formatEventLabel(notice.event_date, notice.event_title)}
                      </Link>
                    ) : (
                      <span className="min-w-0 text-right text-[13px] text-neutral-500 dark:text-neutral-400">
                        {isAdmin && notice.recipient_count
                          ? `To ${notice.recipient_names}${
                              notice.recipient_count > 3 ? ` +${notice.recipient_count - 3} more` : ""
                            }`
                          : "From the organisers"}
                      </span>
                    )}
                  </div>
                  <Link to={`/notifications/${notice.id}`} className="block group">
                    <p
                      className={`text-[15px] leading-snug text-neutral-900 dark:text-white break-words whitespace-pre-line group-hover:underline ${
                        unread ? "font-semibold" : ""
                      }`}
                    >
                      {notice.message}
                    </p>
                  </Link>
                  <p className="mt-2 text-right text-[12px] text-neutral-500 dark:text-neutral-400">
                    Received: {formatCreatedAt(notice.created_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
