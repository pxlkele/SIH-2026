import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "data/*.csv"],
      manifest: {
        name: "Beacon · Intelligent Dead Reckoning",
        short_name: "Beacon",
        description:
          "Continuous positioning when GPS fails. Tunnels, basements, urban canyons — no vehicle hardware required.",
        start_url: "/app",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#07090d",
        theme_color: "#0b0e13",
        categories: ["navigation", "maps", "utilities"],
        icons: [
          { src: "/pwa-192.png",      sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512.png",      sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cache large map tiles + drive replay CSVs so the app boots offline.
        // Mapbox tiles are runtime-cached (network-first, fall back to cache).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,csv,woff2,json}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,   // 5 MB per file cap
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "mapbox-api",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /^https:\/\/[a-z]\.tiles\.mapbox\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mapbox-tiles",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,   // don't run the SW in dev; it messes with HMR
      },
    }),
  ],
});
