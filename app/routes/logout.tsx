import { redirect } from "react-router";
import { logout } from "~/lib/auth.server";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return redirect("/events");
  const headers = await logout(request);
  return redirect("/login", { headers });
}

export default function Logout() {
  return null;
}
