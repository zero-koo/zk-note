# ADR-0006 — 자동 업데이트는 GitHub Releases 로 보낸다

- **상태**: 수용됨
- **날짜**: 2026-08-15
- **관련**: `docs/ARCHITECTURE.md` §12-8 · §12-9 · §6.6 · `docs/REQUIREMENTS.md` §9 · §10-7 · `.github/workflows/release.yml` · `src-tauri/tauri.conf.json`
- **근거**: 지도 [#15](https://github.com/zero-koo/zk-note/issues/15) 의 티켓 #16–#21. 각 티켓의 해결 코멘트에 측정 원문이 있다

## 맥락

§12-8 이 manifest 호스팅 위치를 미결로 남겨 뒀다 — Convex Storage / GitHub Releases / 별도 정적
호스팅. 그런데 호스팅만 정해서는 채널이 서지 않는다. 서명 키를 어디에 두는지, 버전의 source of
truth 가 무엇인지, 앱이 언제 확인하고 어떻게 적용하는지, 그리고 **서명·공증 없이 자가 업데이트가
애초에 가능한지**가 전부 얽혀 있었다.

마지막 항목이 나머지를 지배했다. 안 되면 §12-9 가 "개인 사용 단계에서는 생략"으로 미뤄둔 유료
공증($99/년)이 전제조건으로 올라오고 다른 결정이 전부 무의미해지기 때문이다. 그래서 먼저 쟀다.

## 결정

**GitHub Releases 를 채널로 쓴다.** 태그 push 가 릴리스를 만들고, 앱은 고정 URL 하나를 본다.

```
pnpm version patch --message "chore: 버전 %s"
git push --follow-tags
        ↓
.github/workflows/release.yml (macos-latest, aarch64-apple-darwin)
        ↓
Release: ZK-Note_aarch64.app.tar.gz + .sig + latest.json
        ↓
https://github.com/zero-koo/zk-note/releases/latest/download/latest.json
```

함께 확정되는 다섯:

| 축 | 결정 |
|---|---|
| 호스팅 | GitHub Releases |
| 버전 SSOT | 루트 `package.json`. `tauri.conf.json` 이 `"version": "../package.json"` 으로 따라온다 |
| 서명 키 | minisign. 개인키는 `~/.tauri/zk-note.key`(scrypt 암호화), 패스워드는 macOS 키체인, CI 사본은 GH Secret |
| 확인·적용 UX | 앱 시작 시 1회 확인 → 발견하면 알리고 **사용자가 수락해야** 설치·재시작 → 실패는 조용히 |
| 대상 | `darwin-aarch64` 하나. Intel·Windows·Linux 는 이 결정의 범위 밖 |

## 근거

### 호스팅 — 원자성이 갈랐다

편의가 아니라 **아티팩트와 manifest 가 같은 릴리스에 함께 올라간다**는 점이 결정적이었다.
manifest 가 가리키는 파일이 그 릴리스 안에 있으므로 둘이 어긋날 여지가 구조적으로 없다.

- **Convex Storage** — 배포조차 되지 않은 상태였고, 채널을 앱의 백엔드에 묶으면 "업데이트는
  데이터·인증과 무관한 독립 인프라"라는 전제가 깨진다. 업로드 스텝도 직접 지어야 한다.
- **별도 정적 호스팅** — 운영할 인프라가 하나 늘어나는데 본인 기기 전용 규모에서 정당화가 안 되고,
  아티팩트와 manifest 가 갈라져 어긋날 자리가 생긴다.

`tauri-action` 이 빌드·서명·`latest.json` 생성·업로드를 한 번에 처리해 새로 지을 것이 0 이라는
점은 부차적 이유다.

### 버전 SSOT — `pnpm version` 이 태그까지 만든다

`package.json` 을 고른 이유는 `pnpm version patch` 가 **버전 갱신·커밋·`v0.1.1` 태그를 한 명령으로**
처리하기 때문이다. 태그가 `package.json` 에서 파생되므로 둘이 어긋날 수 없다. 나머지 두 후보
(`tauri.conf.json` 에 문자열 직접 기입, `Cargo.toml`)는 파일을 손으로 고치고 태그를 따로 달아야 해서
어긋남이 남는다.

`Cargo.toml` 의 `version` 은 필수 필드라 지울 수 없지만 `CARGO_PKG_VERSION` 을 읽는 코드가 **0곳**이라
`0.1.0` 에 고정하고 주석으로 못 박았다. **빌드 로그의 `Compiling zk-note v0.1.0` 은 앱 버전이 아니다.**

### UX — 노트 편집기라서 무음 재시작을 못 한다

업데이트 적용은 프로세스를 교체한다. §9.1 의 "미동기 버퍼 로컬 보존" 안전망이 아직 구현되지 않은
상태라, 알리지 않은 재시작은 편집 중이던 내용을 그대로 날린다. 그래서 **발견은 자동, 적용은 수락 후**다.

주기적 폴링은 두지 않는다 — 오래 띄워두는 앱일수록 확인이 방해가 되고, 개인용 데스크탑 앱에서
시작 시 1회로 충분하다. 확인 실패(오프라인·엔드포인트 도달 실패)는 사용자가 할 수 있는 일이 없고
다음 실행 때 재시도되므로 로그만 남긴다.

## 서명·공증 없이 동작한다 (실측)

**`0.1.1` 설치본이 실제 GitHub Releases 엔드포인트로 `0.1.2` 를 받아 자신을 교체하고 재시작했다.**

| 항목 | 값 |
|---|---|
| 번들 교체 시각 | `00:40:14` |
| 프로세스 시작 시각 | `00:40:14` — 같은 초 |
| 버전 | `0.1.1` → `0.1.2` |
| 서명 | `adhoc`, `TeamIdentifier=not set` |
| 환경 | macOS 26.5.1, Apple Silicon, Gatekeeper `assessments enabled`, 개발자 모드 disabled |

**"서명 없음"은 Apple Silicon 에서 존재할 수 없는 상태다.** arm64 macOS 는 서명 없는 바이너리를
실행하지 않으므로 툴체인이 빌드 시 ad-hoc 서명(`adhoc, linker-signed`)을 자동으로 붙인다. 따라서
이 질문은 실질적으로 "Apple Developer ID 서명·공증 없이 되는가"였고, 답은 된다.

**왜 Gatekeeper 에 안 막히나.** `spctl` 은 이 번들을 거부한다. 그런데도 실행된다 — Gatekeeper 차단은
`com.apple.quarantine` 이 붙은 번들에 걸리는데, updater 는 Rust 파일 I/O 로 번들을 쓰므로 quarantine 이
붙지 않는다. **자가 업데이트 경로는 구조적으로 Gatekeeper 를 지나간다.**

> **참조 구현**: 프로토타입은 폐기됐다. 커밋 `52fcf88` 의
> `src/routes/updater-probe.tsx` 에 `check()` → `downloadAndInstall()` → `relaunch()` 를 손으로
> 태우는 프로브가, `src/lib/updater/prototype-unsigned-update/NOTES.md` 에 로컬 서버로 채널을
> 흉내내는 실행 절차가 남아 있다 (`git show` 로 회수). 실제 기능(`checkForUpdate` +
> `UpdatePrompt`)이 같은 일을 하므로 프로브는 중복이 됐다.
>
> 로컬 재현 시 주의: updater 는 `http://` 엔드포인트를 **거부하고 그 거부가 앱 시작 시 패닉으로
> 나타난다**(창이 아예 안 뜸). `dangerousInsecureTransportProtocol: true` 가 필요하다 —
> 프로덕션은 HTTPS 라 해당 없다.

## 알면서 받아들이는 위험

- **첫 설치는 브라우저로 받으면 막힌다.** quarantine 이 붙은 미공증 앱은 실행되지 않고 macOS 가
  번들을 휴지통으로 옮긴다. `codesign --force --deep --sign -` 으로 ad-hoc 서명을 제대로 다시 붙여도
  (서명 자체는 고쳐진다 — `Sealed Resources version=2`) 결과는 같다. **그래서 첫 설치는 터미널 경로로
  안내한다** — `tar` 추출은 quarantine 을 붙이지 않는다:

  ```sh
  gh release download v0.1.2 --pattern '*.app.tar.gz'
  tar -xzf ZK-Note_aarch64.app.tar.gz
  cp -R ZK-Note.app /Applications/
  ```

- **서명 개인키를 잃으면 이미 설치된 앱에 영원히 업데이트를 보낼 수 없다.** 설치본은
  `tauri.conf.json` 에 박힌 공개키로 `.sig` 를 검증하므로 새 키로 서명한 업데이트는 거부된다. 복구는
  수동 재설치뿐이다. **GitHub Secret 은 write-only 라 백업이 아니다** — 실질 정본은
  `~/.tauri/zk-note.key` 와 키체인 항목 둘뿐이고 백업은 Time Machine 에 의존한다.

- **`bundle.targets` 를 `["app"]` 으로 좁혔다.** `"all"` 은 DMG 번들링이 실패할 때 그 실패가 updater
  산출물 생성까지 중단시켜 `.app.tar.gz` 와 `.sig` 가 **아예 안 나온다.** 로컬에서 `create-dmg` 가 죽어
  겪었다. 그 대가로 배포물이 `.app.tar.gz` 뿐이다.

- **`releases/latest` 는 draft 와 prerelease 를 건너뛴다.** `tauri-action` 기본이 draft 이므로
  `releaseDraft: false` 가 필수다. 빠뜨리면 태그를 밀어도 설치본이 새 버전을 영영 못 보고,
  **에러 없이 조용히 실패한다.**

## 확인하지 못한 것

- **Finder 더블클릭 시 사용자에게 탈출구가 있는지.** quarantine 실험은 `open` 으로만 했다.
  대화상자가 뜨고 시스템 설정에서 "그래도 열기" 로 빠져나갈 수 있는지는 확인하지 않았다. 다만 그건
  사용자 개입이 필요하다는 뜻이라 위 결론(브라우저 경유 첫 설치가 매끄럽지 않다)은 바뀌지 않는다.
- **CI 에서 DMG 가 도는지.** 로컬 실패만 확인했다.
- **업데이트 실패·중단 시 롤백 동작.** 정상 경로만 쟀다.
- **Intel macOS · Windows · Linux.** 범위 밖이라 재지 않았다.

## 이 결정을 뒤집어야 할 신호

- **브라우저로 첫 설치를 하게 되는 경우** — 지금은 터미널 경로로 안내한다. 이걸 바꾸고 싶어지면
  범위 밖으로 둔 공증이 되살아난다. §12-9 가 그 자리다.
- **배포 범위가 본인 기기를 넘어가는 경우** — 서명·공증뿐 아니라 "누가 설치했는지", "강제 업데이트"
  같은 요구가 따라붙는다.
- **Intel macOS · Windows · Linux 로 채널을 넓히는 경우** — manifest 는 platform 키 추가로 끝나지만
  각 플랫폼의 서명 요구가 다르다.
- **레포가 private 으로 바뀌는 경우** — 인증 없이 받히는 전제가 깨져 호스팅 결정이 흔들린다.
