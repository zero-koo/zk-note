/**
 * Carries the update UX contract decided in ADR-0006:
 *
 *   - Check once per app start, in the foreground. No polling timer.
 *   - On a hit, announce the version and wait for the user to accept.
 *     NEVER auto-apply — installing relaunches the process, and there is no
 *     unsynced-editor-buffer safety net yet (ARCHITECTURE §9.1), so an
 *     unannounced restart loses in-flight edits.
 *   - On failure, log and carry on silently. The next start retries, so there
 *     is nothing for the user to act on.
 *
 * Renders nothing on web: the web adapter's `checkForUpdate` always answers
 * `null`, so this component asks every platform the same question and simply
 * never has anything to show in a browser.
 */

import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { usePlatform } from "~/lib/platform";
import type { PendingUpdate } from "~/lib/platform/types";

export function UpdatePrompt(): ReactElement | null {
  const platform = usePlatform();
  const [update, setUpdate] = useState<PendingUpdate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await platform.checkForUpdate();
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
      data-testid="update-prompt"
      className="fixed inset-x-0 bottom-0 flex items-center gap-3 border-t border-strong bg-surface-subtle px-4 py-3 text-sm"
    >
      <span className="flex-1">
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
        className="rounded bg-accent px-3 py-1.5 text-surface hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
      >
        지금 설치
      </button>

      <button
        type="button"
        disabled={installing}
        onClick={() => setDismissed(true)}
        className="rounded border border-strong px-3 py-1.5 hover:bg-surface-muted disabled:opacity-60"
      >
        나중에
      </button>
    </div>
  );
}
