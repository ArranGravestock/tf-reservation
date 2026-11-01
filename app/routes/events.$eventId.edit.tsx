import { useState } from "react";
import { Form, Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/events.$eventId.edit";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, cancelEvent, updateEvent, getEventHosts, setEventHost, type Event } from "~/lib/db.server";

const DEFAULT_TITLE = "Terrible Football Liverpool";
const DEFAULT_LOCATION = "Wavertree Botanic Gardens, Edge Lane, Innovation Boulevard, Liverpool";
const DEFAULT_TIME = "10:30am";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Edit event – Terrible Football Liverpool" }];
}

function loadEvent(id: number) {
  return getDb()
    .prepare("SELECT id, event_date, created_at, title, description, location, time, cancelled, custom, content FROM events WHERE id = ?")
    .get(id) as Event | undefined;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const id = parseInt(params.eventId, 10);
  if (Number.isNaN(id)) throw new Response("Not found", { status: 404 });
  const event = loadEvent(id);
  if (!event) throw new Response("Not found", { status: 404 });
  // Cancelled events are read-only.
  if (event.cancelled) throw redirect(`/events/${id}`);
  const db = getDb();
  const userIsHost = getEventHosts(db, id).some((h) => h.id === admin.id);
  const { c: signupCount } = db
    .prepare("SELECT COUNT(*) AS c FROM event_signups WHERE event_id = ?")
    .get(id) as { c: number };
  return { event, userIsHost, signupCount };
}

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  const id = parseInt(params.eventId, 10);
  if (Number.isNaN(id)) throw new Response("Not found", { status: 404 });
  const event = loadEvent(id);
  if (!event) throw new Response("Not found", { status: 404 });
  if (event.cancelled) return redirect(`/events/${id}`);
  const db = getDb();
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cancel") {
    const reason = formData.get("reason");
    cancelEvent(db, {
      eventId: id,
      reason: typeof reason === "string" ? reason.slice(0, 2000) : null,
      cancelledBy: admin.id,
    });
    return redirect("/events");
  }

  if (intent !== "edit") throw new Response("Bad Request", { status: 400 });
  const text = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() || null : null;
  };
  const eventDate = text("event_date");
  updateEvent(db, id, {
    ...(eventDate && { event_date: eventDate }),
    title: text("title"),
    description: text("description"),
    location: text("location"),
    time: text("time"),
    content: text("content"),
  });
  // Admins can add/remove themselves as a host of this event.
  setEventHost(db, id, admin.id, formData.get("host_self") === "on");
  return redirect(`/events/${id}`);
}

const inputClass =
  "w-full rounded-xl bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 px-3 py-2 text-[15px] text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f56772]";
const labelClass = "block text-[13px] font-medium text-neutral-600 dark:text-neutral-400 mb-1.5";

export default function EditEvent() {
  const { event, userIsHost, signupCount } = useLoaderData<typeof loader>();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <Link to={`/events/${event.id}`} className="text-[15px] text-[#f56772] hover:opacity-80 mb-6 inline-block">
          ← Back to event
        </Link>
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-6">Edit event</h1>

        <Form
          method="post"
          className="space-y-4 rounded-2xl bg-white dark:bg-neutral-800/80 p-5 border border-neutral-200/60 dark:border-neutral-700/60 mb-6"
        >
          <input type="hidden" name="intent" value="edit" />
          <div>
            <label htmlFor="title" className={labelClass}>Title</label>
            <input id="title" type="text" name="title" defaultValue={event.title ?? ""} placeholder={DEFAULT_TITLE} className={inputClass} />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[140px]">
              <label htmlFor="event_date" className={labelClass}>Date</label>
              <input id="event_date" type="date" name="event_date" defaultValue={event.event_date} required className={inputClass} />
            </div>
            <div className="flex-1 min-w-[100px]">
              <label htmlFor="time" className={labelClass}>Time</label>
              <input id="time" type="text" name="time" defaultValue={event.time ?? ""} placeholder={DEFAULT_TIME} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="location" className={labelClass}>Location</label>
            <input id="location" type="text" name="location" defaultValue={event.location ?? ""} placeholder={DEFAULT_LOCATION} className={inputClass} />
          </div>
          <div>
            <label htmlFor="description" className={labelClass}>Description</label>
            <input
              id="description"
              type="text"
              name="description"
              defaultValue={event.description ?? ""}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="content" className={labelClass}>Content</label>
            <textarea
              id="content"
              name="content"
              defaultValue={event.content ?? ""}
              placeholder="Optional"
              rows={8}
              className={`${inputClass} resize-y min-h-[160px]`}
            />
            <p className="mt-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
              Markdown supported — **bold**, _italic_, lists, links, etc.
            </p>
          </div>
          <label className="flex items-center gap-2.5 text-[15px] text-neutral-700 dark:text-neutral-300 py-1">
            <input
              type="checkbox"
              name="host_self"
              defaultChecked={userIsHost}
              className="rounded border-neutral-300 dark:border-neutral-600 text-[#f56772] focus:ring-[#f56772]"
            />
            I&apos;m hosting this event
          </label>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              className="rounded-xl bg-[#f56772] px-4 py-2.5 text-[15px] font-medium text-white hover:opacity-90"
            >
              Save changes
            </button>
            <Link
              to={`/events/${event.id}`}
              className="rounded-xl border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-[15px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
            >
              Discard
            </Link>
          </div>
        </Form>

        <section className="rounded-2xl border border-red-300/80 dark:border-red-500/40 p-5">
          <h2 className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-1">Cancel event</h2>
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-4">
            Signed-up players get a notification. The event stays visible, marked as cancelled.
          </p>
          <button
            type="button"
            onClick={() => setCancelModalOpen(true)}
            className="rounded-xl border border-red-300 dark:border-red-500/40 px-4 py-2.5 text-[15px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Cancel event
          </button>
        </section>
      </div>

      {cancelModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setCancelModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-event-modal-title"
        >
          <div
            className="bg-white dark:bg-neutral-800 rounded-3xl shadow-xl max-w-md w-full p-6 border border-neutral-200/80 dark:border-neutral-700/60"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="cancel-event-modal-title" className="text-[17px] font-semibold text-neutral-900 dark:text-white mb-2">
              Cancel this event?
            </h3>
            <p className="text-[15px] text-neutral-600 dark:text-neutral-300 mb-4">
              {signupCount === 0
                ? "No one is signed up yet."
                : `${signupCount} signed-up ${signupCount === 1 ? "player" : "players"} will get a notification.`}
            </p>
            <Form method="post" onSubmit={() => setCancelModalOpen(false)}>
              <input type="hidden" name="intent" value="cancel" />
              <label htmlFor="cancel-reason" className={labelClass}>
                Reason (optional)
              </label>
              <textarea
                id="cancel-reason"
                name="reason"
                rows={4}
                maxLength={2000}
                autoFocus
                placeholder="e.g. The pitch is waterlogged – see you next week!"
                className={`${inputClass} mb-4`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="flex-1 rounded-xl border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-[15px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                >
                  Keep event
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-[15px] font-medium text-white hover:bg-red-700 active:bg-red-800 transition-colors"
                >
                  Cancel event
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </main>
  );
}
