import { useEffect, useRef } from "react";

// Minimal typing for Cloudflare's widget API (https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile failed to load")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile widget. Place inside a <Form>: it adds a hidden
 * `cf-turnstile-response` input that the server verifies. Change `resetKey`
 * (e.g. after a failed submit) to get a fresh token — tokens are single-use.
 */
export function Turnstile({ siteKey, resetKey }: { siteKey: string; resetKey?: unknown }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetIdRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          size: "flexible",
        });
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
  }, [resetKey]);

  return <div ref={containerRef} className="min-h-[65px]" />;
}
