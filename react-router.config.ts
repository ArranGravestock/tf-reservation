import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // React Router rejects form submissions (400 Bad Request) whose Origin
  // header doesn't match the request URL, as CSRF protection. In production
  // TLS ends at the proxy, so the app sees http:// while browsers send an
  // https:// Origin — list the real public hosts so their submissions pass.
  allowedActionOrigins: ["terriblefootball.net", "www.terriblefootball.net"],
  // Opt in to React Router v8 behaviour early (silences the future-flag
  // warnings and makes the eventual v8 upgrade a no-op).
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
