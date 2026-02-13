import { Form, Link, useLoaderData, useActionData } from "react-router";
import { useState, useEffect } from "react";
import type { Route } from "./+types/events._index";
import type { Event } from "~/lib/db.server";
import { DEFAULT_PROFILE_EMOJI } from "~/lib/emoji";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Saturday sessions – Terrible Football Liverpool" }];
}

const LOCATION = "Wavertree Botanic Gardens, Edge Lane, Innovation Boulevard, Liverpool";
const TIME = "10:30am";

type EventWithSignups = Event & { signup_count: number };

export async function loader({ request }: { request: Request }) {
  const { requireVerifiedUser } = await import("~/lib/auth.server");
  const { getDb, ensureSaturdayEvents, isEventEnded, isEventStarted } = await import("~/lib/db.server");
  const user = await requireVerifiedUser(request);
  const db = getDb();
  ensureSaturdayEvents(db, 12);
  const rows = db.prepare(
    `SELECT e.id, e.event_date, e.created_at, e.title, e.description, e.location, e.time,
       COUNT(s.id) + COALESCE(SUM(s.guest_count), 0) as signup_count
     FROM events e
     LEFT JOIN event_signups s ON s.event_id = e.id
     WHERE strftime('%w', e.event_date) = '6'
     GROUP BY e.id
     ORDER BY e.event_date ASC`
  ).all() as (Event & { signup_count: number | string })[];
  const events: EventWithSignups[] = rows
    .map((r) => ({
      ...r,
      signup_count: Number(r.signup_count),
    }))
    .filter((e) => !isEventEnded(e));

  // Group by month (YYYY-MM)
  const byMonth = new Map<string, EventWithSignups[]>();
  for (const e of events) {
    const monthKey = e.event_date.slice(0, 7);
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
    byMonth.get(monthKey)!.push(e);
  }
  const months: { monthKey: string; monthLabel: string; events: EventWithSignups[] }[] = [];
  for (const [monthKey, monthEvents] of byMonth.entries()) {
    const d = new Date(monthKey + "-01T12:00:00");
    months.push({
      monthKey,
      monthLabel: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      events: monthEvents,
    });
  }
  months.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const userSignedUpEventIds = db
    .prepare("SELECT event_id FROM event_signups WHERE user_id = ?")
    .all(user.id) as { event_id: number }[];
  const userSignedUpSet = new Set(userSignedUpEventIds.map((r) => r.event_id));

  const signupRows = db
    .prepare(
      `SELECT s.event_id, u.profile_emoji FROM event_signups s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.event_id, s.created_at ASC`
    )
    .all() as { event_id: number; profile_emoji: string | null }[];
  const signupEmojiPreview: Record<number, { emojis: string[]; userCount: number }> = {};
  for (const row of signupRows) {
    if (!signupEmojiPreview[row.event_id]) {
      signupEmojiPreview[row.event_id] = { emojis: [], userCount: 0 };
    }
    signupEmojiPreview[row.event_id].userCount++;
    if (signupEmojiPreview[row.event_id].emojis.length < 3) {
      signupEmojiPreview[row.event_id].emojis.push(row.profile_emoji || DEFAULT_PROFILE_EMOJI);
    }
  }

  return {
    months,
    location: LOCATION,
    time: TIME,
    userSignedUpEventIds: [...userSignedUpSet],
    signupEmojiPreview,
  };
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return null;
  const { requireVerifiedUser } = await import("~/lib/auth.server");
  const { getDb, isEventStarted } = await import("~/lib/db.server");
  const user = await requireVerifiedUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const db = getDb();

  if (intent === "bulk_unsignup") {
    const rawIds = formData.getAll("eventId");
    const eventIds = rawIds
      .map((id) => parseInt(String(id), 10))
      .filter((n) => !Number.isNaN(n));
    let removed = 0;
    for (const eventId of eventIds) {
      const r = db.prepare("DELETE FROM event_signups WHERE event_id = ? AND user_id = ?").run(eventId, user.id);
      if (r.changes > 0) removed++;
    }
    return { bulkUnsignup: true, removed };
  }

  if (intent === "bulk_save") {
    const signupRaw = formData.get("signupEventIds");
    const unsignupRaw = formData.get("unsignupEventIds");
    const signupIds =
      typeof signupRaw === "string" && signupRaw.trim()
        ? signupRaw.split(",").map((id) => parseInt(id.trim(), 10)).filter((n) => !Number.isNaN(n))
        : [];
    const unsignupIds =
      typeof unsignupRaw === "string" && unsignupRaw.trim()
        ? unsignupRaw.split(",").map((id) => parseInt(id.trim(), 10)).filter((n) => !Number.isNaN(n))
        : [];
    let signedUp = 0;
    for (const eventId of signupIds) {
      const event = db.prepare("SELECT id, event_date, time FROM events WHERE id = ?").get(eventId) as
        | { id: number; event_date: string; time: string | null }
        | undefined;
      if (!event || isEventStarted(event)) continue;
      const existing = db.prepare("SELECT 1 FROM event_signups WHERE event_id = ? AND user_id = ?").get(eventId, user.id);
      if (existing) continue;
      try {
        db.prepare("INSERT INTO event_signups (event_id, user_id, guest_count) VALUES (?, ?, 0)").run(eventId, user.id);
        signedUp++;
      } catch {
        // ignore duplicate
      }
    }
    let removed = 0;
    for (const eventId of unsignupIds) {
      const r = db.prepare("DELETE FROM event_signups WHERE event_id = ? AND user_id = ?").run(eventId, user.id);
      if (r.changes > 0) removed++;
    }
    return { bulkSave: true, signedUp, removed };
  }

  if (intent !== "bulk_signup") return null;
  const rawIds = formData.getAll("eventId");
  const eventIds = rawIds
    .map((id) => parseInt(String(id), 10))
    .filter((n) => !Number.isNaN(n));
  let signedUp = 0;
  for (const eventId of eventIds) {
    const event = db.prepare("SELECT id, event_date, time FROM events WHERE id = ?").get(eventId) as
      | { id: number; event_date: string; time: string | null }
      | undefined;
    if (!event || isEventStarted(event)) continue;
    const existing = db.prepare("SELECT 1 FROM event_signups WHERE event_id = ? AND user_id = ?").get(eventId, user.id);
    if (existing) continue;
    try {
      db.prepare("INSERT INTO event_signups (event_id, user_id, guest_count) VALUES (?, ?, 0)").run(eventId, user.id);
      signedUp++;
    } catch {
      // ignore duplicate
    }
  }
  return { bulkSignup: true, signedUp };
}

function formatDate(isoDate: string) {
  const d = new Date(isoDate + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function EventsIndex() {
  const { months, location, time, userSignedUpEventIds, signupEmojiPreview } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkSuccessToast, setShowBulkSuccessToast] = useState(false);
  const userSignedUpSet = new Set(userSignedUpEventIds ?? []);
  const idsToUnsignup = (userSignedUpEventIds ?? []).filter((id) => !selectedIds.has(id));

  useEffect(() => {
    const bulkSuccess =
      actionData && ("bulkSignup" in actionData || "bulkUnsignup" in actionData || "bulkSave" in actionData);
    if (bulkSuccess) {
      setBulkMode(false);
      setSelectedIds(new Set());
      setShowBulkSuccessToast(true);
      const t = setTimeout(() => setShowBulkSuccessToast(false), 3000);
      return () => clearTimeout(t);
    }
  }, [actionData]);

  function toggleSelect(eventId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  const cardContent = (event: EventWithSignups) => (
    <>
      <div className={`w-full aspect-[21/9] shrink-0 rounded-t-2xl overflow-hidden bg-neutral-200/80 dark:bg-neutral-700/60 flex items-center justify-center ${bulkMode ? "relative" : ""}`}>
        {bulkMode && (
          <div
            className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-full bg-white px-2.5 py-1.5 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(event.id)}
              onChange={() => toggleSelect(event.id)}
              className="rounded border-neutral-300 text-[#0A84FF] focus:ring-[#0A84FF]"
              aria-label={`Select ${formatDate(event.event_date)}`}
            />
            <span className="text-[13px] font-medium text-neutral-700">Sign up</span>
          </div>
        )}
        <img
          src="/clean_455005399.avif"
          alt=""
          className="h-full w-full object-cover"
          aria-hidden
        />
      </div>
      <div className="p-4 flex flex-col gap-1">
        <span className="text-[17px] font-semibold text-neutral-900 dark:text-white">
          {event.title?.trim() || "Terrible Football Liverpool"}
        </span>
        <span className="text-[15px] text-neutral-600 dark:text-neutral-300">
          {formatDate(event.event_date)} at {event.time?.trim() || time}
        </span>
        <span className="text-[13px] text-neutral-500 dark:text-neutral-400">
          {event.location?.trim() || location}
        </span>
        <span className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center justify-end gap-2 flex-wrap">
          <span>
            {event.signup_count === 0
              ? "No one signed up yet"
              : `${event.signup_count} registered`}
          </span>
          {signupEmojiPreview?.[event.id]?.emojis?.length ? (
            <span className="flex items-center -space-x-1.5 shrink-0">
              {signupEmojiPreview[event.id].emojis.map((emoji, i) => (
                <span
                  key={i}
                  className="flex shrink-0 items-center justify-center w-5 h-5 min-w-5 min-h-5 rounded-full bg-white dark:bg-neutral-700 border-2 border-white dark:border-neutral-900 text-[10px] ring-1 ring-neutral-200/80 dark:ring-neutral-600/80 overflow-hidden leading-none"
                >
                  <span className="inline-flex items-center justify-center leading-none">{emoji}</span>
                </span>
              ))}
              {signupEmojiPreview[event.id].userCount > 3 && (
                <span
                  className="inline-grid shrink-0 place-items-center rounded-full border-2 border-neutral-200 dark:border-neutral-600 text-[10px] font-semibold tabular-nums leading-none text-neutral-700 dark:text-neutral-200 ring-1 ring-neutral-200/80 dark:ring-neutral-600/80 overflow-hidden bg-neutral-200 dark:bg-neutral-600"
                  style={{ width: 20, height: 20, minWidth: 20, minHeight: 20, padding: 0, boxSizing: 'border-box' }}
                >
                  +{signupEmojiPreview[event.id].userCount - 3}
                </span>
              )}
            </span>
          ) : null}
        </span>
      </div>
    </>
  );

  return (
    <main className={`min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 ${bulkMode ? "pb-28" : "pb-12"}`}>
      {showBulkSuccessToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-neutral-800 dark:bg-neutral-700 text-white pl-5 pr-2 py-3 text-[15px] font-medium shadow-lg border border-neutral-700/80"
        >
          <span>Successfully saved</span>
          <button
            type="button"
            onClick={() => setShowBulkSuccessToast(false)}
            className="rounded-lg p-1.5 hover:bg-white/10 active:bg-white/20 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div className="max-w-2xl lg:max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white">
            Saturday sessions
          </h1>
          <button
            type="button"
            onClick={() => {
              if (bulkMode) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(userSignedUpEventIds ?? []));
              }
              setBulkMode((b) => !b);
            }}
            className="rounded-xl border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-[15px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
          >
            {bulkMode ? "Cancel bulk sign up" : "Bulk sign up"}
          </button>
        </div>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-4">
          Pick a session to sign up. New events are created automatically every Saturday.
        </p>
        {actionData?.bulkUnsignup && (
          <p className="rounded-2xl bg-neutral-200/80 dark:bg-neutral-700/50 text-neutral-800 dark:text-neutral-200 px-4 py-3 mb-4 text-[15px]">
            Removed from {actionData.removed} {actionData.removed === 1 ? "session" : "sessions"}.
          </p>
        )}
        <div className="space-y-8">
          {months.map(({ monthKey, monthLabel, events }) => (
            <section key={monthKey}>
              <h2 className="text-[17px] font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                {monthLabel}
              </h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {events.map((event) => (
                  <li key={event.id}>
                    {bulkMode ? (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleSelect(event.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSelect(event.id);
                          }
                        }}
                        className={`flex flex-col h-full rounded-2xl border overflow-hidden cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700/80 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-900 ${
                          selectedIds.has(event.id)
                            ? "bg-[#0A84FF]/10 dark:bg-[#0A84FF]/15 border-[#0A84FF]/40 dark:border-[#0A84FF]/30"
                            : "bg-white dark:bg-neutral-800/80 border-neutral-200/80 dark:border-neutral-700/60"
                        }`}
                      >
                        {cardContent(event)}
                      </div>
                    ) : (
                      <Link
                        to={`/events/${event.id}`}
                        className="flex flex-col h-full rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/60 overflow-hidden active:bg-neutral-50 dark:active:bg-neutral-700/80 transition-colors"
                      >
                        {cardContent(event)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

      </div>

      {bulkMode && (
        <footer className="fixed bottom-0 left-0 right-0 z-10 border-t border-neutral-200/80 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/95 backdrop-blur-sm">
          <div className="max-w-2xl lg:max-w-5xl mx-auto px-6 py-4 flex flex-wrap items-center justify-end gap-4">
            <span className="text-[15px] text-neutral-700 dark:text-neutral-300">
              Sign up to {selectedIds.size} session{selectedIds.size !== 1 ? "s" : ""}
              {idsToUnsignup.length > 0 && ` · Remove from ${idsToUnsignup.length}`}
            </span>
            <Form method="post" className="flex items-center gap-2">
              <input type="hidden" name="intent" value="bulk_save" />
              <input type="hidden" name="signupEventIds" value={[...selectedIds].join(",")} />
              <input type="hidden" name="unsignupEventIds" value={idsToUnsignup.join(",")} />
              <button
                type="submit"
                className="rounded-xl bg-[#0A84FF] px-5 py-2.5 text-[15px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
              >
                Save
              </button>
            </Form>
          </div>
        </footer>
      )}
    </main>
  );
}
