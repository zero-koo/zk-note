/**
 * Web / PWA adapter — uses standard browser APIs only, no Tauri dependencies.
 * Imported lazily by `index.tsx` when `window.__TAURI__` is absent.
 */

import type { PlatformAdapter } from "./types";

export function createWebAdapter(): PlatformAdapter {
  return {
    kind: "web",

    /** Open a URL in a new browser tab without opener access. */
    async openExternal(url: string): Promise<void> {
      window.open(url, "_blank", "noopener");
    },

    /**
     * Trigger a file download using a temporary anchor element.
     * Creates an object URL, clicks the link, then immediately revokes to
     * avoid holding the Blob in memory beyond the download initiation.
     */
    async saveFile(name: string, data: Blob): Promise<void> {
      const url = URL.createObjectURL(data);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        // Append to body so Firefox triggers the download correctly.
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } finally {
        // Revoke async to give the browser time to start the download.
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
    },

    /**
     * The browser has nothing to self-update — the page is always whatever the
     * server last served. Answering `null` (rather than omitting the method or
     * throwing) is what keeps `UpdatePrompt` free of platform branches: it asks
     * every platform the same question and simply gets "no" here.
     */
    async checkForUpdate(): Promise<null> {
      return null;
    },
  };
}
