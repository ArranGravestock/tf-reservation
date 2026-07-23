import { redirect } from "react-router";
import type { Route } from "./+types/late-warning.dismiss";
import { requireVerifiedUser } from "~/lib/auth.server";
import { getDb, acknowledgeLateWarning } from "~/lib/db";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") throw new Response("Method Not Allowed", { status: 405 });
  const user = await requireVerifiedUser(request);
  const formData = await request.formData();
  const signupId = formData.get("signup_id");
  const id = typeof signupId === "string" ? parseInt(signupId, 10) : NaN;
  if (!id) throw new Response("Bad Request", { status: 400 });
  const db = getDb();
  acknowledgeLateWarning(db, user.id, id);
  const referer = request.headers.get("Referer") ?? "";
  try {
    const url = new URL(referer);
    if (url.origin === new URL(request.url).origin) return redirect(url.pathname + url.search);
  } catch {
    // invalid or missing referer
  }
  return redirect("/events");
}
