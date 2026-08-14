# ADR-0004 — 데스크탑 OAuth 콜백은 루프백 서버로 받는다

- **상태**: 수용됨
- **날짜**: 2026-08-14
- **관련**: `docs/ARCHITECTURE.md` §8.3 · §12-6 · `docs/REQUIREMENTS.md` §10-6 · ADR-0001
- **근거 문서**: `docs/research/tauri-desktop-oauth-callback.md` (일차 출처 인용 40건)

## 맥락

데스크탑에서는 브라우저 리다이렉트를 그대로 쓸 수 없어 콜백을 앱으로 되돌릴 방법이 필요했다.
두 갈래가 있었다.

- **A. 커스텀 URL 스킴 딥링크** (`zknote://callback`)
- **B. 임시 루프백 HTTP 서버** (`http://127.0.0.1:<port>/callback`)

§8.3 은 "우선 패턴 A를 기본으로 PoC 진행"이라고 적어뒀다. 이 ADR 은 그 방향을 뒤집는다.

## 결정

**B — 루프백 서버로 받는다.** 커스텀 스킴은 쓰지 않는다.

## 근거

세 축이 독립적으로 같은 방향을 가리켰다.

1. **Tauri (결정적)** — 딥링크는 **macOS 에서 런타임 등록이 불가능**하고, 공식 문서가
   "deep links can only be tested on the bundled application, which must be installed in the
   `/Applications` directory" 라고 못박는다. macOS 우선 + 서명 생략(REQUIREMENTS §10-7) +
   `tauri dev` 언사인드 빌드로 굴리는 현재 개발 흐름과 정면으로 충돌한다. A 를 택하면 반복
   개발 루프가 "빌드 → dmg → /Applications 복사 → 테스트"가 된다. 루프백에는 이 요구가 없다.
2. **Google** — 데스크탑 앱에 루프백을 "recommended mechanism"으로 명시하고, 커스텀 스킴은
   "no longer supported due to the risk of app impersonation"이라고 쓴다. 루프백 폐기 논의는
   Android·Chrome·iOS 한정이며 데스크탑은 "will continue to be supported"다.
3. **RFC 8252** — §7.3 이 데스크탑 OS 를 루프백 대상으로 지목한다. §8.1 은 사설 스킴의 고유
   약점을 지적한다: 여러 앱이 같은 스킴을 등록할 수 있어 "indeterminate as to which app will
   receive the authorization code". 두 방식 모두 PKCE 는 필수다.

### 전제 하나가 틀렸다는 것도 밝혀졌다

Convex Auth 를 쓰면 Google 에 등록하는 클라이언트는 **Web application** 타입이고 redirect URI 는
`https://<deployment>.convex.site/api/auth/callback/google` 이다. 즉 스킴 대 루프백은 Google 이
보는 구간이 아니라 **Convex → 우리 앱**의 마지막 구간 문제다. 그 구간은 Convex Auth 가 둘 다
지원하지만(React Native 가 `exp://` 로 동작), 거기서 위 1번이 갈라서 루프백이 이긴다.

반대로 `convex/auth.ts` 의 Option A(Google Desktop 클라이언트 직접 연동)로 가면 Google 규칙이
직접 적용돼 **루프백 외 선택지가 없다.** 두 갈래 모두 루프백으로 수렴하므로, 이 결정은
auth Option A/B 결정을 기다릴 필요가 없다.

## 함께 확정되는 것

1. **WebView 안에서 Google 로그인 화면을 열지 않는다.** `@convex-dev/auth/react` 의 `signIn` 은
   비-React-Native 환경에서 `window.location.href` 로 현재 창을 이동시킨다. Tauri 는 macOS 에서
   WKWebView 를 쓰고, Google 은 이를 `disallowed_useragent` 로 거부한다("iOS and macOS developers
   may encounter this error when opening authorization requests in `WKWebView`"). RFC 8252 §8.12 도
   "native apps MUST NOT use embedded user-agents"다.
   → 데스크탑은 React Native 분기와 같은 **수동 흐름**을 쓴다: `signIn` 이 돌려준 URL 을
   시스템 브라우저로 열고(`@tauri-apps/plugin-opener`), 콜백으로 받은 `code` 로
   `signIn(provider, { code })` 를 다시 호출한다. `src/lib/platform/tauri.ts` 의
   `startOAuthFlow` 스텁이 채울 자리가 정확히 여기다.
2. **`callbacks.redirect` 재정의가 필수다.** Convex Auth 의 기본 구현은 `SITE_URL` 접두사
   매칭이라 임의 포트(`http://127.0.0.1:51004`)를 거부한다. `convex/auth.ts` 에서 "127.0.0.1 의
   임의 포트만 허용" 규칙을 직접 써야 한다. **여기가 open redirect 표면이므로 화이트리스트로만
   쓴다.**
3. **CSP 는 `http:` 를 열 필요가 없다.** 루프백 소켓은 Rust 가 소유하고 결과는 Tauri 이벤트로
   온다 — WebView 가 `http://127.0.0.1` 로 fetch 하지 않는다. 프론트엔드에서 직접 로컬 서버를
   fetch 하는 설계로 가지 말 것. (`ipc:` 항목은 별건으로 이미 추가했다.)
4. **스킴을 쓸 일이 생기면 `zknote` 가 아니다.** RFC 8252 §7.1 은 통제하는 도메인의 역순을
   요구하므로 `dev.zerokoo.zk-note` 여야 한다. 기존 문서의 `zknote://` 표기는 스펙 위반이었다.
5. **웹 빌드와 갈라지는 곳은 두 군데뿐이다** — 브라우저를 어떻게 여는가, `?code=` 를 어디서
   줍는가. 나머지(`signIn` 액션, 토큰 저장, 코드 교환)는 공유된다. `src/lib/platform` 의
   어댑터 경계와 정확히 일치한다.

## 알면서 받아들이는 위험

- **`tauri-plugin-oauth` 는 tauri-apps 공식 워크스페이스 밖의 개인 저장소다.** 유지보수 보증도
  보안 감사 자료도 찾지 못했다. 의존이 부담되면 `std::net::TcpListener` 30여 줄로 자체 구현할
  수 있다(플러그인 본체가 실제로 그 규모다). **채택 전에 이 판단을 한 번 더 할 것.**
- 그 플러그인은 **IPv4(`127.0.0.1`)에만 바인드**한다. RFC 8252 §7.3 의 "IPv4 와 IPv6 양쪽에
  바인드하라"는 권고를 충족하지 않는다. 실제 문제가 되는 환경이 있는지는 확인하지 못했다.
- **루프백이 방화벽에 막히는 경우가 있다.** Google 문서도 "Most, but not all, firewalls allow
  loopback communication"이라고만 쓴다. 빈도에 대한 일차 자료는 없다.
- **Convex Auth 는 beta 다.**

## 확인하지 못한 것

이 결정은 Tauri 의 macOS 제약(1번 근거)만으로도 성립하므로 아래가 미확인이어도 흔들리지 않는다.
다만 기록해 둔다.

- **Google 이 Desktop 클라이언트에서 커스텀 스킴을 지금도 받는지** 딱 잘라 말한 일차 문서를
  찾지 못했다. 같은 페이지 안에서 진술이 상충한다. 확실한 것은 콘솔이 Desktop 클라이언트에
  리다이렉트 URI 입력란을 주지 않는다는 것뿐이다.
- **macOS 가 `/Applications` 밖의 앱을 URL 스킴 핸들러로 등록하는지**에 대한 Apple 일차 문서
  없음. `/Applications` 요구는 Tauri 문서의 진술이다.
- **Convex 의 Tauri/데스크탑 네이티브 가이드는 존재하지 않는다.** Convex 관련 결론은 문서와
  `get-convex/convex-auth` 소스(v0.0.95)를 직접 읽어 도출했다.
- **인증 상태에서의 Convex WebSocket 동작은 여전히 미측정이다.** ADR-0001 은 미인증 연결만
  측정했다. 토큰 세팅 이후의 재연결·갱신은 이 결정과 별개로 확인이 필요하다.

## 이 결정을 뒤집어야 할 신호

- 루프백이 막히는 사용자 환경이 실제로 보고되는 경우.
- macOS 를 벗어나 Windows·Linux 만 남는 경우 — 딥링크의 결정적 제약(1번 근거)이 macOS 고유라
  전제가 사라진다. 그래도 Google·RFC 축은 남는다.
- Tauri 가 macOS 런타임 딥링크 등록을 지원하게 되는 경우.
