import { data } from "react-router";
import type { Route } from "./+types/notices.dismiss";
import { requireVerifiedUser } from "~/lib/auth.server";
import { getDb, dismissNotice } from "~/lib/db.server";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") throw new Response("Method Not Allowed", { status: 405 });
  const user = await requireVerifiedUser(request);
  const formData = await request.formData();
  const noticeId = formData.get("notice_id");
  const id = typeof noticeId === "string" ? parseInt(noticeId, 10) : NaN;
  if (!id) throw new Response("Bad Request", { status: 400 });
  const db = getDb();
  const notice = db.prepare("SELECT id FROM notices WHERE id = ?").get(id);
  if (!notice) throw new Response("Not found", { status: 404 });
  dismissNotice(db, user.id, id);
  return data({ dismissed: true });
}
