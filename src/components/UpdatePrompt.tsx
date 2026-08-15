/**
 * Carries the update UX contract decided in ticket #19:
 *
 *   - Check once per app start, in the foreground. No polling timer.
 *   - On a hit, announce the version and wait for the user to accept.
 *     NEVER auto-apply — installing relaunches the process, and there is no
 *     unsynced-editor-buffer safety net yet (ARCHITECTURE §9.1), so an
 *     unannounced restart loses in-flight edits.
 *   - On failure, log and carry on silently. The next start retries, so there
 *     is nothing for the user to act on.
 *
 * Renders nothing on web: `checkForUpdate` is a desktop-only optional method,
 * so the guarded call is a no-op there.
 */

import { useEffect, useState } from "react";
import { usePlatform } from "../lib/platform";
import type { PendingUpdate } from "../lib/platform/types";

export function UpdatePrompt() {
  const platform = usePlatform();
  const [update, setUpdate] = useState<PendingUpdate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await platform.checkForUpdate?.();
        if (!cancelled && found) setUpdate(found);
      } catch (err) {
        // Offline, endpoint unreachable, signature mismatch — the user can act
        // on none of these, and the next start retries.
        console.warn("업데이트 확인 실패:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  if (update === null || dismissed) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        insetInline: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        background: "rgba(127,127,127,0.14)",
        borderTop: "1px solid rgba(127,127,127,0.3)",
        backdropFilter: "blur(8px)",
        fontSize: "0.875rem",
      }}
    >
      <span style={{ flex: 1 }}>
        새 버전 <strong>{update.version}</strong> 이 있습니다.
        {installing ? " 설치 중 — 잠시 후 앱이 다시 시작됩니다." : null}
      </span>

      <button
        type="button"
        disabled={installing}
        onClick={() => {
          setInstalling(true);
          // The process is replaced partway through, so there is no success
          // path to handle — only failure brings us back here.
          update.installAndRelaunch().catch((err: unknown) => {
            console.warn("업데이트 설치 실패:", err);
            setInstalling(false);
          });
        }}
        style={{ padding: "0.35rem 0.75rem", cursor: installing ? "wait" : "pointer" }}
      >
        지금 설치
      </button>

      <button
        type="button"
        disabled={installing}
        onClick={() => setDismissed(true)}
        style={{ padding: "0.35rem 0.75rem", cursor: "pointer" }}
      >
        나중에
      </button>
    </div>
  );
}
