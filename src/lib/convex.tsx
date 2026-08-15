/**
 * Convex client bootstrap.
 *
 * Reads the deployment URL from `VITE_CONVEX_URL` (inlined by Vite at build
 * time, so the packaged desktop build carries it too). When the URL is
 * missing or malformed the provider renders a visible diagnostic instead of
 * mounting the app — the app must never die silently without a backend
 * (issue #1 AC #5).
 *
 * AUTH DECISION GATE (convex/auth.ts Option A/B): this mounts the plain
 * `ConvexProvider`, which sends no auth token. That is correct only while no
 * login flow exists — once the desktop OAuth ticket lands, this must become
 * `ConvexProviderWithAuth` (or convex-auth's provider), otherwise
 * `ctx.auth.getUserIdentity()` stays null forever.
 */

import type { ReactElement, ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

/**
 * Module-level singleton — one WebSocket per app, survives React remounts.
 * Created lazily so that a missing URL renders a diagnostic instead of
 * throwing during module evaluation (which would be a silent white screen).
 *
 * The `url` argument is only honoured on the first call; that is safe because
 * it always comes from `import.meta.env`, which is constant per build.
 */
let _client: ConvexReactClient | null = null;

function getOrCreateClient(url: string): ConvexReactClient {
  if (_client === null) {
    _client = new ConvexReactClient(url);
  }
  return _client;
}

function ConfigError({ children }: { children: ReactNode }): ReactElement {
  return (
    <div role="alert" className="p-4 text-danger">
      {children}
    </div>
  );
}

interface ConvexClientProviderProps {
  children: ReactNode;
}

/**
 * Mounts the Convex React client for the whole app.
 * Mount this once near the application root, wrapping all components that
 * use Convex hooks (`useQuery`, `useMutation`, …).
 */
export function ConvexClientProvider({
  children,
}: ConvexClientProviderProps): ReactElement {
  const url = import.meta.env.VITE_CONVEX_URL;

  if (!url) {
    return (
      <ConfigError>
        Convex deployment URL is not configured: set VITE_CONVEX_URL in
        .env.local (see the value in the Convex dashboard) and rebuild.
      </ConfigError>
    );
  }

  let client: ConvexReactClient;
  try {
    client = getOrCreateClient(url);
  } catch (err) {
    // e.g. "Provided address was not an absolute URL." — surface the cause
    // instead of letting the render crash into a white screen.
    return (
      <ConfigError>
        Convex deployment URL is invalid ({url}):{" "}
        {err instanceof Error ? err.message : String(err)}
      </ConfigError>
    );
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
