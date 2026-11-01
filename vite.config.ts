import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// vite-plugin-pwa only serves the dev service worker's workbox-*.js chunk
// after /dev-sw.js has been requested in the current dev-server session. After
// a restart, the SW already installed in the browser can request the chunk
// first, which falls through to React Router ("No route matches URL
// /workbox-….js"). Serve those chunks straight from dev-dist instead.
function serveDevWorkbox(): Plugin {
  return {
    name: "serve-dev-workbox",
    apply: "serve",
    configureServer(server) {
      const devDist = path.resolve(server.config.root, "dev-dist");
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/(workbox-[\w-]+\.js)(?:\?.*)?$/);
        const file = match && path.join(devDist, match[1]);
        if (!file || !existsSync(file)) return next();
        res.setHeader("Content-Type", "text/javascript");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    serveDevWorkbox(),
    tailwindcss(),
    reactRouter(),
    VitePWA({
      registerType: "autoUpdate",
      // React Router's client build goes to build/client, but vite-plugin-pwa
      // 2 reads the top-level build.outDir (default "dist") — point it at the
      // directory react-router-serve actually serves.
      outDir: "build/client",
      // No index.html for this SSR framework to inject a registration script
      // into — the service worker is registered manually from app/root.tsx.
      injectRegister: false,
      // Serve a (non-precaching) service worker + manifest in dev too, purely
      // so the browser considers the app installable and fires
      // beforeinstallprompt — lets the nav's install button be tested locally
      // without a production build. It doesn't precache anything, so it
      // won't fight with Vite's HMR.
      devOptions: {
        enabled: true,
        type: "module",
        // dev-dist never contains build assets, so workbox's default glob
        // pattern always matches nothing — silence that expected warning.
        suppressWarnings: true,
      },
      manifest: {
        // Fixed app identity PWABuilder/TWA use to key store updates —
        // changing this after publishing would look like a new app install.
        id: "terrible-football",
        name: "Terrible Football Liverpool",
        short_name: "Terrible FC",
        description: "Sign up for Terrible Football Liverpool games.",
        theme_color: "#f56772",
        background_color: "#f5f5f7",
        display: "standalone",
        orientation: "portrait",
        dir: "ltr",
        scope: "/",
        start_url: "/events",
        categories: ["sports", "lifestyle"],
        launch_handler: {
          client_mode: "focus-existing",
        },
        shortcuts: [
          {
            name: "Events",
            url: "/events",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "FAQ",
            url: "/faq",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [
          {
            src: "screenshots/events-wide.jpg",
            sizes: "1280x623",
            type: "image/jpeg",
            form_factor: "wide",
            label: "Browse upcoming Saturday sessions",
          },
          {
            src: "screenshots/events-narrow.jpg",
            sizes: "500x755",
            type: "image/jpeg",
            form_factor: "narrow",
            label: "Browse upcoming Saturday sessions",
          },
        ],
      },
      workbox:
        command === "build"
          ? {
              // This is a server-rendered app with per-request auth and live
              // data (sign-ups, blocking, admin state) — don't precache or
              // offline-serve HTML navigations or data requests, only the
              // static build assets.
              navigateFallback: undefined,
              globPatterns: ["**/*.{js,css,woff2}"],
            }
          : {
              // Dev has no build output to precache — workbox-build still
              // requires *some* precache or runtime-caching config to exist,
              // so give it a runtime-caching entry that never actually
              // matches anything.
              navigateFallback: undefined,
              runtimeCaching: [{ urlPattern: () => false, handler: "NetworkOnly" }],
            },
    }),
  ],
}));
