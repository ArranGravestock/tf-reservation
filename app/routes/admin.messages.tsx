import { useEffect } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/admin.messages";
import { requireAdmin } from "~/lib/auth.server";
import { getConversationsList, getDb } from "~/lib/db.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Messages – Terrible Football Liverpool" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const conversations = getConversationsList(getDb());
  return { conversations };
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

export default function AdminMessages() {
  const { conversations } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [revalidator]);

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/events" className="text-[15px] text-[#f56772] hover:opacity-80 mb-6 inline-block">
          ← Back
        </Link>
        <h1 className="text-[28px] font-semibold text-neutral-900 dark:text-white mb-2">
          Messages
        </h1>
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 mb-8">
          Conversations started via the contact form.
        </p>

        {conversations.length === 0 ? (
          <p className="text-[15px] text-neutral-500 dark:text-neutral-400 rounded-2xl bg-white dark:bg-neutral-800/80 p-6 border border-neutral-200/60 dark:border-neutral-700/60">
            No messages yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/admin/messages/${c.id}`}
                  className="block rounded-2xl bg-white dark:bg-neutral-800/80 p-4 border border-neutral-200/60 dark:border-neutral-700/60 hover:bg-neutral-50 dark:hover:bg-neutral-700/80 transition-colors"
                >
                  <p className="text-[15px] font-medium text-neutral-900 dark:text-white mb-1">
                    {c.username} <span className="font-normal text-neutral-500 dark:text-neutral-400">({c.email})</span>
                    {!!c.message_banned && (
                      <span className="ml-2 inline-block rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 text-[12px] font-medium align-middle">
                        Banned
                      </span>
                    )}
                  </p>
                  <p className="text-[15px] text-neutral-700 dark:text-neutral-300 mb-1.5 truncate">
                    {c.last_message}
                  </p>
                  <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
                    {formatCreatedAt(c.last_message_at)}
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
