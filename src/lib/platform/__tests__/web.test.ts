import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWebAdapter } from "../web";

describe("createWebAdapter", () => {
  it('returns an adapter with kind === "web"', () => {
    const adapter = createWebAdapter();
    expect(adapter.kind).toBe("web");
  });

  describe("openExternal", () => {
    beforeEach(() => {
      vi.spyOn(window, "open").mockReturnValue(null);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("calls window.open with the correct arguments", async () => {
      const adapter = createWebAdapter();
      await adapter.openExternal("https://example.com");
      expect(window.open).toHaveBeenCalledOnce();
      expect(window.open).toHaveBeenCalledWith(
        "https://example.com",
        "_blank",
        "noopener",
      );
    });
  });

  describe("saveFile", () => {
    let createdUrl: string;
    let anchor: HTMLAnchorElement;

    beforeEach(() => {
      createdUrl = "blob:http://localhost/fake-object-url";

      // Stub URL methods.
      vi.spyOn(URL, "createObjectURL").mockReturnValue(createdUrl);
      vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);

      // Capture the anchor element created inside saveFile.
      anchor = document.createElement("a");
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        if (tag === "a") return anchor;
        // Fall through for any other tags.
        return document.createElement.call(document, tag);
      });
      vi.spyOn(anchor, "click").mockReturnValue(undefined);
      vi.spyOn(document.body, "appendChild").mockReturnValue(anchor);
      vi.spyOn(document.body, "removeChild").mockReturnValue(anchor);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("creates an object URL from the Blob", async () => {
      const adapter = createWebAdapter();
      const blob = new Blob(["hello"], { type: "text/plain" });
      await adapter.saveFile("note.md", blob);
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    });

    it("sets anchor href to the object URL and download to the file name", async () => {
      const adapter = createWebAdapter();
      const blob = new Blob(["hello"], { type: "text/plain" });
      await adapter.saveFile("export.md", blob);
      expect(anchor.href).toBe(createdUrl);
      expect(anchor.download).toBe("export.md");
    });

    it("clicks the anchor to trigger the download", async () => {
      const adapter = createWebAdapter();
      const blob = new Blob(["hello"], { type: "text/plain" });
      await adapter.saveFile("note.md", blob);
      expect(anchor.click).toHaveBeenCalledOnce();
    });

    it("revokes the object URL after the download is initiated", async () => {
      vi.useFakeTimers();
      const adapter = createWebAdapter();
      const blob = new Blob(["hello"], { type: "text/plain" });
      await adapter.saveFile("note.md", blob);
      // revokeObjectURL is called inside a setTimeout(100).
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
    });
  });

  describe("startOAuthFlow", () => {
    it("throws a not-implemented error", async () => {
      const adapter = createWebAdapter();
      await expect(adapter.startOAuthFlow("google")).rejects.toThrow(
        /not yet implemented/i,
      );
    });
  });

  describe("desktop-only methods", () => {
    // Callers reach these through `platform.method?.()`. Leaving them undefined
    // on web is what makes that guard a no-op in the browser — if one ever
    // gains a web implementation, the guard silently starts firing.
    it("leaves checkForUpdate undefined so the web build never self-updates", () => {
      const adapter = createWebAdapter();
      expect(adapter.checkForUpdate).toBeUndefined();
    });

    it("leaves the remaining desktop-only methods undefined", () => {
      const adapter = createWebAdapter();
      expect(adapter.setWindowTitle).toBeUndefined();
      expect(adapter.registerMenuHandler).toBeUndefined();
      expect(adapter.registerGlobalShortcut).toBeUndefined();
      expect(adapter.spawnTerminal).toBeUndefined();
    });
  });
});
