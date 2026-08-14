/**
 * PlatformAdapter — the single seam between platform-agnostic React code and
 * OS/browser capabilities. UI components never touch `window.__TAURI__` or
 * platform-specific APIs directly; they go through this interface via
 * `usePlatform()`.
 *
 * Naming convention:
 *   - Required methods: available on both "tauri" and "web".
 *   - Optional methods (`?`): desktop-only or Phase 2/3 — may be undefined on
 *     web; callers must guard with `platform.method?.()`.
 */

// ---------------------------------------------------------------------------
// Phase 2/3 helper types (desktop-only, YAGNI — signatures only for now)
// ---------------------------------------------------------------------------

export interface TerminalOptions {
  /** Working directory for the spawned terminal process. */
  cwd?: string;
  /** Environment variables to inject. */
  env?: Record<string, string>;
}

export interface TerminalHandle {
  /** Write raw text to the terminal's stdin. */
  write(data: string): Promise<void>;
  /** Kill the terminal process. */
  kill(): Promise<void>;
  /** Fired when the process produces output. */
  onData(callback: (data: string) => void): () => void;
}

// ---------------------------------------------------------------------------
// Core interface
// ---------------------------------------------------------------------------

export interface PlatformAdapter {
  /** Discriminator — lets call-sites branch without `instanceof`. */
  kind: "tauri" | "web";

  /**
   * Kick off a platform-appropriate OAuth flow.
   * - Desktop (Tauri): temporary loopback server on `http://127.0.0.1:<port>`
   *   (ADR-0004). The auth page MUST open in the system browser, never in the
   *   WebView — Google rejects WKWebView with `disallowed_useragent`.
   * - Web: redirect to provider.
   */
  startOAuthFlow(provider: "google"): Promise<void>;

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

  // -------------------------------------------------------------------------
  // Desktop-only (optional — undefined on web)
  // -------------------------------------------------------------------------

  /** Update the OS window title bar. Desktop only. */
  setWindowTitle?(title: string): void;

  /**
   * Register a handler for a native application-menu item.
   * @param id  Menu item identifier as defined in `src-tauri/src/menu.rs`.
   * Desktop only. Phase 2.
   */
  registerMenuHandler?(id: string, handler: () => void): void;

  /**
   * Register a global (system-wide) keyboard shortcut.
   * Desktop only. Phase 2.
   */
  registerGlobalShortcut?(
    accelerator: string,
    handler: () => void,
  ): Promise<void>;

  /**
   * Spawn an embedded terminal panel.
   * Desktop only. Phase 3.
   */
  spawnTerminal?(opts: TerminalOptions): Promise<TerminalHandle>;
}
