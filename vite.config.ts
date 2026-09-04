import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
    VitePWA({
      registerType: "autoUpdate",
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
