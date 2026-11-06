import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Where the app is served from.
 *
 * GitHub Pages project sites live under `/<repo>/`, but a root deployment (or
 * local dev) has to stay at `/`. A hard-coded prefix in the manifest icons or
 * `start_url` silently produces a 404-ing install prompt on one of the two, so
 * every path is derived from this single value.
 *
 * Override with `PAGES_BASE=/ npm run build` for a root deployment.
 */
const PAGES_BASE = readEnv("PAGES_BASE") ?? "/letterboxd-csv.github.io/";

/** `process` is not typed here (no @types/node), so read it defensively. */
function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const value = env?.[name];
  return value?.trim() ? value.trim() : undefined;
}

/** Always ends with a slash, which Vite and the manifest both rely on. */
function normalizeBase(value: string): string {
  if (value === "" || value === "./") return "/";
  return value.endsWith("/") ? value : `${value}/`;
}

export default defineConfig(({ command }) => {
  // The dev server still runs at the origin root: deep links and HMR are
  // simpler there, and nothing about the Pages subpath matters locally.
  const base = command === "build" ? normalizeBase(PAGES_BASE) : "/";

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icons/*.png"],
        manifest: {
          name: "Letterboxd Disc Registration",
          short_name: "Disc CSV",
          description: "Scan DVD and Blu-ray barcodes and build a Letterboxd-importable CSV.",
          // The plugin does not prefix these itself, so a subpath deploy would
          // otherwise point the manifest at the domain root.
          start_url: base,
          scope: base,
          display: "standalone",
          orientation: "portrait",
          background_color: "#14181c",
          theme_color: "#14181c",
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png" },
            { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png" },
            {
              src: `${base}icons/icon-maskable-512.png`,
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
          // Relative, not "/index.html": Workbox resolves this against the
          // precache keys, which are relative to the service worker's scope.
          // An absolute path would miss on a subpath deployment.
          navigateFallback: "index.html",
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
    // `vite preview` must serve from the same subpath the build assumed,
    // otherwise the preview does not reflect what GitHub Pages will do.
    preview: { port: 4173 },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      // Keeps the suite independent of whatever is in `.env.local`.
      setupFiles: ["src/test/setupEnv.ts"],
    },
  };
});