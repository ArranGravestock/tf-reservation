import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useLocation } from "react-router";

export type PanelNotice = {
  id: number;
  event_id: number;
  kind: "update" | "cancelled";
  message: string;
  event_date: string;
  event_title: string | null;
  created_at: number;
  read: boolean;
};

function formatEventDate(isoDate: string) {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatAgo(unixSeconds: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function NotificationItem({
  notice,
  forceRead,
  onNavigate,
}: {
  notice: PanelNotice;
  forceRead: boolean;
  onNavigate: () => void;
}) {
  const fetcher = useFetcher();
  // Optimistically show as read while the request is in flight.
  const read = notice.read || forceRead || fetcher.state !== "idle";
  const cancelled = notice.kind === "cancelled";
  const eventLabel = formatEventDate(notice.event_date) + (notice.event_title?.trim() ? ` · ${notice.event_title.trim()}` : "");

  return (
    <li className={`flex gap-3 px-4 py-3 ${read ? "" : "bg-[#f56772]/[0.06] dark:bg-[#f56772]/10"}`}>
      <span
        className={`mt-0.5 inline-grid h-8 w-8 shrink-0 place-items-center rounded-full ${
          cancelled ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-[#f56772]/15 text-[#f56772]"
        } ${read ? "opacity-60" : ""}`}
        aria-hidden
      >
        {cancelled ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <Link to={`/notifications/${notice.id}`} onClick={onNavigate} className="block group">
          <p
            className={`flex items-center gap-1.5 text-[14px] group-hover:underline ${
              read ? "font-medium text-neutral-600 dark:text-neutral-300" : "font-semibold text-neutral-900 dark:text-white"
            }`}
          >
            {!read && <span className="h-2 w-2 shrink-0 rounded-full bg-[#f56772]" aria-label="Unread" />}
            {cancelled ? "Event cancelled" : "Event update"}
          </p>
        </Link>
        <p className="text-[12px] text-neutral-500 dark:text-neutral-400 truncate">
          <Link
            to={`/events/${notice.event_id}`}
            onClick={onNavigate}
            className="font-medium text-[#f56772] hover:underline"
          >
            {eventLabel}
          </Link>{" "}
          · {formatAgo(notice.created_at)}
        </p>
        <Link to={`/notifications/${notice.id}`} onClick={onNavigate} className="block">
          <p
            className={`mt-1 text-[14px] leading-snug line-clamp-3 whitespace-pre-line ${
              read ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {notice.message}
          </p>
        </Link>
      </div>
      {!read && (
        <fetcher.Form method="post" action="/notifications/read" className="shrink-0">
          <input type="hidden" name="notice_id" value={notice.id} />
          <button
            type="submit"
            className="rounded-lg p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-700/60 transition-colors"
            aria-label="Mark as read"
            title="Mark as read"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </fetcher.Form>
      )}
    </li>
  );
}

/** Bell button in the nav that opens a dropdown of the user's notifications. */
export function NotificationPanel({ notices, isAdmin }: { notices: PanelNotice[]; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const markAll = useFetcher();
  const allRead = markAll.state !== "idle";
  const unreadCount = allRead ? 0 : notices.filter((n) => !n.read).length;

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center justify-center p-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/60 transition-colors"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-expanded={open}
        aria-controls="notification-panel"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 inline-grid place-items-center rounded-full bg-[#f56772] text-[11px] font-semibold leading-none text-white tabular-nums ring-2 ring-white dark:ring-black">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-neutral-800 shadow-xl border border-neutral-200/80 dark:border-neutral-700/60 overflow-hidden z-30"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/80 dark:border-neutral-700/60">
            <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-white">Notifications</h2>
            {unreadCount > 0 && (
              <markAll.Form method="post" action="/notifications/read">
                <input type="hidden" name="all" value="1" />
                <button type="submit" className="text-[13px] font-medium text-[#f56772] hover:opacity-80">
                  Mark all as read
                </button>
              </markAll.Form>
            )}
          </div>
          {notices.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-neutral-500 dark:text-neutral-400">
              No notifications yet.
            </p>
          ) : (
            <ul className="max-h-[min(28rem,70vh)] overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-700/60">
              {notices.map((notice) => (
                <NotificationItem
                  key={notice.id}
                  notice={notice}
                  forceRead={allRead}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-neutral-200/80 dark:border-neutral-700/60 px-4 py-2.5 text-center text-[13px] font-medium text-[#f56772] hover:bg-neutral-50 dark:hover:bg-neutral-700/40"
          >
            {isAdmin ? "Manage notifications" : "View all notifications"}
          </Link>
        </div>
      )}
    </div>
  );
}
