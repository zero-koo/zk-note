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
  // Tauri 2 always injects __TAURI_INTERNALS__ into its WebView; __TAURI__
  // additionally exists only when `app.withGlobalTauri` is enabled in
  // tauri.conf.json. Check both so detection works either way.
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
  /** Optional fallback rendered while the adapter resolves (default: null). */
  fallback?: ReactNode;
}

/**
 * Resolves the platform adapter on mount and provides it to the React tree.
 * Mount this once near the application root, wrapping all components that need
 * `usePlatform()`. The `children` are not rendered until the adapter is ready
 * to prevent consumers from reading a null adapter.
 */
export function PlatformProvider({
  children,
  fallback = null,
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
      <div role="alert" style={{ padding: "1rem", color: "red" }}>
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
