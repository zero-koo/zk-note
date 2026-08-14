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
// Auto-update helper types (desktop-only — signature only, implemented in the
// release-channel work)
// ---------------------------------------------------------------------------

/**
 * A newer version found on the update channel, plus the action that applies it.
 *
 * Modelled as a handle (like `TerminalHandle`) rather than a plain data object
 * so the adapter doesn't have to stash the in-flight update between two calls.
 */
export interface PendingUpdate {
  /** Semver of the available update, e.g. `"0.1.1"`. */
  version: string;
  /** Release notes from the manifest, when present. */
  notes?: string;
  /** Publish date from the manifest, when present. */
  date?: string;
  /**
   * Download, install, and relaunch into the new version.
   *
   * The running process is replaced, so this normally does not return — treat
   * any code after the await as unreachable. Callers MUST NOT invoke this
   * without user consent: there is no unsynced-editor-buffer safety net yet
   * (ARCHITECTURE §9.1), so an unannounced relaunch loses in-flight edits.
   */
  installAndRelaunch(): Promise<void>;
}

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
   * Ask the update channel whether a newer version exists.
   *
   * Returns `null` when already up to date. Rejects only on unexpected errors;
   * routine failures (offline, endpoint unreachable) are the caller's to
   * swallow — see the UX contract below.
   *
   * UX contract (decided alongside the release channel):
   *   - Called once per app start, in the foreground. No polling timer.
   *   - On a hit, the UI announces the version and waits for the user to accept
   *     before calling `installAndRelaunch()`. Never auto-apply — a note editor
   *     that restarts mid-edit loses work.
   *   - On failure, log and carry on silently. The next app start retries, so
   *     there is nothing for the user to act on.
   *
   * Desktop only.
   */
  checkForUpdate?(): Promise<PendingUpdate | null>;

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
