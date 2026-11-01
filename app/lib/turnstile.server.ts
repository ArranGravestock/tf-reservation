// Cloudflare Turnstile (bot check) — https://developers.cloudflare.com/turnstile/
//
// Enabled only when both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set,
// so local dev works without keys. Cloudflare's test keys (always pass):
//   TURNSTILE_SITE_KEY=1x00000000000000000000AA
//   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Form field the widget writes its token into. */
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

let warnedMissingKeys = false;

function keys() {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim();
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (siteKey && secretKey) return { siteKey, secretKey };
  if (process.env.NODE_ENV === "production" && !warnedMissingKeys) {
    warnedMissingKeys = true;
    console.warn("[turnstile] TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY not set — bot check on sign-up is DISABLED.");
  }
  return null;
}

/** Public site key for the widget, or null when Turnstile is disabled. */
export function getTurnstileSiteKey(): string | null {
  return keys()?.siteKey ?? null;
}

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    undefined
  );
}

/**
 * Verify the widget token submitted with a form. Returns true when Turnstile
 * is disabled (no keys). Fails closed: a missing/invalid token or an
 * unreachable Cloudflare API returns false.
 */
export async function verifyTurnstile(request: Request, formData: FormData): Promise<boolean> {
  const config = keys();
  if (!config) return true;

  const token = formData.get(TURNSTILE_RESPONSE_FIELD);
  if (typeof token !== "string" || !token) return false;

  const body = new URLSearchParams({ secret: config.secretKey, response: token });
  const ip = clientIp(request);
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    const result = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!result.success) console.warn("[turnstile] verification failed:", result["error-codes"]);
    return result.success === true;
  } catch (err) {
    console.error("[turnstile] siteverify request failed:", err);
    return false;
  }
}
