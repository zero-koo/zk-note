/**
 * Vitest configuration — separate from vite.config.ts to avoid pulling in the
 * `@tanstack/react-start` plugin, which generates server/router artefacts and
 * is incompatible with the Vitest test runner.
 *
 * Two projects, one runner (`pnpm test` runs both):
 *  - `src`    — React code in a happy-dom browser-like environment.
 *  - `convex` — backend functions against convex-test's in-memory backend,
 *               in the edge-runtime environment the Convex guidelines require
 *               (convex/_generated/ai/guidelines.md).
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            "~": resolve(__dirname, "./src"),
          },
        },
        test: {
          name: "src",
          environment: "happy-dom",
          globals: false,
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        },
      },
      {
        test: {
          name: "convex",
          environment: "edge-runtime",
          globals: false,
          include: ["convex/**/*.test.ts"],
        },
      },
    ],
  },
});
