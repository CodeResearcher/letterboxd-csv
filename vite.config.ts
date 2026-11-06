import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Letterboxd Disc Registration",
        short_name: "Disc CSV",
        description: "Scan DVD and Blu-ray barcodes and build a Letterboxd-importable CSV.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#14181c",
        theme_color: "#14181c",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "/index.html",
        // API responses and camera streams always need the network, so nothing
        // is runtime-cached: a stale title is worse than a slow lookup.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // Camera access needs a secure context; `vite --host` over LAN is not one,
    // so phones must reach the app through an HTTPS tunnel or deployment.
    host: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Keeps the suite independent of whatever is in `.env.local`.
    setupFiles: ["src/test/setupEnv.ts"],
  },
});