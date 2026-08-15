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

/**
 * A newer version found on the update channel, plus the action that applies it.
 *
 * Modelled as a handle rather than a plain data object so the adapter doesn't
 * have to stash the in-flight update between two calls.
 */
export interface PendingUpdate {
  /** Semver of the available update, e.g. `"0.1.2"`. */
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

  /**
   * Ask the update channel whether a newer version exists (ADR-0006).
   * Returns `null` when already up to date.
   *
   * - Desktop: queries the manifest at `plugins.updater.endpoints`.
   * - Web: always `null`. The browser has nothing to self-update, and saying so
   *   here keeps the caller free of platform branches.
   *
   * Rejects only on unexpected errors; routine failures (offline, endpoint
   * unreachable) are the caller's to swallow — see the UX contract below.
   *
   * UX contract:
   *   - Called once per app start, in the foreground. No polling timer.
   *   - On a hit, the UI announces the version and waits for the user to accept
   *     before calling `installAndRelaunch()`. Never auto-apply — a note editor
   *     that restarts mid-edit loses work.
   *   - On failure, log and carry on silently. The next app start retries, so
   *     there is nothing for the user to act on.
   */
  checkForUpdate(): Promise<PendingUpdate | null>;
}
