import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
    VitePWA({
      registerType: "autoUpdate",
      // No index.html for this SSR framework to inject a registration script
      // into — the service worker is registered manually from app/root.tsx.
      // PWA support (manifest + service worker) is production-build only —
      // the dev server has no built assets to precache, and a service worker
      // actively caching files would fight with Vite's HMR anyway.
      injectRegister: false,
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
        scope: "/",
        start_url: "/events",
        categories: ["sports", "lifestyle"],
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
      workbox: {
        // This is a server-rendered app with per-request auth and live data
        // (sign-ups, blocking, admin state) — don't precache or offline-serve
        // HTML navigations or data requests, only the static build assets.
        navigateFallback: undefined,
        globPatterns: ["**/*.{js,css,woff2}"],
      },
    }),
  ],
});
