/**
 * Platform abstraction entry point.
 *
 * ## Architecture
 *
 * `getPlatform()` is the low-level async factory: it detects the runtime
 * environment once, lazily imports the correct adapter module, and caches the
 * result as a module-level singleton so that subsequent calls return
 * immediately without re-importing.
 *
 * React components should NOT call `getPlatform()` directly. Instead:
 *
 *   1. Wrap the app tree with `<PlatformProvider>` (once, near the root).
 *   2. Consume with `const platform = usePlatform()` in any component.
 *
 * `usePlatform()` synchronously returns the cached adapter after the provider
 * resolves it. While the adapter is still loading (initial render), the
 * provider renders nothing (or a loader — adjust to taste); `usePlatform()`
 * will throw if called before resolution, which surfaces as an error boundary
 * hit — this is intentional, it means the provider is missing or the component
 * mounted too early.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";
import type { PlatformAdapter } from "./types";

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

/** The resolved adapter — null until first resolution. */
let _adapter: PlatformAdapter | null = null;

/**
 * In-flight promise guard: if two callers race, they await the same promise
 * rather than each triggering a separate dynamic import.
 */
let _pending: Promise<PlatformAdapter> | null = null;

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

function isTauri(): boolean {
  // Three markers, any of which means we are inside a Tauri WebView:
  //   - `globalThis.isTauri` — what the official isTauri() helper in
  //     @tauri-apps/api/core checks. Inlined rather than imported so the web
  //     bundle pulls in no Tauri code.
  //   - `__TAURI_INTERNALS__` — always injected by Tauri 2; this is the one that
  //     carries a packaged build.
  //   - `__TAURI__` — only when `app.withGlobalTauri` is enabled (it is not).
  //
  // Checking `__TAURI__` ALONE is the bug this replaced: it made isTauri()
  // always false, so the desktop app silently ran the WEB adapter and every
  // desktop-only path quietly did nothing, with no error anywhere.
  if ((globalThis as { isTauri?: boolean }).isTauri) return true;
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// ---------------------------------------------------------------------------
// Public async factory
// ---------------------------------------------------------------------------

/**
 * Resolve and return the platform adapter.
 * Safe to call multiple times — returns the cached singleton after the first
 * successful resolution.
 */
export async function getPlatform(): Promise<PlatformAdapter> {
  if (_adapter !== null) return _adapter;

  if (_pending !== null) return _pending;

  _pending = (async () => {
    try {
      const adapter = isTauri()
        ? (await import("./tauri")).createTauriAdapter()
        : (await import("./web")).createWebAdapter();
      _adapter = adapter;
      return adapter;
    } finally {
      // Clear on success AND failure so a transient failure can be retried.
      _pending = null;
    }
  })();

  return _pending;
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

const PlatformContext = createContext<PlatformAdapter | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface PlatformProviderProps {
  children: ReactNode;
  /**
   * Rendered while the adapter resolves. The default says something visible on
   * purpose: a blank screen is indistinguishable from a dead app, which is the
   * failure mode the bootstrap ticket set out to prevent. Pass your own to
   * match a screen's layout — but prefer replacing it over blanking it.
   */
  fallback?: ReactNode;
}

const DEFAULT_FALLBACK = (
  <div role="status" className="p-4 text-muted">
    Starting up…
  </div>
);

/**
 * Resolves the platform adapter on mount and provides it to the React tree.
 * Mount this once near the application root, wrapping all components that need
 * `usePlatform()`. The `children` are not rendered until the adapter is ready
 * to prevent consumers from reading a null adapter.
 */
export function PlatformProvider({
  children,
  fallback = DEFAULT_FALLBACK,
}: PlatformProviderProps): ReactElement | null {
  const [adapter, setAdapter] = useState<PlatformAdapter | null>(
    // If already resolved (e.g. hot-reload), use it immediately.
    _adapter,
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (adapter !== null) return;
    let cancelled = false;
    getPlatform().then(
      (resolved) => {
        if (!cancelled) setAdapter(resolved);
      },
      (err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err : new Error(String(err)));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  if (error !== null) {
    return (
      <div role="alert" className="p-4 text-danger">
        Failed to initialise platform adapter: {error.message}
      </div>
    ) as ReactElement;
  }

  if (adapter === null) {
    return fallback as ReactElement | null;
  }

  return (
    <PlatformContext.Provider value={adapter}>
      {children}
    </PlatformContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the resolved `PlatformAdapter` for the current environment.
 *
 * Throws if:
 *   - Called outside a `<PlatformProvider>` (context is null AND not yet
 *     resolved — most likely a missing provider).
 *   - The provider hasn't resolved yet and this hook runs before the provider
 *     has swapped in the adapter (should not happen in practice because the
 *     provider gates rendering, but included as a safety net).
 *
 * @example
 * ```tsx
 * const platform = usePlatform();
 * await platform.saveFile("note.md", blob);
 * ```
 */
export function usePlatform(): PlatformAdapter {
  const adapter = useContext(PlatformContext);
  if (adapter === null) {
    throw new Error(
      "usePlatform() was called before the PlatformAdapter resolved. " +
        "Ensure your component tree is wrapped in <PlatformProvider> and " +
        "that usePlatform() is not called outside of it.",
    );
  }
  return adapter;
}

export type { PlatformAdapter } from "./types";
