/**
 * PlatformAdapter — the single seam between platform-agnostic React code and
 * OS/browser capabilities. UI components never touch `window.__TAURI__` or
 * platform-specific APIs directly; they go through this interface via
 * `usePlatform()`.
 *
 * The interface carries only what BOTH adapters actually implement today.
 * Future capabilities (OAuth flow, window title, menus, global shortcuts,
 * embedded terminal — see ARCHITECTURE §8 and Phase 2/3) are added by the
 * ticket that first consumes them, together with their real implementations.
 */

export interface PlatformAdapter {
  /** Discriminator — lets call-sites branch without `instanceof`. */
  kind: "tauri" | "web";

  /**
   * Open a URL in the user's default browser.
   * - Desktop: delegates to the OS via `@tauri-apps/plugin-opener`.
   * - Web: `window.open(url, "_blank", "noopener")`.
   */
  openExternal(url: string): Promise<void>;

  /**
   * Save a file to disk.
   * - Desktop: shows an OS native save-dialog via Tauri plugins.
   * - Web: triggers an anchor-download in the browser.
   */
  saveFile(name: string, data: Blob): Promise<void>;
}
