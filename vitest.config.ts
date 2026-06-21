/**
 * Vitest configuration — separate from vite.config.ts to avoid pulling in the
 * `@tanstack/react-start` plugin, which generates server/router artefacts and
 * is incompatible with the Vitest test runner.
 *
 * Tests run against the `src/` source directly in a happy-dom browser-like
 * environment. The `~/*` alias is wired up so that any future tests importing
 * via the TypeScript path alias work without extra config.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "~": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
