/**
 * Tauri desktop adapter — delegates OS-level operations to Tauri plugins.
 * Imported lazily by `index.ts` only when running inside a Tauri WebView
 * (`window.__TAURI__` is present).
 *
 * CAPABILITY NOTICE: Each Tauri plugin call below requires the corresponding
 * capability to be granted in `src-tauri/tauri.conf.json` (and the matching
 * Rust plugin registered in `src-tauri/src/lib.rs`). Missing capabilities
 * will cause a runtime error rather than a TypeScript error. See Tauri docs:
 * https://v2.tauri.app/security/capabilities/
 *
 * Required plugins:
 *   - `@tauri-apps/plugin-opener`  → capability: `core:opener`
 *   - `@tauri-apps/plugin-dialog`  → capability: `dialog:allow-save`
 *   - `@tauri-apps/plugin-fs`      → capability: `fs:allow-write-binary-file`
 *   - `@tauri-apps/api` (window)   → capability: `core:window:allow-set-title`
 */

import type { PlatformAdapter } from "./types";

export function createTauriAdapter(): PlatformAdapter {
  return {
    kind: "tauri",

    /**
     * Desktop OAuth via a temporary loopback server (ADR-0004).
     * Open the auth URL in the SYSTEM browser via plugin-opener — opening it in
     * this WebView makes Google reject it as `disallowed_useragent`.
     * Requires `callbacks.redirect` in convex/auth.ts to allow 127.0.0.1 ports.
     */
    async startOAuthFlow(_provider: "google"): Promise<void> {
      throw new Error(
        "startOAuthFlow: Tauri desktop OAuth is not yet implemented. " +
          "Pattern is decided (loopback) — see ARCHITECTURE §8.3 and ADR-0004.",
      );
    },

    /**
     * Open a URL in the OS default browser.
     * CAPABILITY: `core:opener` must be in the app's capability list.
     */
    async openExternal(url: string): Promise<void> {
      // NOTE: Requires `@tauri-apps/plugin-opener` to be registered in Rust.
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    },

    /**
     * Show an OS native save-file dialog and write the Blob to the chosen path.
     * CAPABILITIES: `dialog:allow-save` + `fs:allow-write-binary-file`.
     */
    async saveFile(name: string, data: Blob): Promise<void> {
      // NOTE: Requires `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`.
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");

      const filePath = await save({
        defaultPath: name,
      });

      if (filePath === null) {
        // User cancelled the dialog — treat as a no-op.
        return;
      }

      const buffer = await data.arrayBuffer();
      await writeFile(filePath, new Uint8Array(buffer));
    },

    /**
     * Update the native window title bar.
     * CAPABILITY: `core:window:allow-set-title`.
     */
    setWindowTitle(title: string): void {
      // NOTE: Requires `@tauri-apps/api` with the window capability granted.
      // Fire-and-forget — title updates are best-effort.
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        void getCurrentWindow().setTitle(title);
      });
    },

    // registerMenuHandler, registerGlobalShortcut, spawnTerminal:
    // Intentionally undefined — YAGNI until Phase 2/3.
  };
}
