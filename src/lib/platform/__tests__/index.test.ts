import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for getPlatform() branching and singleton behaviour.
 *
 * Strategy: use vi.resetModules() before each test so that the module-level
 * singleton (_adapter / _pending) is cleared. Then stub the dynamic imports for
 * `./tauri` and `./web` via vi.doMock() (non-hoisted), and control
 * `globalThis.isTauri` directly — that is the marker Tauri v2 actually sets.
 */

describe("getPlatform", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).isTauri;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI__;
    vi.restoreAllMocks();
  });

  it('returns a web adapter (kind === "web") outside Tauri', async () => {
    vi.doMock("../web", () => ({
      createWebAdapter: () => ({ kind: "web" }),
    }));
    vi.doMock("../tauri", () => ({
      createTauriAdapter: () => ({ kind: "tauri" }),
    }));

    // Dynamic import AFTER mocks are registered so the mocks take effect.
    const { getPlatform } = await import("../index");
    const adapter = await getPlatform();
    expect(adapter.kind).toBe("web");
  });

  it('returns a tauri adapter (kind === "tauri") when globalThis.isTauri is set', async () => {
    // This is the marker Tauri v2 injects into every WebView it owns.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).isTauri = true;

    vi.doMock("../web", () => ({
      createWebAdapter: () => ({ kind: "web" }),
    }));
    vi.doMock("../tauri", () => ({
      createTauriAdapter: () => ({ kind: "tauri" }),
    }));

    const { getPlatform } = await import("../index");
    const adapter = await getPlatform();
    expect(adapter.kind).toBe("tauri");
  });

  // Regression: detection used to key off window.__TAURI__, which Tauri v2 only
  // injects when app.withGlobalTauri is enabled (it is not). That made isTauri()
  // always false, so the desktop app silently ran the WEB adapter and every
  // desktop-only method became an undefined no-op behind its `?.()` guard —
  // no error, no log, just a feature that never fired.
  it("does not treat window.__TAURI__ alone as Tauri", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__ = {};

    vi.doMock("../web", () => ({
      createWebAdapter: () => ({ kind: "web" }),
    }));
    vi.doMock("../tauri", () => ({
      createTauriAdapter: () => ({ kind: "tauri" }),
    }));

    const { getPlatform } = await import("../index");
    const adapter = await getPlatform();
    expect(adapter.kind).toBe("web");
  });

  it("returns the same instance on repeated calls (singleton)", async () => {
    vi.doMock("../web", () => ({
      createWebAdapter: () => ({ kind: "web" }),
    }));
    vi.doMock("../tauri", () => ({
      createTauriAdapter: () => ({ kind: "tauri" }),
    }));

    const { getPlatform } = await import("../index");
    const first = await getPlatform();
    const second = await getPlatform();
    expect(first).toBe(second);
  });

  it("allows retry after a transient failure (_pending resets on rejection)", async () => {
    // Use a call counter so the first createWebAdapter() call throws but the
    // second (retry) succeeds — all within the same module instance so we
    // verify that _pending was actually cleared rather than testing a fresh module.
    let callCount = 0;
    vi.doMock("../web", () => ({
      createWebAdapter: () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error("transient failure");
        }
        return { kind: "web" };
      },
    }));
    vi.doMock("../tauri", () => ({
      createTauriAdapter: () => ({ kind: "tauri" }),
    }));

    const { getPlatform } = await import("../index");

    // First attempt must reject.
    await expect(getPlatform()).rejects.toThrow("transient failure");

    // Second attempt on the same module must resolve — proves _pending was
    // cleared and not permanently stuck on the settled-rejected promise.
    const adapter = await getPlatform();
    expect(adapter.kind).toBe("web");
  });
});
