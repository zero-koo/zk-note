# ADR-0001 — Convex 실시간 구독을 Tauri WebView에서 그대로 사용한다

- **상태**: 수용됨 (Accepted)
- **날짜**: 2026-08-14
- **관련**: `docs/ARCHITECTURE.md` §9(오프라인 전략), §12-7, §13-1 / `docs/REQUIREMENTS.md` §10-8

## 맥락

"Convex 단일 소스 + 데스크탑 1순위" 전략 전체가 하나의 검증되지 않은 가정 위에 서 있었다 —
**Convex React Client 의 WebSocket 이 Tauri WebView 안에서 연결되고 유지되는가.**

데스크탑 빌드에서 WebView 는 `tauri://localhost` 라는 custom protocol origin 으로 페이지를
띄우고, `tauri.conf.json` 의 CSP 가 적용된다. 일반 브라우저와 다른 두 축이라, 다음이 모두
이 답에 종속돼 있었다: Convex 스키마 설계, 인증 흐름, 오프라인 전략, 마크다운 직렬화 방식.
실패하면 백엔드 선택 자체를 다시 해야 했다.

## 결정

**Convex 를 데스크탑에서도 그대로 쓴다.** 별도의 프록시 계층, IPC 우회, HTTP 폴백을 두지
않는다. `tauri.conf.json` 의 CSP 도 현행 유지한다.

## 근거 — 실측

버려질 프로토타입(`prototype-convex-ws` 라우트 + `prototype_tauri_ws` 함수)을 만들어
`tauri build --debug --no-bundle` 로 빌드한 실제 바이너리에서 측정했다.

| 항목 | 결과 |
|---|---|
| origin | `tauri://localhost` (custom protocol — 위험 재현됨) |
| 배포 | cloud (`https://…convex.cloud` → `wss:`) |
| 최초 연결 | 마운트 후 **0.7초** |
| 안정성 | `connectionCount=1`, `connectionRetries=0` 이 **약 4분간 변화 없음** |
| 트래픽 | 그동안 10초 주기 mutation 왕복 약 24회, 실패 0 |
| CSP | `connect-src 'self' wss: https:` 로 충분 — 수정 불필요 |

교차 검증으로 Convex sync 엔드포인트에 직접 WebSocket 핸드셰이크를 걸었다.
`tauri://localhost`, `http://tauri.localhost`(Windows 쪽 origin), `http://localhost:3000`,
Origin 헤더 없음 — **네 경우 모두 `101 Switching Protocols`**. Convex 는 핸드셰이크에서
Origin 을 검사하지 않으므로, 서버가 데스크탑 origin 을 거부할 위험은 없다.

## 결과

- `ARCHITECTURE.md` §12-7 과 `REQUIREMENTS.md` §10-8 의 미결 항목이 닫힌다.
- MVP 구현이 이 결정에 막히지 않는다. 남은 선결 과제는 **노트 source of truth A/B**
  (§10.1) 하나뿐이다.
- Windows 는 origin 이 `http://tauri.localhost` 로 다르지만 핸드셰이크 검증은 통과했다.
  실제 Windows 빌드에서의 확인은 크로스플랫폼 빌드 검증 시점으로 미룬다.

## 이 결정을 뒤집어야 할 신호

- Convex 클라이언트나 Tauri 메이저 업그레이드 후 `connectionCount` 가 계속 오르는 경우
  (붙긴 하는데 유지가 안 되는 패턴 — 겉보기엔 동작해서 놓치기 쉽다).
- 인증 토큰이 붙은 뒤 동작이 달라지는 경우. 이번 측정은 **미인증 상태**로만 했다.
- Windows/Linux 빌드에서 재현되지 않는 경우.

## 검증하며 같이 확인된 함정 (재측정할 때 반드시 지킬 것)

1. **`pnpm tauri dev` 로는 재현되지 않는다.** `devUrl` 이 `http://localhost:3000` 이라
   dev WebView 는 평범한 http origin 을 쓰고 CSP 도 적용되지 않는다. 빌드된 바이너리로만
   확인할 수 있다.
2. **local(anonymous) Convex 배포로 테스트하면 가짜 실패가 난다.** `ws://127.0.0.1:3210` 은
   CSP 의 `connect-src`(`wss:` 만 허용)에 막힌다. cloud 배포로 측정할 것.
3. **`lsof` 로는 WKWebView 의 소켓이 보이지 않는다.** 앱 프로세스에도 WebKit Networking
   XPC 프로세스에도 잡히지 않아 이번에 한참 "연결 실패"로 오판했다. WebView 내부 상태는
   **페이지가 스스로 보고하게** 만들어야 한다.
4. 패키징된 앱에서 **React error #418**(하이드레이션 HTML 불일치)이 관측됐다. 프로토타입의
   클라이언트 전용 가드 때문이라 이 측정에는 무해했지만, SPA 모드에서 서버 셸과 클라이언트
   첫 렌더가 어긋나면 반복될 패턴이라 실제 화면 구현 때 별도로 다뤄야 한다.
