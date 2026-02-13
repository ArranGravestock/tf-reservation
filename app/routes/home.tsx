import { redirect } from "react-router";
import { getUserId } from "~/lib/auth.server";

export async function loader({ request }: { request: Request }) {
  const userId = await getUserId(request);
  if (userId) return redirect("/events");
  return redirect("/login");
}

export default function Home() {
  return null;
}
