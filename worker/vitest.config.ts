import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The Worker is a separate deployment with its own tsconfig, so it gets its own
 * Vitest config. Keeping it out of the app's `vite.config.ts` matters: the app
 * suite runs in a `node` environment and never imports Worker code, and mixing
 * the two would let a Worker import leak into the PWA bundle.
 *
 * `root` is pinned to this directory so `include` cannot accidentally match the
 * app's own `src/**` tests when the config is pointed at from the repo root.
 */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
