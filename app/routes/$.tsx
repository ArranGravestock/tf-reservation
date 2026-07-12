// Catch-all for unmatched URLs. Without this, React Router logs a noisy
// "No routes matched location" error for every internet bot probing for
// things like /.env, /wp-json/..., /config/.env, etc. This returns a plain,
// quiet 404 instead.
export function loader() {
  throw new Response("Not Found", { status: 404 });
}

export default function CatchAll() {
  return null;
}
