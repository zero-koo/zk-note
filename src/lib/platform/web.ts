/**
 * Web / PWA adapter — uses standard browser APIs only, no Tauri dependencies.
 * Imported lazily by `index.tsx` when `window.__TAURI__` is absent.
 */

import type { PlatformAdapter } from "./types";

export function createWebAdapter(): PlatformAdapter {
  return {
    kind: "web",

    /**
     * OAuth on the web uses a standard browser redirect flow.
     * The actual redirect URL and provider config are handled by Convex Auth;
     * this stub represents the hook point.
     *
     * TODO (REQUIREMENTS open-question #6): wire up Convex Auth's redirect
     * helper here once the OAuth provider config is in place.
     */
    async startOAuthFlow(_provider: "google"): Promise<void> {
      throw new Error(
        "startOAuthFlow: web OAuth redirect is not yet implemented. " +
          "See ARCHITECTURE §8.2 and REQUIREMENTS open-question #6.",
      );
    },

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

    // Desktop-only methods are intentionally absent — they will be `undefined`
    // when spread/accessed through the interface, matching optional semantics.
  };
}
