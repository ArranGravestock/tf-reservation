import { Form, Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/events.create";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, createCustomEvent } from "~/lib/db";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Create event – Terrible Football Liverpool" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const eventDate = formData.get("event_date");
  const title = formData.get("title");
  const description = formData.get("description");
  const location = formData.get("location");
  const time = formData.get("time");
  const content = formData.get("content");

  if (typeof eventDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim())) {
    return { error: "Please choose a valid date." };
  }

  const db = getDb();
  try {
    const event = createCustomEvent(db, {
      event_date: eventDate.trim(),
      title: typeof title === "string" && title.trim() ? title.trim() : null,
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      location: typeof location === "string" && location.trim() ? location.trim() : null,
      time: typeof time === "string" && time.trim() ? time.trim() : null,
      content: typeof content === "string" && content.trim() ? content.trim() : null,
    });
    return redirect(`/events/${event.id}`);
  } catch (e) {
    return { error: "Failed to create event. Please try again." };
  }
}

export default function EventsCreate() {
  const actionData = useActionData<typeof action>();

  const inputClass =
    "w-full rounded-xl bg-neutral-100 dark:bg-neutral-700/50 border-0 px-4 py-3 text-[17px] text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#f56772] focus:ring-offset-2 dark:focus:ring-offset-neutral-800";

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/events" className="text-[15px] text-[#f56772] hover:opacity-80 mb-6 inline-block">
          ← Back to events
        </Link>
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
          Create event
        </h1>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-8">
          Add a one-off event on any date. It's shown alongside the regular Saturday and Wednesday events.
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
            <label htmlFor="event_date" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Date
            </label>
            <input
              id="event_date"
              name="event_date"
              type="date"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="title" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              placeholder="Terrible Football Liverpool"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="time" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Time
            </label>
            <input
              id="time"
              name="time"
              type="text"
              placeholder="10:30am"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="location" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              placeholder="Wavertree Botanic Gardens, Edge Lane, Innovation Boulevard, Liverpool"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Description
            </label>
            <input
              id="description"
              name="description"
              type="text"
              placeholder="Description (optional)"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="content" className="block text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Content
            </label>
            <textarea
              id="content"
              name="content"
              rows={6}
              placeholder="Content (optional) — Markdown supported"
              className={`${inputClass} resize-y min-h-[140px]`}
            />
            <p className="mt-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
              Markdown supported — **bold**, _italic_, lists, links, etc.
            </p>
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#f56772] px-4 py-3 text-[17px] font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Create event
          </button>
        </Form>
      </div>
    </main>
  );
}
