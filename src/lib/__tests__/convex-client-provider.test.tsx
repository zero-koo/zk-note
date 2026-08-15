/**
 * Tests for ConvexClientProvider.
 *
 * Covers:
 *  - Error path: missing VITE_CONVEX_URL renders a visible diagnostic
 *    (the app must not die silently — issue #1 AC #5).
 *  - Happy path: with a URL configured, children render inside a
 *    ConvexProvider and can reach the client via useConvex().
 *
 * Same strategy as the platform tests: vi.resetModules() before each test so
 * the module-level client singleton is cleared, vi.stubEnv() to control the
 * deployment URL, then dynamic-import the module under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

describe("ConvexClientProvider", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // globals:false disables testing-library's automatic cleanup — do it
    // explicitly so renders don't leak across tests.
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders a diagnostic naming VITE_CONVEX_URL when the deployment URL is missing", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "");

    const { ConvexClientProvider } = await import("../convex");

    render(
      <ConvexClientProvider>
        <div data-testid="children">should not appear</div>
      </ConvexClientProvider>,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/VITE_CONVEX_URL/);
    // Children must NOT be rendered — no half-alive app without a backend.
    expect(screen.queryByTestId("children")).toBeNull();
  });

  it("renders a diagnostic instead of a white screen when the URL is malformed", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "not-an-absolute-url");

    const { ConvexClientProvider } = await import("../convex");

    render(
      <ConvexClientProvider>
        <div data-testid="children">should not appear</div>
      </ConvexClientProvider>,
    );

    const alert = screen.getByRole("alert");
    // The diagnostic must expose the underlying cause, not swallow it.
    expect(alert.textContent).toMatch(/not-an-absolute-url|absolute URL/i);
    expect(screen.queryByTestId("children")).toBeNull();
  });

  it("renders children with a usable Convex client when the URL is configured", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "https://test-deployment.convex.cloud");

    const { ConvexClientProvider } = await import("../convex");
    const { useConvex } = await import("convex/react");

    function Child() {
      // Throws if no ConvexProvider is mounted above.
      const client = useConvex();
      return <div data-testid="url">{client.url}</div>;
    }

    render(
      <ConvexClientProvider>
        <Child />
      </ConvexClientProvider>,
    );

    expect(screen.getByTestId("url").textContent).toBe(
      "https://test-deployment.convex.cloud",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
