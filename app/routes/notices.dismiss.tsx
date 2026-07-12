import { redirect } from "react-router";
import type { Route } from "./+types/notices.dismiss";
import { requireVerifiedUser } from "~/lib/auth.server";
import { getDb, dismissNotice } from "~/lib/db";

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
  // Redirect back to where the user came from, but only to a same-origin path
  // (never the raw Referer header, which could point off-site).
  const referer = request.headers.get("Referer") ?? "";
  try {
    const url = new URL(referer);
    if (url.origin === new URL(request.url).origin) {
      // Leaving a single-notice page: that notice is now gone, so go to /events.
      if (/\/notices\/\d+/.test(url.pathname)) return redirect("/events");
      return redirect(url.pathname + url.search);
    }
  } catch {
    // invalid or missing referer
  }
  return redirect("/events");
}
