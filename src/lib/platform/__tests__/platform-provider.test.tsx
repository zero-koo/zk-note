/**
 * Tests for PlatformProvider and usePlatform().
 *
 * Covers:
 *  - Happy path: children see `kind` once the adapter resolves.
 *  - Error path: PlatformProvider renders a diagnostic when getPlatform rejects.
 *  - usePlatform() throws when called outside a provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

describe("PlatformProvider + usePlatform", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI__;
    vi.restoreAllMocks();
  });

  it("provides the resolved adapter to children (kind shown in DOM)", async () => {
    vi.doMock("../web", () => ({
      createWebAdapter: () => ({ kind: "web" }),
    }));
    vi.doMock("../tauri", () => ({
      createTauriAdapter: () => ({ kind: "tauri" }),
    }));

    const { PlatformProvider, usePlatform } = await import("../index");

    function Child() {
      const platform = usePlatform();
      return <div data-testid="kind">{platform.kind}</div>;
    }

    render(
      <PlatformProvider>
        <Child />
      </PlatformProvider>,
    );

    const el = await waitFor(() => screen.getByTestId("kind"));
    expect(el.textContent).toBe("web");
  });

  it("renders a diagnostic when getPlatform rejects (no eternal blank)", async () => {
    vi.doMock("../web", () => {
      throw new Error("web module failed to load");
    });
    vi.doMock("../tauri", () => {
      throw new Error("tauri module failed to load");
    });

    const { PlatformProvider } = await import("../index");

    render(
      <PlatformProvider fallback={<div data-testid="loading">loading</div>}>
        <div data-testid="children">should not appear</div>
      </PlatformProvider>,
    );

    // After the rejection resolves, a role="alert" error message must appear.
    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toMatch(/failed to initialise platform adapter/i);
    // Children must NOT be rendered.
    expect(screen.queryByTestId("children")).toBeNull();
  });

  it("usePlatform() throws when called outside a PlatformProvider", async () => {
    vi.doMock("../web", () => ({
      createWebAdapter: () => ({ kind: "web" }),
    }));

    const { usePlatform } = await import("../index");

    // Suppress the expected React error boundary console.error noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    function Standalone() {
      const platform = usePlatform();
      return <div>{platform.kind}</div>;
    }

    expect(() => render(<Standalone />)).toThrow(/PlatformProvider/i);

    spy.mockRestore();
  });
});
