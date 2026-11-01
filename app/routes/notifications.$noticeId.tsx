import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/notifications.$noticeId";
import { requireVerifiedUser, isAdmin } from "~/lib/auth.server";
import { getDb, getNoticeById, isNoticeForUser, markNoticeRead } from "~/lib/db.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Notification – Terrible Football Liverpool" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireVerifiedUser(request);
  const { noticeId } = await params;
  const id = parseInt(noticeId, 10);
  if (Number.isNaN(id) || String(id) !== noticeId) throw new Response("Not found", { status: 404 });
  const db = getDb();
  const notice = getNoticeById(db, id);
  if (!notice) throw new Response("Not found", { status: 404 });
  const addressedToUser = isNoticeForUser(db, id, user.id);
  // Direct messages are private to their recipients (and admins).
  if (notice.kind === "message" && !addressedToUser && !isAdmin(user)) {
    throw new Response("Not found", { status: 404 });
  }
  // Opening a notification marks it as read.
  if (addressedToUser) markNoticeRead(db, user.id, id);
  return { notice };
}

function formatEventLabel(event_date: string, event_title: string | null) {
  const d = new Date(event_date + "T12:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }) + (event_title?.trim() ? ` – ${event_title}` : "");
}

export default function NotificationDetail() {
  const { notice } = useLoaderData<typeof loader>();
  const cancelled = notice.kind === "cancelled";

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/notifications" className="text-[15px] text-[#f56772] hover:opacity-80 mb-6 inline-block">
          ← Back to notifications
        </Link>
        <div className="rounded-2xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60">
          {(cancelled || notice.important) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {cancelled && (
                <span className="inline-flex items-center rounded-full bg-red-500/15 px-2.5 py-0.5 text-[12px] font-medium text-red-600 dark:text-red-400">
                  Event cancelled
                </span>
              )}
              {notice.important && (
                <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                  Important
                </span>
              )}
            </div>
          )}
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mb-2">
            {notice.event_id && notice.event_date ? (
              <>
                {cancelled ? "Cancelled event" : "Update for event"}:{" "}
                <Link to={`/events/${notice.event_id}`} className="font-medium text-[#f56772] hover:underline">
                  {formatEventLabel(notice.event_date, notice.event_title)}
                </Link>
              </>
            ) : (
              "Message from the organisers"
            )}
          </p>
          <p className="text-[17px] text-neutral-900 dark:text-white leading-relaxed whitespace-pre-wrap">
            {notice.message}
          </p>
        </div>
      </div>
    </main>
  );
}
