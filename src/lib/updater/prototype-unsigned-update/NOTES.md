# 프로토타입 — 서명 없는 앱의 자가 업데이트

## 답하려는 질문

**Apple 코드 서명·공증 없이 만든 `.app` 이 자기 자신을 새 버전으로 교체하고, 그 교체된
번들이 실제로 실행되는가?**

macOS 는 Gatekeeper·quarantine·번들 무결성 검사가 겹겹이 있고 Tauri updater 는 `.app`
번들을 통째로 갈아끼운다. 여기서 막히면 [지도](https://github.com/zero-koo/zk-note/issues/15)가
Out of scope 로 못 박아둔 유료 공증($99/년)이 목적지의 전제조건으로 올라오고, 지금까지
내린 결정 넷이 전부 다시 검토 대상이 된다.

**다운로드 성공이 아니라 실행 성공이 관문이다.** 받아서 설치까지 되고 나서 앱이 안 뜨는
것이 가장 그럴듯한 실패 모양이다.

## 범위

| 범위 안 | 범위 밖 |
|---|---|
| 서명 전혀 없이 | Apple Developer ID 서명 |
| ad-hoc 서명 (`codesign --sign -`) | notarytool 공증 |
| `com.apple.quarantine` 수동 제거 | |

## 실행

이 프로토타입은 호스팅·CI 를 기다리지 않고 **로컬 임시 서버**로 돈다. GitHub Releases 도
GitHub Actions 도 필요 없다 — Gatekeeper 리스크만 떼어내 가장 싸게 확인하는 것이 목적이다.

```sh
# 0) 서명 키를 환경에 올린다 (티켓 #16 에서 만든 것)
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/zk-note.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(security find-generic-password \
  -a zk-note -s 'zk-note tauri updater signing key password' -w)"

# 1) 0.1.0 을 빌드해 /Applications 에 설치하고 실행
pnpm tauri build

# 2) 0.1.1 로 올려 다시 빌드
pnpm version patch --no-git-tag-version
pnpm tauri build

# 3) 0.1.1 산출물과 latest.json 을 로컬 서버로 서빙 (포트 8787)
#    tauri.conf.json 의 endpoints 가 http://localhost:8787/latest.json 을 본다

# 4) 설치된 0.1.0 을 실행 → 첫 화면의 "업데이트 확인·설치" 를 누른다
```

### 임시 변경 (실험이 끝나면 되돌린다)

- `src/routes/index.tsx` — `/` 가 `/daily` 대신 `/updater-probe` 로 간다
- `src-tauri/tauri.conf.json` — `plugins.updater.endpoints` 가 localhost 를 본다

되돌린 뒤에도 프로브 자체(`src/routes/updater-probe.tsx`)는 남는다. 다시 돌리려면 위 두
곳만 임시로 바꾸면 된다.

## 프로브가 하는 일

`src/routes/updater-probe.tsx` 는 실행 중인 버전을 보여주고, 버튼 하나로
`check()` → `downloadAndInstall()` → `relaunch()` 를 순서대로 태우며 각 단계를 로그로 남긴다.
로그는 콘솔에도 미러링한다 — 재시작이 UI 를 날려버려도 기록이 남게.

`PlatformAdapter.checkForUpdate()` 를 거치지 않고 플러그인을 직접 부른다. 어댑터 구현은
[#21](https://github.com/zero-koo/zk-note/issues/21) 몫이고, 이 프로브가 답하려는 건 seam 이
아니라 Gatekeeper 다.

덤으로 하나 더 확인한다 — 프로브가 표시하는 버전은 Tauri 가 번들에 구운 값이므로,
[#18](https://github.com/zero-koo/zk-note/issues/18) 이 미확인으로 남긴
**`"version": "../package.json"` 이 빌드 시 실제로 해석되는가**가 여기서 눈으로 확인된다.

## 결과

> **된다 (2026-08-15).** `0.1.0` 이 `0.1.1` 을 받아 자신을 교체하고, 교체된 번들이 실행됐다.
> Apple Developer ID 서명도 공증도 없이. 측정 환경: macOS 26.5.1, Apple Silicon,
> Gatekeeper `assessments enabled`, 개발자 모드 disabled.

### 증거

| 항목 | 값 |
|---|---|
| 번들 교체 시각 | `23:22:54` |
| 프로세스 시작 시각 | `23:22:54` — 같은 초에 재시작 |
| 실행 경로 | `/Applications/ZK-Note.app/Contents/MacOS/zk-note` |
| 교체 후 버전 | **0.1.1** (교체 전 0.1.0) |
| 서버 로그 | `GET /latest.json` → `GET /ZK-Note.app.tar.gz` → 재시작 후 `GET /latest.json` |

재시작 후 프로브를 다시 눌렀을 때 "업데이트 없음"이 나온 것도 정상 동작의 일부다 —
0.1.1 이 0.1.1 manifest 를 보고 새 게 없다고 답한 것이다.

### 서명은 "없음"이 아니라 "ad-hoc"이다

Apple Silicon 은 서명 없는 바이너리를 아예 실행하지 않기 때문에, 툴체인이 빌드 시
**ad-hoc 서명**을 자동으로 붙인다:

```
CodeDirectory ... flags=0x20002(adhoc,linker-signed)
Signature=adhoc
TeamIdentifier=not set
```

즉 arm64 에서 "서명 전혀 없음"이라는 상태는 애초에 존재하지 않는다. 이 티켓의 질문은
실질적으로 **"Apple Developer ID 서명·공증 없이 되는가"** 였고, 답은 된다.

### 왜 Gatekeeper 에 안 막히나

`spctl` 은 이 번들을 **거부한다**:

```
/Applications/ZK-Note.app: code has no resources but signature indicates they must be present
```

그런데도 실행된다. Gatekeeper 의 차단은 `com.apple.quarantine` 이 붙은 번들에 걸리는데,
updater 는 Rust 파일 I/O 로 번들을 쓰므로 quarantine 이 붙지 않는다. **자가 업데이트 경로는
구조적으로 Gatekeeper 를 지나간다.**

### 한계 — 확인하지 못한 것

- **첫 설치 경로는 이 실험이 제대로 검증하지 못했다.** 여기서는 `cp` 로 설치해 quarantine 이
  애초에 없었다. 브라우저로 받으면 quarantine 이 붙는다. 이를 흉내내 `xattr -w
  com.apple.quarantine` 을 붙이고 캐시 없는 새 경로에서 실행해 봤을 때도 떴지만,
  **Finder 더블클릭이 `open` 과 같게 동작하는지는 확인하지 않았다.** 실제 배포 시 첫 실행에서
  경고 대화상자가 뜰 가능성은 남아 있다
- Intel macOS, Windows, Linux 는 범위 밖이라 확인하지 않았다
- 업데이트 실패·중단 시의 롤백 동작은 확인하지 않았다

### 곁가지로 확인된 것들

1. **`"version": "../package.json"` 이 빌드 시 실제로 해석된다.** `package.json` 만 `0.1.1` 로
   올리고 `Cargo.toml` 은 `0.1.0` 에 둔 채 빌드했더니 앱이 `0.1.1` 로 나왔다
   (Cargo 로그는 `Compiling zk-note v0.1.0`). [#18](https://github.com/zero-koo/zk-note/issues/18)
   이 미확인으로 남긴 항목이 해소됐다
2. **updater 는 `http://` 엔드포인트를 거부하고 앱을 시작 시 패닉시킨다.**
   `PluginInitialization("updater", "...must use a secure protocol like https")` 로 창이 아예
   뜨지 않는다. 로컬 실측에는 `dangerousInsecureTransportProtocol: true` 가 필수다
   (프로덕션은 HTTPS 라 해당 없음)
3. **`bundle.targets: "all"` 은 DMG 단계에서 실패하고, 그 실패가 updater 산출물 생성까지
   중단시킨다.** `create-dmg` 가 죽으면 `.app.tar.gz` 와 `.sig` 가 아예 안 나온다.
   `["app"]` 으로 좁혀 해결했다
4. **`pnpm version` 은 워킹 트리가 더러우면 거부한다** (`ERR_PNPM_UNCLEAN_WORKING_TREE`).
   #18 이 "안전장치로 유지한다"고 한 그 게이트다. 실험에서는 `--no-git-checks` 로 우회했다
