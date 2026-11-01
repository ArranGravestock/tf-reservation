import type { Route } from "./+types/notifications.read";
import { requireVerifiedUser } from "~/lib/auth.server";
import { getDb, markNoticeRead, markAllNoticesRead } from "~/lib/db.server";

/**
 * Mark one notification (notice_id) or all of them (all=1) as read. Called via
 * a fetcher from the notification panel, so it returns data rather than
 * redirecting — the root loader revalidates and the badge updates in place.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") throw new Response("Method Not Allowed", { status: 405 });
  const user = await requireVerifiedUser(request);
  const formData = await request.formData();
  const db = getDb();
  if (formData.get("all") === "1") {
    markAllNoticesRead(db, user.id);
    return { ok: true };
  }
  const noticeId = formData.get("notice_id");
  const id = typeof noticeId === "string" ? parseInt(noticeId, 10) : NaN;
  if (!id) throw new Response("Bad Request", { status: 400 });
  const notice = db.prepare("SELECT id FROM notices WHERE id = ?").get(id);
  if (!notice) throw new Response("Not found", { status: 404 });
  markNoticeRead(db, user.id, id);
  return { ok: true };
}
