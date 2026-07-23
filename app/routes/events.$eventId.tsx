import { useEffect, useState } from "react";
import { Form, Link, redirect, useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/events.$eventId";
import { isAdmin, requireAdmin, requireVerifiedUser } from "~/lib/auth.server";
import { getDb, updateEvent, isEventEnded, isEventStarted, isEventDate, getEventHosts, setEventHost, isUserBlocked, LATE_BLOCK_SECONDS, type Event } from "~/lib/db";
import { DEFAULT_PROFILE_EMOJI } from "~/lib/emoji";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Event – Terrible Football Liverpool" }];
}

const DEFAULT_TITLE = "Terrible Football Liverpool";
const DEFAULT_LOCATION = "Wavertree Botanic Gardens, Edge Lane, Innovation Boulevard, Liverpool";
const DEFAULT_TIME = "10:30am";

export async function loader({ request, params }: { request: Request; params: Promise<{ eventId: string }> }) {
  const user = await requireVerifiedUser(request);
  const { eventId } = await params;
  const id = parseInt(eventId, 10);
  if (Number.isNaN(id)) throw new Response("Not found", { status: 404 });
  const db = getDb();
  const event = db
    .prepare("SELECT id, event_date, created_at, title, description, location, time, cancelled FROM events WHERE id = ?")
    .get(id) as Event | undefined;
  if (!event) throw new Response("Not found", { status: 404 });
  if (!isEventDate(event.event_date)) throw new Response("Not found", { status: 404 });
  if (event.cancelled) throw new Response("Not found", { status: 404 });
  const signups = db.prepare(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.profile_emoji, s.created_at as signed_up_at, COALESCE(s.guest_count, 0) as guest_count, s.attendance_status FROM event_signups s JOIN users u ON u.id = s.user_id WHERE s.event_id = ? ORDER BY s.created_at ASC`
  ).all(id) as { id: number; username: string; first_name: string | null; last_name: string | null; profile_emoji: string | null; signed_up_at: number; guest_count: number; attendance_status: string | null }[];
  const userSignedUp = signups.some((s) => s.id === user.id);
  const currentUserSignup = signups.find((s) => s.id === user.id);
  const eventEnded = isEventEnded(event);
  const eventStarted = isEventStarted(event);
  // First-timer: the user has never attended (signed up for) a past event other
  // than this one.
  const today = new Date().toISOString().slice(0, 10);
  const attended = db
    .prepare(
      `SELECT COUNT(*) AS c FROM event_signups s
       JOIN events e ON e.id = s.event_id
       WHERE s.user_id = ? AND e.id != ? AND e.event_date < ?`
    )
    .get(user.id, id, today) as { c: number };
  const isFirstTimer = attended.c === 0;
  const hosts = getEventHosts(db, id);
  const userIsHost = hosts.some((h) => h.id === user.id);
  return {
    event,
    signups,
    userSignedUp,
    currentUserGuestCount: currentUserSignup?.guest_count ?? 0,
    isAdmin: isAdmin(user),
    eventEnded,
    eventStarted,
    isFirstTimer,
    hosts,
    userIsHost,
  };
}

export async function action({ request, params }: { request: Request; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const id = parseInt(eventId, 10);
  if (Number.isNaN(id)) return { error: "Invalid event" };
  const db = getDb();
  const event = db.prepare("SELECT id, event_date, time FROM events WHERE id = ?").get(id) as
    | { id: number; event_date: string; time: string | null }
    | undefined;
  if (!event) return { error: "Event not found" };
  if (!isEventDate(event.event_date)) return { error: "Event not found" };
  const ended = isEventEnded(event);
  const started = isEventStarted(event);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "unsignup") {
    const user = await requireVerifiedUser(request);
    db.prepare("DELETE FROM event_signups WHERE event_id = ? AND user_id = ?").run(id, user.id);
    return { unsignup: true };
  }

  if (intent === "admin_remove_signups") {
    await requireAdmin(request);
    const userIds = formData
      .getAll("userId")
      .map((v) => parseInt(String(v), 10))
      .filter((n) => !Number.isNaN(n));
    let removed = 0;
    const stmt = db.prepare("DELETE FROM event_signups WHERE event_id = ? AND user_id = ?");
    for (const uid of userIds) {
      removed += stmt.run(id, uid).changes;
    }
    return { adminRemoved: removed };
  }

  if (intent === "admin_mark_attendance") {
    await requireAdmin(request);
    const rawStatus = formData.get("status");
    const status =
      rawStatus === "late" || rawStatus === "attended" || rawStatus === "did_not_attend" ? rawStatus : null;
    const userIds = formData
      .getAll("userId")
      .map((v) => parseInt(String(v), 10))
      .filter((n) => !Number.isNaN(n));
    let updated = 0;
    const getSignupStmt = db.prepare(
      "SELECT attendance_status FROM event_signups WHERE event_id = ? AND user_id = ?"
    );
    // Reset late_ack to 0 (unseen) whenever newly marked late, so the user gets
    // a fresh dismissable warning on next login.
    const updateStmt = db.prepare(
      "UPDATE event_signups SET attendance_status = ?, late_ack = ? WHERE event_id = ? AND user_id = ?"
    );
    const incrementLateStmt = db.prepare("UPDATE users SET late_count = late_count + 1 WHERE id = ?");
    const getLateCountStmt = db.prepare("SELECT late_count FROM users WHERE id = ?");
    const blockStmt = db.prepare("UPDATE users SET blocked_until = ? WHERE id = ?");
    const upcomingSignupsStmt = db.prepare(
      `SELECT s.id, e.event_date, e.time FROM event_signups s JOIN events e ON e.id = s.event_id WHERE s.user_id = ?`
    );
    const removeSignupStmt = db.prepare("DELETE FROM event_signups WHERE id = ?");
    for (const uid of userIds) {
      const existing = getSignupStmt.get(id, uid) as { attendance_status: string | null } | undefined;
      if (!existing) continue;
      const wasLate = existing.attendance_status === "late";
      updateStmt.run(status, status === "late" ? 0 : 1, id, uid);
      updated++;
      if (status === "late" && !wasLate) {
        incrementLateStmt.run(uid);
        const { late_count } = getLateCountStmt.get(uid) as { late_count: number };
        // Second (or later) time marked late: block sign-ups for a week and pull
        // them out of every event they haven't already attended.
        if (late_count >= 2) {
          blockStmt.run(Math.floor(Date.now() / 1000) + LATE_BLOCK_SECONDS, uid);
          const otherSignups = upcomingSignupsStmt.all(uid) as { id: number; event_date: string; time: string | null }[];
          for (const s of otherSignups) {
            if (!isEventEnded(s)) removeSignupStmt.run(s.id);
          }
        }
      }
    }
    return { attendanceUpdated: updated };
  }

  if (intent === "cancel") {
    await requireAdmin(request);
    db.prepare("UPDATE events SET cancelled = 1 WHERE id = ?").run(id);
    return redirect("/events");
  }

  if (intent === "update_guests") {
    if (started) return { error: "This event has already started. Sign-ups are closed." };
    if (ended) return { error: "This event has ended." };
    const user = await requireVerifiedUser(request);
    const rawGuest = formData.get("guest_count");
    const guestCount = Math.min(5, Math.max(0, typeof rawGuest === "string" ? parseInt(rawGuest, 10) || 0 : 0));
    db.prepare("UPDATE event_signups SET guest_count = ? WHERE event_id = ? AND user_id = ?").run(
      guestCount,
      id,
      user.id
    );
    return { guestsUpdated: true };
  }

  if (intent === "edit") {
    const admin = await requireAdmin(request);
    const event_date = formData.get("event_date");
    const title = formData.get("title");
    const description = formData.get("description");
    const location = formData.get("location");
    const time = formData.get("time");
    updateEvent(db, id, {
      ...(typeof event_date === "string" && event_date.trim() && { event_date: event_date.trim() }),
      ...(title !== undefined && { title: title === "" ? null : String(title).trim() || null }),
      ...(description !== undefined && { description: description === "" ? null : String(description).trim() || null }),
      ...(location !== undefined && { location: location === "" ? null : String(location).trim() || null }),
      ...(time !== undefined && { time: time === "" ? null : String(time).trim() || null }),
    });
    // Admins can add/remove themselves as a host of this event.
    setEventHost(db, id, admin.id, formData.get("host_self") === "on");
    return { editSuccess: true };
  }

  if (started) return { error: "This event has already started. Sign-ups are closed." };
  if (ended) return { error: "This event has ended." };
  const user = await requireVerifiedUser(request);
  if (isUserBlocked(user)) {
    return {
      error: `You're blocked from signing up for events until ${formatBlockedDate(user.blocked_until!)} due to repeated lateness.`,
      blocked: true,
    };
  }
  const rawGuest = formData.get("guest_count");
  const guestCount = Math.min(5, Math.max(0, typeof rawGuest === "string" ? parseInt(rawGuest, 10) || 0 : 0));
  try {
    db.prepare("INSERT INTO event_signups (event_id, user_id, guest_count) VALUES (?, ?, ?)").run(id, user.id, guestCount);
    return { success: true };
  } catch (e) {
    return { error: "You are already signed up for this event." };
  }
}

function signupDisplayName(s: { first_name: string | null; last_name: string | null; username: string }) {
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return name || s.username;
}

/** Full name for a host; if none is set, humanize the username (ArranGravestock → Arran Gravestock). */
function hostDisplayName(h: { first_name: string | null; last_name: string | null; username: string }) {
  const name = [h.first_name, h.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  return h.username
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSignupTime(unixSeconds: number) {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(isoDate: string) {
  const d = new Date(isoDate + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatBlockedDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function EventDetail() {
  const { event, signups, userSignedUp, currentUserGuestCount, isAdmin, eventEnded, eventStarted, isFirstTimer, hosts, userIsHost } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [signupModalOpen, setSignupModalOpen] = useState(false);
  const [signupConfirmModalOpen, setSignupConfirmModalOpen] = useState(false);
  const [signupConfirmIsEditMode, setSignupConfirmIsEditMode] = useState(false);
  const [attendanceGoing, setAttendanceGoing] = useState(true);
  const [guestCount, setGuestCount] = useState(0);
  const [signupSearch, setSignupSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [selectedSignupIds, setSelectedSignupIds] = useState<Set<number>>(new Set());
  const [blockedToast, setBlockedToast] = useState<string | null>(null);

  const filteredSignups = signups.filter((s) => {
    const q = signupSearch.trim().toLowerCase();
    if (!q) return true;
    return signupDisplayName(s).toLowerCase().includes(q) || s.username.toLowerCase().includes(q);
  });
  const allFilteredSelected =
    filteredSignups.length > 0 && filteredSignups.every((s) => selectedSignupIds.has(s.id));

  function toggleSignupSelected(userId: number) {
    setSelectedSignupIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }
  function toggleSelectAllSignups() {
    setSelectedSignupIds((prev) => {
      if (filteredSignups.every((s) => prev.has(s.id))) {
        const next = new Set(prev);
        filteredSignups.forEach((s) => next.delete(s.id));
        return next;
      }
      const next = new Set(prev);
      filteredSignups.forEach((s) => next.add(s.id));
      return next;
    });
  }

  useEffect(() => {
    if (actionData && "blocked" in actionData && actionData.blocked && actionData.error) {
      setBlockedToast(actionData.error);
      const t = setTimeout(() => setBlockedToast(null), 6000);
      return () => clearTimeout(t);
    }
  }, [actionData]);

  useEffect(() => {
    if (actionData && "editSuccess" in actionData && actionData.editSuccess) {
      setIsEditing(false);
    }
    if (actionData && "success" in actionData && actionData.success) {
      setSignupConfirmModalOpen(false);
      setSignupConfirmIsEditMode(false);
      setGuestCount(0);
    }
    if (actionData && "guestsUpdated" in actionData && actionData.guestsUpdated) {
      setSignupConfirmModalOpen(false);
      setSignupConfirmIsEditMode(false);
    }
    if (actionData && "unsignup" in actionData && actionData.unsignup) {
      setSignupConfirmModalOpen(false);
      setSignupConfirmIsEditMode(false);
    }
    if (actionData && "adminRemoved" in actionData) {
      setSelectedSignupIds(new Set());
    }
    if (actionData && "attendanceUpdated" in actionData) {
      setSelectedSignupIds(new Set());
    }
  }, [actionData]);

  useEffect(() => {
    if (!signupModalOpen) setSelectedSignupIds(new Set());
  }, [signupModalOpen]);

  useEffect(() => {
    if (!signupModalOpen && !signupConfirmModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [signupModalOpen, signupConfirmModalOpen]);

  const title = event.title?.trim() || DEFAULT_TITLE;
  const description = event.description?.trim() ?? "";
  const location = event.location?.trim() || DEFAULT_LOCATION;
  const time = event.time?.trim() || DEFAULT_TIME;

  const totalAttendees =
    signups.length + signups.reduce((sum, s) => sum + (s.guest_count ?? 0), 0);

  const inputClass =
    "w-full rounded-xl bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 px-3 py-2 text-[15px] text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f56772]";

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-24">
      {blockedToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 rounded-xl bg-amber-600 dark:bg-amber-600 text-white pl-5 pr-2 py-3 text-[15px] font-medium shadow-lg border border-amber-500/80 max-w-[calc(100vw-2rem)]"
        >
          <span>{blockedToast}</span>
          <button
            type="button"
            onClick={() => setBlockedToast(null)}
            className="rounded-lg p-1.5 hover:bg-white/10 active:bg-white/20 transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div className="max-w-2xl lg:max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link
            to="/events"
            className="text-[15px] text-[#f56772] hover:opacity-80 inline-block"
          >
            ← Back
          </Link>
          {isAdmin && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-xl bg-amber-500/90 dark:bg-amber-500/90 hover:bg-amber-500 px-4 py-2 text-[15px] font-medium text-white shrink-0"
            >
              Edit
            </button>
          )}
          {isAdmin && isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-xl bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400 dark:hover:bg-neutral-500 px-4 py-2 text-[15px] font-medium text-neutral-800 dark:text-white shrink-0"
            >
              Cancel
            </button>
          )}
        </div>

        {eventEnded && (
          <div className="rounded-2xl bg-neutral-200/80 dark:bg-neutral-700/80 text-neutral-800 dark:text-neutral-200 px-4 py-3 mb-6 text-[15px] font-medium border border-neutral-300/80 dark:border-neutral-600/80">
            This event has ended
          </div>
        )}
        {eventStarted && !eventEnded && (
          <div className="rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 px-4 py-3 mb-6 text-[15px] font-medium border border-amber-300/80 dark:border-amber-600/80">
            This event has already started. Sign-ups are closed.
          </div>
        )}

        {userSignedUp && (
          <div className="rounded-2xl bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400 px-4 py-3 mb-6 text-[15px]">
            You&apos;re signed up for this event
          </div>
        )}

        {isAdmin && isEditing ? (
          <Form method="post" className="space-y-4 mb-6">
            <input type="hidden" name="intent" value="edit" />
            {actionData && "editSuccess" in actionData && actionData.editSuccess && (
              <p className="text-[15px] text-green-600 dark:text-green-400">Saved.</p>
            )}
            <input
              type="text"
              name="title"
              defaultValue={event.title ?? ""}
              placeholder={DEFAULT_TITLE}
              className={`${inputClass} text-[28px] font-semibold`}
              aria-label="Title"
            />
            <div className="flex flex-wrap gap-3">
              <input
                type="date"
                name="event_date"
                defaultValue={event.event_date}
                className={`${inputClass} flex-1 min-w-[140px]`}
                aria-label="Date"
              />
              <input
                type="text"
                name="time"
                defaultValue={event.time ?? ""}
                placeholder={DEFAULT_TIME}
                className={`${inputClass} flex-1 min-w-[100px]`}
                aria-label="Time"
              />
            </div>
            <input
              type="text"
              name="location"
              defaultValue={event.location ?? ""}
              placeholder={DEFAULT_LOCATION}
              className={inputClass}
              aria-label="Location"
            />
            <input
              type="text"
              name="description"
              defaultValue={event.description ?? ""}
              placeholder="Description (optional)"
              className={inputClass}
              aria-label="Description"
            />
            <label className="flex items-center gap-2.5 text-[15px] text-neutral-700 dark:text-neutral-300 py-1">
              <input
                type="checkbox"
                name="host_self"
                defaultChecked={userIsHost}
                className="rounded border-neutral-300 dark:border-neutral-600 text-[#f56772] focus:ring-[#f56772]"
              />
              I&apos;m hosting this event
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="rounded-xl bg-[#f56772] px-4 py-2.5 text-[15px] font-medium text-white hover:opacity-90"
              >
                Save changes
              </button>
            </div>
          </Form>
        ) : null}
        {isEditing && isAdmin ? (
          <Form
            method="post"
            className="mb-6"
            onSubmit={(e) => {
              if (!confirm("Cancel this event? It will be removed from the events listing.")) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="cancel" />
            <button
              type="submit"
              className="rounded-xl border border-red-300 dark:border-red-500/40 px-4 py-2.5 text-[15px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Cancel event
            </button>
          </Form>
        ) : (
          <>
            <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-1.5">
              {title}
            </h1>
            <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-1.5">
              {formatDate(event.event_date)} at {time}
            </p>
            <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-1.5">
              {location}
            </p>
            {description && (
              <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-4">
                {description}
              </p>
            )}
            {hosts.length > 0 && (
              <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                  Hosted by
                </span>
                {hosts.map((h) => (
                  <span
                    key={h.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-neutral-700/60 pl-1 pr-2.5 py-0.5 text-[13px] font-medium text-neutral-700 dark:text-neutral-200"
                  >
                    <span className="inline-grid place-items-center w-5 h-5 text-[13px] leading-none" aria-hidden>
                      {h.profile_emoji || DEFAULT_PROFILE_EMOJI}
                    </span>
                    {hostDisplayName(h)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        <div className="mb-8 rounded-2xl overflow-hidden bg-neutral-200/80 dark:bg-neutral-700/60 aspect-[21/9] flex items-center justify-center shadow-inner ring-1 ring-neutral-200/60 dark:ring-neutral-600/40">
          <img
            src="/football-session.avif"
            alt=""
            className="h-full w-full object-cover"
            style={{ display: "none" }}
            onLoad={(e) => {
              e.currentTarget.style.display = "block";
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) (fallback as HTMLElement).style.display = "none";
            }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) (fallback as HTMLElement).style.display = "block";
            }}
          />
          <svg
            className="w-16 h-16 text-neutral-400 dark:text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
          </svg>
        </div>

        {actionData?.error && !("blocked" in actionData && actionData.blocked) && (
          <div className="rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 px-4 py-3 mb-6 text-[15px]">
            {actionData.error}
          </div>
        )}

        <section className="mt-12 pt-8 border-t border-neutral-200/80 dark:border-neutral-700/60 space-y-8">
          <div>
            <h2 className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-3">
              Key info
            </h2>
            <ul className="text-[15px] text-neutral-600 dark:text-neutral-300 space-y-2 list-disc list-inside">
              <li>This event: {time} at {location}</li>
              <li>Everyone is welcome — every skill level, gender, sexuality. Just gotta be over 18!</li>
              <li>No one gets upset if we miss a pass… or the ball altogether. Skills vary from old semi-pro players to never kicked a ball. We weren&apos;t fibbing when we said inclusive.</li>
              <li>Hosted at the southern side of Wavertree Botanic Gardens</li>
              <li>Follow us on <a href="https://www.facebook.com/TerribleFC." target="_blank" rel="noopener noreferrer" className="text-[#f56772] hover:underline">Facebook</a> and <a href="https://www.instagram.com/terrible_football/?hl=en" target="_blank" rel="noopener noreferrer" className="text-[#f56772] hover:underline">Instagram</a> — tons of info on there!</li>
            </ul>
          </div>

          <div>
            <h2 className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-3">
              Join us
            </h2>
            <p className="text-[15px] text-neutral-600 dark:text-neutral-300 leading-relaxed mb-3">
              Come join us for free football for anyone aged 18+ — open to players of any background and ability. Terrible Football has been running successfully across several venues in London for over 5 years.
            </p>
            <p className="text-[15px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
              We kick off at {time} and ask everyone to be there 15 minutes before so we can make teams and such! If you show up late and we&apos;ve started, you may have to wait until the next game. We usually play at the same location, but the space is occasionally used for other events, so we may move to a different spot in the park at short notice.
            </p>
          </div>

          <div>
            <h2 className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-3">
              Frequently asked questions
            </h2>
            <p className="text-[15px] text-neutral-600 dark:text-neutral-300 mb-2">
              <Link to="/faq" className="text-[#f56772] hover:underline">
                View our FAQ
              </Link>
            </p>
          </div>

          <div>
            <h2 className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-3">
              Donations
            </h2>
            <p className="text-[15px] text-neutral-600 dark:text-neutral-300 leading-relaxed mb-2">
              We are raising donations to cover meetup fees and new equipment. You can donate at:
            </p>
            <ul className="text-[15px] text-neutral-600 dark:text-neutral-300 space-y-1">
              <li><strong className="text-neutral-900 dark:text-white">Business name:</strong> Terrible Football</li>
              <li><strong className="text-neutral-900 dark:text-white">Sort code:</strong> 30-99-50</li>
              <li><strong className="text-neutral-900 dark:text-white">Account number:</strong> 34215263</li>
            </ul>
          </div>

          <div>
            <h2 className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-3">
              WhatsApp group
            </h2>
            <p className="text-[15px] text-neutral-600 dark:text-neutral-300 leading-relaxed mb-2">
              <a href="https://chat.whatsapp.com/" target="_blank" rel="noopener noreferrer" className="text-[#f56772] hover:underline">
                Join the WhatsApp group
              </a>
            </p>
            <p className="text-[15px] text-neutral-500 dark:text-neutral-400">
              Due to a bot problem we now require your WhatsApp name to match your Meetup name. If they do not match you will not be accepted.
            </p>
          </div>

          <div>
            <h2 className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-3">
              Location
            </h2>
            <p className="text-[15px] text-neutral-600 dark:text-neutral-300 mb-3">
              {location}
            </p>
            <div className="rounded-2xl overflow-hidden border border-neutral-200/80 dark:border-neutral-700/60 aspect-[16/10] max-h-[320px] bg-neutral-200/80 dark:bg-neutral-700/60">
              <iframe
                title="Event location map"
                src={`https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`}
                className="w-full h-full border-0"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-[15px] text-[#f56772] hover:underline"
            >
              Open in Google Maps
            </a>
          </div>
        </section>

        {signupModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setSignupModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-modal-title"
          >
            <div
              className="bg-white dark:bg-neutral-800 rounded-3xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col border border-neutral-200/80 dark:border-neutral-700/60"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-neutral-200/80 dark:border-neutral-700/60 flex items-center justify-between shrink-0">
                <h3 id="signup-modal-title" className="text-[17px] font-semibold text-neutral-900 dark:text-white">
                  {totalAttendees} Attending
                </h3>
                <button
                  type="button"
                  onClick={() => setSignupModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="p-4 shrink-0 space-y-3">
                <input
                  type="search"
                  placeholder="Search by name..."
                  value={signupSearch}
                  onChange={(e) => setSignupSearch(e.target.value)}
                  className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-2.5 text-[15px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#f56772]"
                />
                {isAdmin && filteredSignups.length > 0 && (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="flex items-center gap-2.5 text-[14px] font-medium text-neutral-600 dark:text-neutral-300">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllSignups}
                        className="rounded border-neutral-300 dark:border-neutral-600 text-[#f56772] focus:ring-[#f56772]"
                      />
                      Select all
                    </label>
                    {selectedSignupIds.size > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Form method="post">
                          <input type="hidden" name="intent" value="admin_mark_attendance" />
                          <input type="hidden" name="status" value="attended" />
                          {[...selectedSignupIds].map((uid) => (
                            <input key={uid} type="hidden" name="userId" value={uid} />
                          ))}
                          <button
                            type="submit"
                            className="rounded-lg bg-green-500/10 px-2.5 py-1.5 text-[13px] font-medium text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors"
                          >
                            Attended
                          </button>
                        </Form>
                        <Form method="post">
                          <input type="hidden" name="intent" value="admin_mark_attendance" />
                          <input type="hidden" name="status" value="late" />
                          {[...selectedSignupIds].map((uid) => (
                            <input key={uid} type="hidden" name="userId" value={uid} />
                          ))}
                          <button
                            type="submit"
                            className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[13px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                          >
                            Late
                          </button>
                        </Form>
                        <Form method="post">
                          <input type="hidden" name="intent" value="admin_mark_attendance" />
                          <input type="hidden" name="status" value="did_not_attend" />
                          {[...selectedSignupIds].map((uid) => (
                            <input key={uid} type="hidden" name="userId" value={uid} />
                          ))}
                          <button
                            type="submit"
                            className="rounded-lg bg-neutral-500/10 px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-500/20 transition-colors"
                          >
                            Did not attend
                          </button>
                        </Form>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <ul className="overflow-y-auto flex-1 min-h-0 p-4 pt-0 space-y-2">
                {filteredSignups.map((s) => (
                  <li
                    key={s.id}
                    role={isAdmin ? "button" : undefined}
                    tabIndex={isAdmin ? 0 : undefined}
                    onClick={isAdmin ? () => toggleSignupSelected(s.id) : undefined}
                    onKeyDown={
                      isAdmin
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleSignupSelected(s.id);
                            }
                          }
                        : undefined
                    }
                    aria-pressed={isAdmin ? selectedSignupIds.has(s.id) : undefined}
                    aria-label={isAdmin ? `Select ${signupDisplayName(s)}` : undefined}
                    className={`flex items-center justify-between gap-3 py-2 px-1 -mx-1 rounded-lg border-b border-neutral-100 dark:border-neutral-700/50 last:border-0 ${
                      isAdmin
                        ? "cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-700/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f56772]"
                        : ""
                    }`}
                  >
                    {isAdmin ? (
                      <span className="flex items-center gap-2 text-[15px] text-neutral-900 dark:text-white min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedSignupIds.has(s.id)}
                          readOnly
                          tabIndex={-1}
                          className="shrink-0 pointer-events-none rounded border-neutral-300 dark:border-neutral-600 text-[#f56772] focus:ring-[#f56772]"
                        />
                        <span className="text-xl leading-none shrink-0">
                          {s.profile_emoji || "👤"}
                        </span>
                        <span className="truncate">{signupDisplayName(s)}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-[15px] text-neutral-900 dark:text-white min-w-0">
                        <span className="text-xl leading-none shrink-0">
                          {s.profile_emoji || "👤"}
                        </span>
                        <span className="truncate">{signupDisplayName(s)}</span>
                      </span>
                    )}
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[13px] text-neutral-500 dark:text-neutral-400">
                        {formatSignupTime(s.signed_up_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        {(s.guest_count ?? 0) > 0 && (
                          <span className="inline-flex items-center rounded-full bg-neutral-100 dark:bg-neutral-600/60 px-2.5 py-0.5 text-[12px] font-medium text-neutral-600 dark:text-neutral-300">
                            +{(s.guest_count ?? 0)} {(s.guest_count ?? 0) === 1 ? "guest" : "guests"}
                          </span>
                        )}
                        {isAdmin && s.attendance_status === "late" && (
                          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[12px] font-medium text-amber-600 dark:text-amber-400">
                            Late
                          </span>
                        )}
                        {isAdmin && s.attendance_status === "attended" && (
                          <span className="inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-[12px] font-medium text-green-600 dark:text-green-400">
                            Attended
                          </span>
                        )}
                        {isAdmin && s.attendance_status === "did_not_attend" && (
                          <span className="inline-flex items-center rounded-full bg-neutral-500/15 px-2.5 py-0.5 text-[12px] font-medium text-neutral-600 dark:text-neutral-400">
                            Did not attend
                          </span>
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {filteredSignups.length === 0 && (
                <p className="px-4 pb-4 text-[15px] text-neutral-500 dark:text-neutral-400">
                  No matches for &quot;{signupSearch}&quot;
                </p>
              )}
              {isAdmin && selectedSignupIds.size > 0 && (
                <div className="p-4 border-t border-neutral-200/80 dark:border-neutral-700/60 shrink-0">
                  <Form method="post">
                    <input type="hidden" name="intent" value="admin_remove_signups" />
                    {[...selectedSignupIds].map((uid) => (
                      <input key={uid} type="hidden" name="userId" value={uid} />
                    ))}
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-red-500/10 px-4 py-2.5 text-[15px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Remove from event ({selectedSignupIds.size})
                    </button>
                  </Form>
                </div>
              )}
            </div>
          </div>
        )}

        {signupConfirmModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setSignupConfirmModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-confirm-modal-title"
          >
            <div
              className="bg-white dark:bg-neutral-800 rounded-3xl shadow-xl max-w-md w-full p-6 border border-neutral-200/80 dark:border-neutral-700/60"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-2">
                <h3 id="signup-confirm-modal-title" className="text-[17px] font-semibold text-neutral-900 dark:text-white">
                  {signupConfirmIsEditMode ? "Edit attendance" : "Sign up for this event"}
                </h3>
                {isFirstTimer && signupConfirmIsEditMode && (
                  <span className="inline-flex items-center rounded-full bg-[#f56772]/15 px-2.5 py-0.5 text-[12px] font-medium text-[#f56772]">
                    First time
                  </span>
                )}
              </div>
              {signupConfirmIsEditMode ? (
                <>
                  <p className="text-[15px] text-neutral-600 dark:text-neutral-300 mb-4">
                    Are you going to this event?
                  </p>
                  <div className="flex items-stretch overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700/50 mb-4 w-full">
                    <button
                      type="button"
                      onClick={() => setAttendanceGoing(true)}
                      className={`flex-1 py-3.5 text-[15px] font-medium transition-colors ${
                        attendanceGoing
                          ? "bg-[#f56772] text-white"
                          : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/80 dark:hover:bg-neutral-600/80"
                      }`}
                    >
                      Going
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceGoing(false)}
                      className={`flex-1 py-3.5 text-[15px] font-medium transition-colors ${
                        !attendanceGoing
                          ? "bg-[#f56772] text-white"
                          : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/80 dark:hover:bg-neutral-600/80"
                      }`}
                    >
                      Not going
                    </button>
                  </div>
                  {attendanceGoing && (
                    <>
                      <p className="text-[15px] text-neutral-600 dark:text-neutral-300 mb-3">
                        Number of guests (0–5)
                      </p>
                      <div className="flex items-stretch overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700/50 mb-6 w-full">
                        <button
                          type="button"
                          onClick={() => setGuestCount((n) => Math.max(0, n - 1))}
                          disabled={guestCount === 0}
                          aria-label="Decrease guests"
                          className="flex items-center justify-center w-14 h-14 shrink-0 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-neutral-600/80 active:bg-neutral-300 dark:active:bg-neutral-600 disabled:opacity-35 disabled:pointer-events-none disabled:hover:bg-transparent transition-colors text-2xl font-light leading-none"
                        >
                          −
                        </button>
                        <span
                          className="flex items-center justify-center flex-1 min-w-0 h-14 border-x border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-[20px] font-semibold text-neutral-900 dark:text-white tabular-nums"
                          aria-live="polite"
                        >
                          {guestCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setGuestCount((n) => Math.min(5, n + 1))}
                          disabled={guestCount === 5}
                          aria-label="Increase guests"
                          className="flex items-center justify-center w-14 h-14 shrink-0 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-neutral-600/80 active:bg-neutral-300 dark:active:bg-neutral-600 disabled:opacity-35 disabled:pointer-events-none disabled:hover:bg-transparent transition-colors text-2xl font-light leading-none"
                        >
                          +
                        </button>
                      </div>
                    </>
                  )}
                  {!attendanceGoing && (
                    <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-6">
                      You&apos;ll be removed from the event.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[15px] text-neutral-600 dark:text-neutral-300 mb-5">
                    Are you bringing any guests?
                  </p>
                  <div className="flex items-stretch overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700/50 mb-6 w-full">
                    <button
                      type="button"
                      onClick={() => setGuestCount((n) => Math.max(0, n - 1))}
                      disabled={guestCount === 0}
                      aria-label="Decrease guests"
                      className="flex items-center justify-center w-14 h-14 shrink-0 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-neutral-600/80 active:bg-neutral-300 dark:active:bg-neutral-600 disabled:opacity-35 disabled:pointer-events-none disabled:hover:bg-transparent transition-colors text-2xl font-light leading-none"
                    >
                      −
                    </button>
                    <span
                      className="flex items-center justify-center flex-1 min-w-0 h-14 border-x border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-[20px] font-semibold text-neutral-900 dark:text-white tabular-nums"
                      aria-live="polite"
                    >
                      {guestCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setGuestCount((n) => Math.min(5, n + 1))}
                      disabled={guestCount === 5}
                      aria-label="Increase guests"
                      className="flex items-center justify-center w-14 h-14 shrink-0 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-neutral-600/80 active:bg-neutral-300 dark:active:bg-neutral-600 disabled:opacity-35 disabled:pointer-events-none disabled:hover:bg-transparent transition-colors text-2xl font-light leading-none"
                    >
                      +
                    </button>
                  </div>
                </>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setSignupConfirmModalOpen(false)}
                  className="rounded-xl bg-neutral-200 dark:bg-neutral-600 px-4 py-2.5 text-[15px] font-medium text-neutral-800 dark:text-white hover:opacity-90"
                >
                  Cancel
                </button>
                <Form method="post" className="inline">
                  {signupConfirmIsEditMode && (
                    <input
                      type="hidden"
                      name="intent"
                      value={attendanceGoing ? "update_guests" : "unsignup"}
                    />
                  )}
                  <input
                    type="hidden"
                    name="guest_count"
                    value={signupConfirmIsEditMode ? (attendanceGoing ? guestCount : 0) : guestCount}
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-[#f56772] px-4 py-2.5 text-[15px] font-medium text-white hover:opacity-90"
                  >
                    {signupConfirmIsEditMode
                      ? attendanceGoing
                        ? "Save"
                        : "Confirm"
                      : "Confirm"}
                  </button>
                </Form>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200/80 dark:border-neutral-700/60 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl px-6">
        <div className="max-w-2xl lg:max-w-5xl mx-auto py-4 flex items-center justify-between gap-4">
          {signups.length === 0 ? (
            <span className="text-[15px] text-neutral-500 dark:text-neutral-400">
              No one signed up yet
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setSignupModalOpen(true)}
              className="flex items-center gap-2 text-[15px] text-left text-neutral-700 dark:text-neutral-300"
            >
              <span className="flex items-center -space-x-2 shrink-0">
                {signups.slice(0, 3).map((s) => (
                  <span
                    key={s.id}
                    className="inline-grid shrink-0 place-items-center rounded-full bg-white dark:bg-neutral-700 border-2 border-white dark:border-neutral-900 text-[13px] ring-1 ring-neutral-200/80 dark:ring-neutral-600/80 overflow-hidden leading-none"
                    style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, padding: 0, boxSizing: "border-box" }}
                    title={signupDisplayName(s)}
                  >
                    {s.profile_emoji || DEFAULT_PROFILE_EMOJI}
                  </span>
                ))}
                {signups.length > 3 && (
                  <span
                    className="inline-grid shrink-0 place-items-center rounded-full border-2 border-neutral-200 dark:border-neutral-600 text-[13px] font-semibold tabular-nums leading-none text-neutral-700 dark:text-neutral-200 ring-1 ring-neutral-200/80 dark:ring-neutral-600/80 overflow-hidden bg-neutral-200 dark:bg-neutral-600"
                    style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, padding: 0, boxSizing: 'border-box' }}
                  >
                    +{signups.length - 3}
                  </span>
                )}
              </span>
              <span className="text-[#f56772] hover:opacity-80">
                {totalAttendees} registered
              </span>
            </button>
          )}
          {userSignedUp ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[15px] font-medium text-green-600 dark:text-green-400">
                {currentUserGuestCount > 0
                  ? `You and ${currentUserGuestCount} ${currentUserGuestCount === 1 ? "guest" : "guests"} are signed up for this event`
                  : "You're signed up for this event"}
              </span>
              {!eventStarted && (
                <button
                  type="button"
                  onClick={() => {
                    setSignupConfirmIsEditMode(true);
                    setAttendanceGoing(true);
                    setGuestCount(currentUserGuestCount);
                    setSignupConfirmModalOpen(true);
                  }}
                  className="text-[15px] font-medium text-[#f56772] hover:underline"
                >
                  Edit attendance
                </button>
              )}
            </div>
          ) : eventStarted ? null : (
            <button
              type="button"
              onClick={() => {
                setSignupConfirmIsEditMode(false);
                setAttendanceGoing(true);
                setGuestCount(0);
                setSignupConfirmModalOpen(true);
              }}
              className="rounded-xl bg-[#f56772] px-5 py-2.5 text-[15px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
            >
              Sign up for this event
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}
