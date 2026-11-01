import { redirect } from "react-router";
import type { Route } from "./+types/notices-redirect";

// /notices/... was renamed to /notifications/... — keep old links working.
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return redirect(url.pathname.replace(/^\/notices/, "/notifications") + url.search, 301);
}
