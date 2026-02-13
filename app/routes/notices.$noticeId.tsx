import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/notices.$noticeId";
import { requireVerifiedUser } from "~/lib/auth.server";
import { getDb, getNoticeById } from "~/lib/db";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Notice – Terrible Football Liverpool" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireVerifiedUser(request);
  const { noticeId } = await params;
  if (noticeId === "create" || noticeId === "dismiss") throw new Response("Not found", { status: 404 });
  const id = parseInt(noticeId, 10);
  if (Number.isNaN(id)) throw new Response("Not found", { status: 404 });
  const db = getDb();
  const notice = getNoticeById(db, id);
  if (!notice) throw new Response("Not found", { status: 404 });
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

export default function NoticeDetail() {
  const { notice } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen bg-[#f5f5f7] dark:bg-[#1c1c1e] p-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/notices" className="text-[15px] text-[#0A84FF] hover:opacity-80 mb-6 inline-block">
          ← Back to notices
        </Link>
        <div className="rounded-2xl bg-white dark:bg-neutral-800/80 p-6 shadow-sm dark:shadow-none border border-neutral-200/60 dark:border-neutral-700/60">
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mb-2">
            Update for event: {formatEventLabel(notice.event_date, notice.event_title)}
          </p>
          <p className="text-[17px] text-neutral-900 dark:text-white leading-relaxed whitespace-pre-wrap">
            {notice.message}
          </p>
        </div>
      </div>
    </main>
  );
}
