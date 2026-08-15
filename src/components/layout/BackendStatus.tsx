/**
 * BackendStatus — small status widget proving the app is actually wired:
 *   - a Convex live query (`auth.currentUser`) whose transition from
 *     "connecting" to a server answer is visible evidence the subscription
 *     reached the deployment (issue #1 AC #3);
 *   - the resolved platform adapter kind from usePlatform().
 *
 * Subscription states, per Convex useQuery semantics:
 *   undefined → no server response yet (still connecting / loading)
 *   null      → server responded: no authenticated user
 *   user doc  → server responded: signed-in user record
 */

import type { ReactElement } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { usePlatform } from "~/lib/platform";

export function BackendStatus(): ReactElement {
  const currentUser = useQuery(api.auth.currentUser);
  const platform = usePlatform();

  return (
    <div data-testid="backend-status" className="text-sm text-muted">
      <span>
        {currentUser === undefined
          ? "Convex: connecting…"
          : currentUser === null
            ? "Convex: connected — signed out"
            : `Convex: connected — ${currentUser.name ?? currentUser.email ?? "signed in"}`}
      </span>
      {" · "}
      <span>platform: {platform.kind}</span>
    </div>
  );
}
