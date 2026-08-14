/**
 * Tests for <BackendStatus /> — the visible proof that the Convex live query
 * reaches the server and that usePlatform() resolves (issue #1 AC #3).
 *
 * `convex/react` is an external SDK boundary, so its `useQuery` hook is
 * mocked to drive the three subscription states:
 *   - undefined → still connecting (no server response yet)
 *   - null      → server responded, caller not signed in
 *   - user doc  → server responded with the signed-in user
 *
 * The platform side is NOT mocked — the real PlatformProvider resolves the
 * real web adapter (happy-dom has no window.__TAURI__).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { PlatformProvider } from "~/lib/platform";
import { BackendStatus } from "../BackendStatus";
import { useQuery } from "convex/react";

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: vi.fn(),
}));

const useQueryMock = vi.mocked(useQuery);

function renderWidget() {
  return render(
    <PlatformProvider>
      <BackendStatus />
    </PlatformProvider>,
  );
}

describe("BackendStatus", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a connecting state while the subscription has no server response", async () => {
    useQueryMock.mockReturnValue(undefined);

    renderWidget();

    const status = await screen.findByTestId("backend-status");
    expect(status.textContent).toMatch(/connecting/i);
  });

  it("shows connected + signed out when the server answers with no user", async () => {
    useQueryMock.mockReturnValue(null);

    renderWidget();

    const status = await screen.findByTestId("backend-status");
    expect(status.textContent).toMatch(/connected/i);
    expect(status.textContent).toMatch(/signed out/i);
  });

  it("shows the user's name when the server answers with a signed-in user", async () => {
    useQueryMock.mockReturnValue({
      _id: "users:1",
      _creationTime: 0,
      tokenIdentifier: "google|sub123",
      name: "Zero Koo",
      email: "zero@example.com",
    });

    renderWidget();

    const status = await screen.findByTestId("backend-status");
    expect(status.textContent).toMatch(/connected/i);
    expect(status.textContent).toMatch(/Zero Koo/);
  });

  it("shows the resolved platform adapter kind (web in this environment)", async () => {
    useQueryMock.mockReturnValue(undefined);

    renderWidget();

    const status = await screen.findByTestId("backend-status");
    expect(status.textContent).toMatch(/platform: web/i);
  });
});
