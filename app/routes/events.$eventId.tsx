import { useEffect, useState } from "react";
import { Form, Link, useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/events.$eventId";
import { isAdmin, requireAdmin, requireVerifiedUser } from "~/lib/auth.server";
import { getDb, updateEvent, isEventEnded, isEventStarted, type Event } from "~/lib/db";
import { DEFAULT_PROFILE_EMOJI } from "~/lib/emoji";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Session – Terrible Football Liverpool" }];
}

const DEFAULT_TITLE = "Terrible Football Liverpool";
const DEFAULT_DESCRIPTION = "Saturday football session";
const DEFAULT_LOCATION = "Wavertree Botanic Gardens, Edge Lane, Innovation Boulevard, Liverpool";
const DEFAULT_TIME = "10:30am";

export async function loader({ request, params }: { request: Request; params: Promise<{ eventId: string }> }) {
  const user = await requireVerifiedUser(request);
  const { eventId } = await params;
  const id = parseInt(eventId, 10);
  if (Number.isNaN(id)) throw new Response("Not found", { status: 404 });
  const db = getDb();
  const event = db
    .prepare("SELECT id, event_date, created_at, title, description, location, time FROM events WHERE id = ?")
    .get(id) as Event | undefined;
  if (!event) throw new Response("Not found", { status: 404 });
  const signups = db.prepare(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.profile_emoji, s.created_at as signed_up_at, COALESCE(s.guest_count, 0) as guest_count FROM event_signups s JOIN users u ON u.id = s.user_id WHERE s.event_id = ? ORDER BY s.created_at ASC`
  ).all(id) as { id: number; username: string; first_name: string | null; last_name: string | null; profile_emoji: string | null; signed_up_at: number; guest_count: number }[];
  const userSignedUp = signups.some((s) => s.id === user.id);
  const currentUserSignup = signups.find((s) => s.id === user.id);
  const eventEnded = isEventEnded(event);
  const eventStarted = isEventStarted(event);
  return {
    event,
    signups,
    userSignedUp,
    currentUserGuestCount: currentUserSignup?.guest_count ?? 0,
    isAdmin: isAdmin(user),
    eventEnded,
    eventStarted,
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
  const ended = isEventEnded(event);
  const started = isEventStarted(event);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "unsignup") {
    const user = await requireVerifiedUser(request);
    db.prepare("DELETE FROM event_signups WHERE event_id = ? AND user_id = ?").run(id, user.id);
    return { unsignup: true };
  }

  if (intent === "update_guests") {
    if (started) return { error: "This session has already started. Sign-ups are closed." };
    if (ended) return { error: "This session has ended." };
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
    await requireAdmin(request);
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
    return { editSuccess: true };
  }

  if (started) return { error: "This session has already started. Sign-ups are closed." };
  if (ended) return { error: "This session has ended." };
  const user = await requireVerifiedUser(request);
  const rawGuest = formData.get("guest_count");
  const guestCount = Math.min(5, Math.max(0, typeof rawGuest === "string" ? parseInt(rawGuest, 10) || 0 : 0));
  try {
    db.prepare("INSERT INTO event_signups (event_id, user_id, guest_count) VALUES (?, ?, ?)").run(id, user.id, guestCount);
    return { success: true };
  } catch (e) {
    return { error: "You are already signed up for this session." };
  }
}

function signupDisplayName(s: { first_name: string | null; last_name: string | null; username: string }) {
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return name || s.username;
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

export default function EventDetail() {
  const { event, signups, userSignedUp, currentUserGuestCount, isAdmin, eventEnded, eventStarted } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [signupModalOpen, setSignupModalOpen] = useState(false);
  const [signupConfirmModalOpen, setSignupConfirmModalOpen] = useState(false);
  const [signupConfirmIsEditMode, setSignupConfirmIsEditMode] = useState(false);
  const [attendanceGoing, setAttendanceGoing] = useState(true);
  const [guestCount, setGuestCount] = useState(0);
  const [signupSearch, setSignupSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);

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
  }, [actionData]);

  const title = event.title?.trim() || DEFAULT_TITLE;
  const description = event.description?.trim() || DEFAULT_DESCRIPTION;
  const location = event.location?.trim() || DEFAULT_LOCATION;
  const time = event.time?.trim() || DEFAULT_TIME;

  const totalAttendees =
    signups.length + signups.reduce((sum, s) => sum + (s.guest_count ?? 0), 0);

  const inputClass =
    "w-full rounded-xl bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 px-3 py-2 text-[15px] text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]";

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-24">
      <div className="max-w-2xl lg:max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link
            to="/events"
            className="text-[15px] text-[#0A84FF] hover:opacity-80 inline-block"
          >
            ← Back to sessions
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
            This session has already started. Sign-ups are closed.
          </div>
        )}

        {userSignedUp && (
          <div className="rounded-2xl bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400 px-4 py-3 mb-6 text-[15px]">
            You&apos;re signed up for this session
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
              placeholder={DEFAULT_DESCRIPTION}
              className={inputClass}
              aria-label="Description"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#0A84FF] px-4 py-2.5 text-[15px] font-medium text-white hover:opacity-90"
            >
              Save changes
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
            <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-6">
              {description}
            </p>
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

        {actionData?.error && (
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
              <li>This session: {time} at {location}</li>
              <li>Everyone is welcome — every skill level, gender, sexuality. Just gotta be over 18!</li>
              <li>No one gets upset if we miss a pass… or the ball altogether. Skills vary from old semi-pro players to never kicked a ball. We weren&apos;t fibbing when we said inclusive.</li>
              <li>Hosted at the southern side of Wavertree Botanic Gardens</li>
              <li>Follow us on <a href="https://www.facebook.com/TerribleFC." target="_blank" rel="noopener noreferrer" className="text-[#0A84FF] hover:underline">Facebook</a> and <a href="https://www.instagram.com/terrible_football/?hl=en" target="_blank" rel="noopener noreferrer" className="text-[#0A84FF] hover:underline">Instagram</a> — tons of info on there!</li>
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
              <Link to="/faq" className="text-[#0A84FF] hover:underline">
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
              <a href="https://chat.whatsapp.com/" target="_blank" rel="noopener noreferrer" className="text-[#0A84FF] hover:underline">
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
              className="inline-block mt-2 text-[15px] text-[#0A84FF] hover:underline"
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
                  Signed up ({totalAttendees})
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
              <div className="p-4 shrink-0">
                <input
                  type="search"
                  placeholder="Search by name..."
                  value={signupSearch}
                  onChange={(e) => setSignupSearch(e.target.value)}
                  className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-2.5 text-[15px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                />
              </div>
              <ul className="overflow-y-auto flex-1 min-h-0 p-4 pt-0 space-y-2">
                {signups
                  .filter((s) => {
                    const q = signupSearch.trim().toLowerCase();
                    if (!q) return true;
                    const display = signupDisplayName(s).toLowerCase();
                    const username = s.username.toLowerCase();
                    return display.includes(q) || username.includes(q);
                  })
                  .map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
                    >
                      <span className="flex items-center gap-2 text-[15px] text-neutral-900 dark:text-white min-w-0">
                        <span className="text-xl leading-none shrink-0">
                          {s.profile_emoji || "👤"}
                        </span>
                        <span className="truncate">{signupDisplayName(s)}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[13px] text-neutral-500 dark:text-neutral-400">
                          {formatSignupTime(s.signed_up_at)}
                        </span>
                        {(s.guest_count ?? 0) > 0 && (
                          <span className="inline-flex items-center rounded-full bg-neutral-100 dark:bg-neutral-600/60 px-2.5 py-0.5 text-[12px] font-medium text-neutral-600 dark:text-neutral-300">
                            +{(s.guest_count ?? 0)} {(s.guest_count ?? 0) === 1 ? "guest" : "guests"}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
              {signups.filter((s) => {
                const q = signupSearch.trim().toLowerCase();
                if (!q) return true;
                const display = signupDisplayName(s).toLowerCase();
                const username = s.username.toLowerCase();
                return display.includes(q) || username.includes(q);
              }).length === 0 && (
                <p className="px-4 pb-4 text-[15px] text-neutral-500 dark:text-neutral-400">
                  No matches for &quot;{signupSearch}&quot;
                </p>
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
              <h3 id="signup-confirm-modal-title" className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-2">
                {signupConfirmIsEditMode ? "Edit attendance" : "Sign up for this session"}
              </h3>
              {signupConfirmIsEditMode ? (
                <>
                  <p className="text-[15px] text-neutral-600 dark:text-neutral-300 mb-4">
                    Are you going to this session?
                  </p>
                  <div className="flex items-stretch overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700/50 mb-4 w-full">
                    <button
                      type="button"
                      onClick={() => setAttendanceGoing(true)}
                      className={`flex-1 py-3.5 text-[15px] font-medium transition-colors ${
                        attendanceGoing
                          ? "bg-[#0A84FF] text-white"
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
                          ? "bg-[#0A84FF] text-white"
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
                      You&apos;ll be removed from the session.
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
                  <input type="hidden" name="guest_count" value={attendanceGoing ? guestCount : 0} />
                  <button
                    type="submit"
                    className="rounded-xl bg-[#0A84FF] px-4 py-2.5 text-[15px] font-medium text-white hover:opacity-90"
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
                    className="flex shrink-0 items-center justify-center w-7 h-7 min-w-7 min-h-7 rounded-full bg-white dark:bg-neutral-700 border-2 border-white dark:border-neutral-900 text-[13px] ring-1 ring-neutral-200/80 dark:ring-neutral-600/80 overflow-hidden leading-none"
                    title={signupDisplayName(s)}
                  >
                    <span className="inline-flex items-center justify-center leading-none">{s.profile_emoji || DEFAULT_PROFILE_EMOJI}</span>
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
              <span className="text-[#0A84FF] hover:opacity-80">
                {totalAttendees} registered
              </span>
            </button>
          )}
          {userSignedUp ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[15px] font-medium text-green-600 dark:text-green-400">
                {currentUserGuestCount > 0
                  ? `You and ${currentUserGuestCount} ${currentUserGuestCount === 1 ? "guest" : "guests"} are signed up for this session`
                  : "You're signed up for this session"}
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
                  className="text-[15px] font-medium text-[#0A84FF] hover:underline"
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
                setGuestCount(0);
                setSignupConfirmModalOpen(true);
              }}
              className="rounded-xl bg-[#0A84FF] px-5 py-2.5 text-[15px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
            >
              Sign up for this session
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}
