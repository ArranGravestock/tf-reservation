import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/notices.create";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, ensureSaturdayEvents, createNotice, type Event } from "~/lib/db";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Create notice – Terrible Football Liverpool" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const db = getDb();
  ensureSaturdayEvents(db, 12);
  const events = db
    .prepare("SELECT id, event_date, title FROM events ORDER BY event_date ASC")
    .all() as (Pick<Event, "id" | "event_date"> & { title?: string | null })[];
  return { events };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const formData = await request.formData();
  const eventId = formData.get("event_id");
  const message = formData.get("message");
  const eventIdNum = typeof eventId === "string" ? parseInt(eventId, 10) : NaN;
  if (!eventIdNum || !message || typeof message !== "string" || !message.trim()) {
    return { error: "Please select an event and enter a message." };
  }
  const db = getDb();
  const event = db.prepare("SELECT id FROM events WHERE id = ?").get(eventIdNum);
  if (!event) return { error: "Event not found." };
  createNotice(db, { eventId: eventIdNum, message: message.trim(), createdBy: user.id });
  return redirect("/notices?created=1");
}

function formatEventLabel(e: { event_date: string; title?: string | null }) {
  const d = new Date(e.event_date + "T12:00:00");
  const dateStr = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return e.title?.trim() ? `${dateStr} – ${e.title}` : dateStr;
}

export default function NoticesCreate() {
  const { events } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/notices" className="text-[15px] text-[#0A84FF] hover:opacity-80 mb-6 inline-block">
          ← Back to notices
        </Link>
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
          Create notice
        </h1>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-8">
          Notices are shown as a toast to everyone who has signed up for the selected event.
        </p>
        <Form
          method="post"
          className="space-y-5 rounded-3xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60"
        >
          {actionData?.error && (
            <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2.5 text-[15px]">
              {actionData.error}
            </div>
          )}
          <div>
            <label htmlFor="event_id" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Event
            </label>
            <select
              id="event_id"
              name="event_id"
              required
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800"
            >
              <option value="">Select an event</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatEventLabel(e)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="message" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={4}
              placeholder="e.g. This Saturday we're meeting at the north entrance instead."
              className="w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 dark:focus:ring-offset-neutral-800 resize-y min-h-[100px]"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#0A84FF] px-4 py-3 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Create notice
          </button>
        </Form>
      </div>
    </main>
  );
}
