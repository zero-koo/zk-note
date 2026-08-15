/**
 * PROTOTYPE — not part of the product UI.
 *
 * Drives one update cycle by hand so we can watch what macOS does to an
 * unsigned, un-notarised `.app` that replaces itself. See
 * `src/lib/updater/prototype-unsigned-update/NOTES.md` for the question this
 * answers and how to run it.
 *
 * This talks to `@tauri-apps/plugin-updater` directly rather than going through
 * `PlatformAdapter.checkForUpdate()`. The adapter implementation is deliberately
 * out of scope here — this probe is about Gatekeeper, not about the seam.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

export const Route = createFileRoute("/updater-probe")({
  component: UpdaterProbe,
});

/** One line of the running log, newest last. */
type LogLine = { at: string; text: string };

function UpdaterProbe() {
  const [version, setVersion] = useState<string>("(reading…)");
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);

  const say = useCallback((text: string) => {
    const at = new Date().toISOString().slice(11, 19);
    setLog((prev) => [...prev, { at, text }]);
    // Mirrored to the console so the run survives a relaunch that wipes the UI.
    console.log(`[updater-probe ${at}] ${text}`);
  }, []);

  // Read the version Tauri baked into the bundle. This is also how we verify
  // that `"version": "../package.json"` in tauri.conf.json actually resolved
  // at build time — the open question left by ticket #18.
  useEffect(() => {
    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setVersion(await getVersion());
      } catch (err) {
        setVersion(`(failed: ${String(err)})`);
      }
    })();
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      say("check() 호출");
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (update === null) {
        say("업데이트 없음 — manifest 의 version 이 현재 버전보다 높은지 확인할 것");
        return;
      }

      say(`발견: ${update.version} (현재 ${update.currentVersion})`);
      say("downloadAndInstall() 시작 — 서명 검증도 여기서 일어난다");

      await update.downloadAndInstall((event) => {
        // Progress events are the only signal that the transfer is alive.
        if (event.event === "Started") {
          say(`다운로드 시작 (${event.data.contentLength ?? "?"} bytes)`);
        } else if (event.event === "Finished") {
          say("다운로드·설치 완료");
        }
      });

      say("relaunch() 호출 — 여기서 프로세스가 교체된다");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
      say("relaunch() 가 반환됐다 — 보통 여기까지 오지 않는다");
    } catch (err) {
      say(`실패: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [say]);

  return (
    <main style={{ padding: "2rem", maxWidth: "720px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Updater probe</h1>

      <p style={{ margin: "1rem 0" }}>
        실행 중인 버전: <strong data-testid="running-version">{version}</strong>
      </p>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        style={{
          padding: "0.5rem 1rem",
          border: "1px solid currentColor",
          borderRadius: "0.25rem",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "진행 중…" : "업데이트 확인·설치"}
      </button>

      <pre
        style={{
          marginTop: "1.5rem",
          padding: "1rem",
          background: "rgba(127,127,127,0.12)",
          borderRadius: "0.25rem",
          whiteSpace: "pre-wrap",
          fontSize: "0.8125rem",
          minHeight: "6rem",
        }}
      >
        {log.length === 0
          ? "(아직 실행하지 않음)"
          : log.map((l) => `${l.at}  ${l.text}`).join("\n")}
      </pre>
    </main>
  );
}
