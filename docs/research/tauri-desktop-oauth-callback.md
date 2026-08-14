# 리서치 — Tauri 데스크탑 Google OAuth 콜백: `zknote://` vs `http://127.0.0.1:<port>`

- **날짜**: 2026-08-14
- **관련**: `docs/REQUIREMENTS.md` 미결 #6 / `docs/ARCHITECTURE.md` §8.3, §13 / `docs/adr/0001-convex-websocket-over-tauri-webview.md`
- **상태**: 조사 완료, 결정은 팀 몫 (아래 요약에 근거상 기울어진 방향 명시)

## 질문

Tauri 2.x 데스크탑 앱에서 Google OAuth 를 수행할 때, 인가 결과를 앱으로 되돌려 받는 경로를
**private-use URI scheme deep link(`zknote://`)** 로 할 것인가, **임시 loopback HTTP 서버
(`http://127.0.0.1:<port>`)** 로 할 것인가. 백엔드는 Convex(클라우드)다.

이걸 정하지 않으면 `convex/auth.ts` 의 Option A/B 선택, `src/lib/platform` 의
`startOAuthFlow` 구현, Google Cloud 클라이언트 타입 등록이 전부 멈춘다. 실제로 `convex/auth.ts`
헤더 주석이 "DECISION GATE: Tauri OAuth PoC" 로 이 결정을 명시적으로 기다리고 있다.

## 요약

**근거는 loopback(`http://127.0.0.1:<port>`) 쪽으로 명확히 기운다.** 세 축이 같은 방향을 가리킨다.

1. **Google** — Desktop 앱에 대해 loopback 을 "recommended mechanism" 으로 명시하고
   (`Recommended usage: macOS, Linux, and Windows desktop ... apps`), 커스텀 스킴에 대해서는
   "Custom URI schemes are no longer supported due to the risk of app impersonation" 이라고 쓴다.
   폐기된 OOB 플로우의 데스크탑 마이그레이션 대상도 loopback 이다. 반대로 loopback 폐기는
   Android/Chrome/iOS 한정이고 "will continue to be supported on desktop apps" 라고 못 박혀 있다.
2. **RFC 8252** — 데스크탑 OS 를 loopback 의 대상으로 지목(§7.3)하고, private-use scheme 은
   "multiple apps can typically register the same scheme, which makes it indeterminate as to which
   app will receive the authorization code"(§8.1) 라는 고유 약점을 지적한다. 두 방식 다 PKCE 필수.
3. **Tauri** — deep link 는 **macOS 에서 런타임 등록이 불가능**하고, 공식 문서가 "deep links can
   only be tested on the bundled application, which must be installed in the `/Applications`
   directory" 라고 못 박는다. macOS 우선 + `tauri dev` 언사인드 빌드로 굴리는 현재 개발 흐름과
   정면으로 충돌한다. loopback 은 번들·설치·서명과 무관하다.

**단, 질문의 전제를 하나 고쳐야 한다.** Convex Auth(`@convex-dev/auth`)를 쓰면 Google 에 등록하는
클라이언트는 **Web application** 타입이고 redirect URI 는
`https://<deployment>.convex.site/api/auth/callback/google` 이다. 즉 `zknote://` vs `127.0.0.1` 은
Google 이 보는 구간이 아니라 **Convex → 우리 앱** 의 마지막 구간(인증 코드가 아니라 Convex 의
verification code 를 전달하는 302) 문제다. 이 구간에서는 Convex Auth 가 커스텀 스킴을 실제로
지원한다(React Native 가 `exp://`/`myapp://` 로 동작). 따라서:

- **Convex Auth 경로(Option B)**: 프로토콜상 둘 다 가능. 결정은 Tauri/OS 쪽에서 갈리고, 거기서
  loopback 이 이긴다(macOS dev 에서 그냥 된다).
- **직접 연동 경로(Option A, 현재 `convex/auth.ts` 스텁)**: Google Desktop 클라이언트를 직접 쓰게
  되므로 Google 규칙이 그대로 적용돼 loopback 이 사실상 유일한 선택지가 된다.

두 갈래 모두 loopback 으로 수렴한다.

## 비교표

| 축 | A. `zknote://` deep link | B. `http://127.0.0.1:<port>` loopback |
| --- | --- | --- |
| **Google 지원 여부** | Convex Auth 경유 시 Google 은 이 스킴을 아예 보지 않음(무관). Google 클라이언트를 직접 쓸 때는 "no longer supported due to the risk of app impersonation", Desktop 클라이언트에는 리다이렉트 URI 입력란 자체가 없음 | Convex Auth 경유 시 무관. 직접 쓸 때는 Desktop 앱의 **권장·지원** 방식이며 OOB 마이그레이션 목적지 |
| **RFC 8252 입장** | §7.1 로 허용되지만 §8.1 에서 스킴 선점 문제 지적. 스킴은 통제하는 도메인의 역순이어야 함(`zknote` 는 이 요건 미충족 — `dev.zerokoo.zk-note` 형태여야 함) | §7.3 이 "desktop operating systems" 를 명시 대상으로 삼음. §8.3 은 `localhost` 대신 IP 리터럴(`127.0.0.1`) 사용을 권고 |
| **Convex Auth 적합성** | 지원됨. `setURLSearchParam` 이 비-http 스킴 전용 워크어라운드로 존재. `callbacks.redirect` 재정의 필요 | 지원됨. 임의 포트를 쓰므로 기본 `redirect` 콜백(SITE_URL prefix 매칭)으로는 통과 못 함 → `callbacks.redirect` 재정의 필요 |
| **macOS** | **런타임 등록 불가**. 번들 + `/Applications` 설치 필요. `tauri dev` 로 테스트 불가 | 제약 없음. `tauri dev` 에서 그대로 동작 |
| **Windows** | 설치된 앱에만 동작하나 `register_all()` 로 런타임 우회 가능 | 제약 없음 |
| **Linux** | 설치된 앱에만 동작하나 `register_all()` 로 우회 가능. AppImage 는 경로 이동 시 등록 무효화 | 제약 없음 |
| **서명·설치 요구사항** | macOS 에서 **설치된 앱 번들 필수**(서명 여부와 별개로 dev 빌드로는 검증 불가) | 없음 |
| **CSP 영향** | 없음(WebView 는 HTTP 를 안 탐). 단 Tauri IPC 이벤트를 쓰므로 `connect-src` 에 `ipc: http://ipc.localhost` 권장 | 없음. `tauri-plugin-oauth` 는 Rust 가 소켓을 소유하고 이벤트만 emit → WebView 가 `http://127.0.0.1` 로 fetch 하지 않음. IPC 항목은 동일 |
| **웹 빌드와 코드 공유** | 마지막 구간만 어댑터로 분기. 동일 | 마지막 구간만 어댑터로 분기. 동일 |
| **알려진 실패 모드** | 다른 앱이 같은 스킴 선점(§8.1) / macOS dev 검증 불가 / AppImage 경로 이동 / 사용자가 URL 을 CLI 인자로 위조 가능(Tauri 문서 Caution) | 다른 로컬 앱이 loopback 인터페이스에서 가로챌 수 있음(§8.1) / 방화벽이 loopback 을 막는 드문 경우 / 포트 바인딩 실패 |

## 옵션 A — `zknote://` private-use URI scheme

### 콜백이 앱으로 돌아오는 경로

1. 앱이 시스템 브라우저를 연다(`@tauri-apps/plugin-opener` 의 `openUrl`).
2. (Convex Auth 기준) 브라우저가 `https://<deployment>.convex.site/api/auth/signin/google?code=<verifier>&redirectTo=zknote://auth` 로 간다.
3. Convex 가 Google 로 리다이렉트 → 사용자가 동의 → Google 이
   `https://<deployment>.convex.site/api/auth/callback/google` 로 되돌린다.
4. Convex 가 코드를 교환하고 `302` 로 `Location: zknote://auth?code=<verificationCode>` 를 내려준다.
5. OS 가 등록된 스킴을 보고 앱을 깨우거나 포커스한다 → `tauri-plugin-deep-link` 의
   `onOpenUrl`/`get_current` 로 URL 이 프론트엔드에 도착 → `signIn(provider, { code })` 로 토큰 교환.

### 근거

- 스킴 이름 규칙: "apps MUST use a URI scheme based on a domain name under their control, expressed
  in reverse order ... A scheme such as `myapp`, however, would not meet this requirement"
  (RFC 8252 §7.1). `zknote://` 는 이 MUST 를 위반한다. 준수하려면 `dev.zerokoo.zk-note:/...`
  (식별자와 동일) 여야 한다.
- 고유 약점: "A limitation of using private-use URI schemes for redirect URIs is that multiple apps
  can typically register the same scheme, which makes it indeterminate as to which app will receive
  the authorization code."(RFC 8252 §8.1)
- Google 은 이 방식에 대해 "Important: Custom URI schemes are no longer supported due to the risk of
  app impersonation." 라고 쓴다. 같은 문서의 `redirect_uri` 파라미터 표에는 여전히 Custom URI
  scheme 항목이 남아 있고 거기 붙은 주석은 "no longer supported on Android and Chrome apps" 라
  범위가 다르다 — 문서 내부가 상충한다(→ 확인하지 못한 것 참조).
- Tauri 등록 메커니즘: `tauri.conf.json > plugins > deep-link > desktop > schemes` 에 넣으면
  `tauri-bundler` 가 macOS 앱 번들 `Info.plist` 에 `CFBundleURLTypes` / `CFBundleURLSchemes` 를
  써 넣는다(`crates/tauri-bundler/src/bundle/macos/app.rs`). 즉 **번들이 있어야만 등록된다**.
- macOS 런타임 등록은 소스 수준에서 막혀 있다. `plugins/deep-link/src/lib.rs` 의
  `register` / `register_all` / `is_registered` 는 "**macOS / Android / iOS**: Unsupported, will
  return `Error::UnsupportedPlatform`" 이다.
- 공식 문서 Caution: "Registering deep links at runtime is not possible on macOS, so deep links can
  only be tested on the bundled application, which must be installed in the `/Applications` directory."
- 위조 주의: "The user could trigger a fake deep link manually by including the URL as argument."
  (Tauri 문서). Linux/Windows 에서는 딥링크가 **새 프로세스의 커맨드라인 인자**로 전달되므로
  `tauri-plugin-single-instance` 의 `deep-link` feature 를 함께 써야 한다.

## 옵션 B — `http://127.0.0.1:<port>` 임시 loopback 서버

### 콜백이 앱으로 돌아오는 경로

1. Rust 쪽에서 `tauri_plugin_oauth::start()` 가 `127.0.0.1` 의 임시 포트에 TCP 리스너를 열고
   포트 번호를 반환한다(`TcpListener::bind(SocketAddr::from(([127,0,0,1], 0)))` — ephemeral port).
2. 앱이 시스템 브라우저를 열고 `redirectTo=http://127.0.0.1:<port>` 를 실어 보낸다.
3. Google → convex.site 콜백 → Convex 가 `302 Location: http://127.0.0.1:<port>/?code=...` 를 내린다.
4. 브라우저가 로컬 서버를 때리고, 플러그인이 핸들러 클로저로 URL 을 넘긴다 → Rust 가
   `window.emit("redirect_uri", url)` 로 프론트엔드에 전달 → 서버를 닫는다.
5. 프론트엔드가 `code` 를 뽑아 `signIn(provider, { code })` 로 토큰 교환.

### 근거

- RFC 8252 §7.3: "Native apps that are able to open a port on the loopback network interface without
  needing special permissions (typically, those on desktop operating systems) can use the loopback
  interface to receive the OAuth redirect." 그리고 인가 서버는 "MUST allow any port to be specified
  at the time of the request".
- RFC 8252 §8.3: `http` 평문이어도 "acceptable for loopback interface redirect URIs as the HTTP
  request never leaves the device". 포트는 요청 시작 시에만 열고 응답 후 닫을 것. `localhost` 대신
  IP 리터럴을 쓸 것("the use of localhost is NOT RECOMMENDED").
- Google: loopback 섹션 제목이 "Loopback IP address (macOS, Linux, Windows desktop)" 이고,
  "if your platform supports it, this is the recommended mechanism for obtaining the authorization
  code", "Recommended usage: macOS, Linux, and Windows desktop (but not Universal Windows Platform)
  apps", "Form values: Set the application type to **Desktop app**."
- Google loopback 폐기 공지는 데스크탑에 해당 없음: "You don't need to do anything related to this
  deprecation if you are using the loopback IP address flow on a Desktop app OAuth client as usage
  with that OAuth client type will continue to be supported."
- 폐기된 OOB 의 데스크탑 대체안이 바로 이것: "If you determine that your app is using the OOB flow on
  a desktop client, you should migrate to using the loopback IP address (`localhost` or `127.0.0.1`) flow."
- 플러그인 상태: `tauri-plugin-oauth` 는 **tauri-apps 공식이 아닌 커뮤니티 플러그인**(FabianLars).
  crates.io `2.1.0`(2026-07-07), npm `@fabianlars/tauri-plugin-oauth@2.1.0`, MIT/Apache-2.0,
  `tauri = "2"` 의존. 기본 브랜치는 `v2`.
- 플러그인 자체 보안 주의: "Because of the unprotected localhost port, you _must_ verify the URL in
  the handler function." — RFC 8252 §8.1 의 "Loopback IP-based redirect URIs may be susceptible to
  interception by other apps accessing the same loopback interface" 와 같은 이야기다. `state` 검증과
  PKCE 로 막는다.

## 이 레포에 걸리는 지점

### 1. WebView 안에서 Google 로그인 화면을 절대 열면 안 된다 (두 옵션 공통, 최우선)

`@convex-dev/auth/react` 의 `signIn` 은 리다이렉트 URL 을 받으면 **현재 창을 그대로 이동**시킨다:

```ts
// convex-auth/src/react/client.tsx
if (navigator.product !== "ReactNative") {
  window.location.href = url.toString();
}
```

Tauri WebView 는 React Native 가 아니므로 이 분기를 탄다 → 앱 창이 `accounts.google.com` 으로 간다.
Tauri 는 wry 를 통해 macOS 에서 WebKit(WKWebView)을 쓰고, Google 문서는 `disallowed_useragent` 에 대해
"iOS and macOS developers may encounter this error when opening authorization requests in `WKWebView`"
라고 명시한다. 정책 문서도 "A developer must not direct a Google OAuth 2.0 authorization request to an
embedded user-agent under the developer's control", RFC 8252 §8.12 도 "native apps MUST NOT use
embedded user-agents" 다.

→ 데스크탑 구현은 **React Native 분기와 같은 수동 흐름**이어야 한다: `signIn` 이 돌려주는 `redirect`
URL 을 `@tauri-apps/plugin-opener` 의 `openUrl` 로 시스템 브라우저에 넘기고, 콜백으로 받은 `code` 로
`signIn(provider, { code })` 를 다시 호출. `src/lib/platform/tauri.ts` 의 `startOAuthFlow` 스텁이
채워야 할 자리가 정확히 여기다.

### 2. `callbacks.redirect` 재정의가 필수 (옵션 B 에서 특히)

Convex Auth 의 기본 redirect 콜백은 `SITE_URL` prefix 매칭이다:

```ts
// convex-auth/src/server/implementation/redirects.ts
if (redirectTo.startsWith(baseUrl)) {
  const after = redirectTo[baseUrl.length];
  if (after === undefined || after === "?" || after === "/") return redirectTo;
}
throw new Error(`Invalid \`redirectTo\` ... for configured SITE_URL: ...`);
```

`SITE_URL=http://127.0.0.1` 로 두어도 `http://127.0.0.1:51004` 는 `after === ":"` 라 거부된다. 임의
포트를 쓰는 이상 `convex/auth.ts` 에 `callbacks.redirect` 를 직접 구현해 "127.0.0.1 의 임의 포트만
허용" 규칙을 써야 한다. 웹 빌드(Phase 2)와 공존하려면 웹 origin 도 같이 허용한다 — Convex Auth 문서가
바로 이 패턴을 예시로 준다("If you need to support multiple `redirectTo` URL schemes or origins, you
must override the `redirect` callback"). **여기가 open redirect 표면**이므로 화이트리스트로만 쓴다.

### 3. CSP — `connect-src` 에 `http:` 를 추가할 필요는 없다. 다만 `ipc:` 는 빠져 있다

현재 `src-tauri/tauri.conf.json`:

```
default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' wss: https:; img-src 'self' data: https: blob:
```

- 옵션 B 에서 `http://127.0.0.1` 을 **WebView 가 fetch 하지 않는다**. 소켓은 Rust 가 소유하고
  결과는 Tauri 이벤트로 온다. 따라서 `connect-src` 에 `http:` 를 여는 CSP 완화는 **불필요**하다.
  (프론트엔드에서 직접 로컬 서버를 fetch 하는 설계로 가면 그때는 필요해진다 — 그렇게 하지 말 것.)
- 대신 두 옵션 모두 Tauri IPC 를 탄다. Tauri 의 IPC 는 `fetch(convertFileSrc(cmd, 'ipc'))` 로
  `ipc://localhost`(macOS/Linux) 또는 `http://ipc.localhost`(Windows)를 호출하고, CSP 에 막히면
  콘솔 경고 후 `postMessage` 로 폴백한다(`crates/tauri/scripts/ipc-protocol.js`:
  "IPC custom protocol failed, Tauri will now use the postMessage interface instead"). 즉 지금
  CSP 로도 동작은 하지만 폴백 경로다. Tauri 공식 예제 CSP 는 `"connect-src": "ipc: http://ipc.localhost"`
  를 포함한다 → OAuth 작업과 함께 이 항목을 추가하는 것이 맞다.

### 4. macOS 우선 + 서명 생략 ⇒ 옵션 A 는 지금 검증 자체가 불가능

`docs/REQUIREMENTS.md` #7 이 코드 서명·공증을 "개인 사용 단계에서는 생략 가능" 으로 미뤄뒀고, 팀은
언사인드 dev 빌드를 돌린다. 옵션 A 는 서명 이전에 **번들 + `/Applications` 설치**를 요구한다
(Tauri 문서). `pnpm tauri dev` 로는 `zknote://` 가 OS 에 등록되지 않는다. 반복 개발 루프가
"빌드 → dmg → /Applications 복사 → 테스트" 가 된다. 이건 결정적 마찰이다. 옵션 B 에는 이 요구가 없다.

### 5. 스킴 이름을 고른다면 `zknote` 가 아니다

`src-tauri/tauri.conf.json` 의 `identifier` 는 `dev.zerokoo.zk-note` 다. RFC 8252 §7.1 을 지키려면
스킴은 이 역순 도메인 그대로여야 한다. `zknote://` 는 스펙 위반이고 충돌 위험도 더 크다.

### 6. ADR-0001 과의 관계 — 새 네트워크 경로는 생기지 않는다

두 옵션 모두 **토큰이 Convex WebSocket 을 통해 들어온다**. 마지막 `signIn(provider, { code })` 는
Convex action 호출(`client.authenticatedCall("auth:signIn", ...)`)이고, 반환된 토큰이
`ConvexReactClient` 에 세팅된다. 즉 ADR-0001 의 "Convex 를 데스크탑에서 그대로 쓴다" 결정은 흔들리지
않는다. 다만 ADR-0001 은 **미인증 상태만 측정**했으므로, `setAuth` 이후의 재연결·토큰 갱신 동작은
여전히 미검증이다(→ 확인하지 못한 것).

### 7. 웹 빌드와의 코드 공유

Convex Auth 를 쓰면 웹/데스크탑이 `signIn` 액션, 토큰 저장(localStorage), 코드 교환 로직을 전부
공유한다. 갈라지는 부분은 두 곳뿐이다: (a) 브라우저를 어떻게 여는가, (b) `?code=` 를 어디서 줍는가.
웹은 `ConvexAuthProvider` 가 `window.location.search` 에서 자동으로 줍고(`client.tsx`), 데스크탑은
플러그인 이벤트에서 줍는다. `src/lib/platform` 의 `startOAuthFlow` 어댑터 경계와 정확히 일치한다.
옵션 A/B 어느 쪽도 이 구조를 바꾸지 않는다.

### 8. `convex/auth.ts` 의 Option A/B 미결과의 상호작용

현재 스텁은 Option A(직접 `ctx.auth.getUserIdentity()` + 커스텀 `users` 테이블)다. Option A 로 가면
Google 클라이언트를 **Desktop app 타입으로 직접** 만들어야 하고, 그 순간 Google 규칙이 직접
적용된다 — Google Cloud 콘솔은 Desktop 클라이언트에 리다이렉트 URI 입력을 받지 않고("The console
does not require any additional information to create OAuth 2.0 credentials for desktop
applications"), 커스텀 스킴은 "no longer supported" 로 쓰여 있다. 즉 **Option A 를 택하면 loopback
말고 선택지가 없다.** Option B 를 택해도 위 이유로 loopback 이 유리하다. 콜백 방식 결정이
Option A/B 결정을 기다릴 필요는 없다.

## 확인하지 못한 것

- **Google 이 Desktop app 클라이언트에서 커스텀 스킴을 지금도 받는지**를 딱 잘라 말한 1차 문서를
  찾지 못했다. 같은 페이지 안에서 진술이 상충한다 — `redirect_uri` 파라미터 표에는 Custom URI
  scheme 항목이 남아 있고 주석은 "no longer supported on **Android and Chrome apps**" 인데,
  "App redirect methods" 섹션은 조건 없이 "Custom URI schemes are no longer supported due to the
  risk of app impersonation" 이라고 쓴다. 확실한 것은 (a) 콘솔이 Desktop 클라이언트에 리다이렉트
  URI 입력란을 주지 않는다는 것, (b) 커스텀 스킴 섹션에는 loopback 섹션과 달리 데스크탑 대상
  "Recommended usage" 가 없다는 것뿐이다. **실제로 시도해서 확인해야 할 항목이다.**
- **macOS 가 앱을 `/Applications` 밖에서도 URL 스킴 핸들러로 등록하는지**에 대한 Apple 1차 문서를
  찾지 못했다. `/Applications` 요구는 Tauri 문서의 진술이다. Apple 쪽에서 확인한 것은
  `CFBundleURLTypes` 가 Info.plist 키("A list of URL schemes (http, ftp, and so on) supported by
  the app")라는 사실, 즉 등록에 앱 번들이 필요하다는 것까지다.
- **서명·공증 없이(ad-hoc 서명 포함) macOS Launch Services 가 스킴 등록을 해 주는지**에 대한 1차
  문서 없음. 옵션 A 를 고려한다면 실측이 필요하다.
- **Convex 의 Tauri/데스크탑 네이티브 가이드는 존재하지 않는다.** Convex Auth 문서의 네이티브
  가이드는 React Native(Expo) 하나뿐이고, `docs.convex.dev` 에서도 Tauri 언급을 찾지 못했다.
  이 문서의 Convex 관련 결론은 문서 + `get-convex/convex-auth` 소스(커밋 `b58a384`, v0.0.95)를
  직접 읽어 도출한 것이다.
- **Convex Auth 는 beta 다** — 문서 첫 페이지에 "NOTE: Convex Auth is in beta." 라고 쓰여 있다.
- **Convex HTTP action 이 `Location: zknote://...` 302 를 실제로 그대로 내보내는지 런타임 검증하지
  않았다.** 소스에는 비-http 스킴을 위한 전용 워크어라운드(`setURLSearchParam`, 주석: "Temporary
  work-around because Convex doesn't support schemes other than http and https")가 있어 의도적으로
  지원하는 것으로 보이지만, 에러 경로는 `Response.redirect(destinationUrl)` 를 쓴다.
- **`tauri-plugin-oauth` 는 IPv4(`127.0.0.1`)에만 바인드한다.** RFC 8252 §7.3 의 "It is RECOMMENDED
  that clients attempt to bind to the loopback interface using both IPv4 and IPv6" 를 충족하지 않는다.
  실제 문제가 되는 환경이 있는지에 대한 1차 자료는 찾지 못했다.
- **loopback 이 방화벽에 막히는 빈도**에 대한 1차 데이터 없음. Google 문서는 "Most, but not all,
  firewalls allow loopback communication" 이라고만 쓴다.
- **`tauri-plugin-oauth` 의 유지보수 보증·보안 감사 여부**를 확인할 1차 자료 없음. tauri-apps 공식
  워크스페이스 밖의 개인 저장소이고, README 의 "Security Considerations" 3줄이 전부다. 의존을
  피하려면 `std::net::TcpListener` 30여 줄로 자체 구현하는 선택지도 있다(플러그인 `src/lib.rs` 가
  실제로 그 정도 규모다).
- **인증 상태에서의 Convex WebSocket 동작은 여전히 미측정이다.** ADR-0001 은 미인증 연결만 측정했다.
  토큰 세팅 후 재연결/갱신은 이 결정과 별개로 확인이 필요하다.

## 출처

RFC / 스펙

- RFC 8252, OAuth 2.0 for Native Apps — https://www.rfc-editor.org/rfc/rfc8252.txt
- RFC 7636, Proof Key for Code Exchange — https://www.rfc-editor.org/info/rfc7636

Google (1차)

- OAuth 2.0 for iOS & Desktop Apps — https://developers.google.com/identity/protocols/oauth2/native-app
- Loopback IP address flow migration guide — https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration
- OOB flow migration guide — https://developers.google.com/identity/protocols/oauth2/resources/oob-migration
- Google API Services / OAuth 2.0 Policies — https://developers.google.com/identity/protocols/oauth2/policies
- Google Cloud Console 도움말, Setting up OAuth 2.0 — https://support.google.com/cloud/answer/15549257

Convex (1차 문서 + 소스)

- Convex Auth 소개(beta 표기) — https://labs.convex.dev/auth
- Convex Auth OAuth 설정(콜백 URL, React Native 흐름, `redirect` 콜백 오버라이드) — https://labs.convex.dev/auth/config/oauth
- Convex Auth Google 프로바이더(= Web application 클라이언트 등록) — https://labs.convex.dev/auth/config/oauth/google
- Convex Auth Advanced(커스텀 콜백/사인인 URL) — https://labs.convex.dev/auth/advanced
- Convex HTTP Actions(`.convex.site` 도메인) — https://docs.convex.dev/functions/http-actions
- `get-convex/convex-auth` 소스 — https://github.com/get-convex/convex-auth
  - `src/server/implementation/redirects.ts`, `src/server/implementation/signIn.ts`,
    `src/server/implementation/index.ts`, `src/react/client.tsx`, `src/cli/index.ts`,
    `docs/pages/config/oauth.mdx`

Tauri (1차 문서 + 소스)

- Deep Linking 플러그인 문서 — https://v2.tauri.app/plugin/deep-linking/
- Opener 플러그인 문서 — https://v2.tauri.app/plugin/opener/
- CSP 문서 — https://v2.tauri.app/security/csp/
- Config 레퍼런스(`useHttpsScheme` — macOS/Linux 는 `<scheme>://localhost`) — https://v2.tauri.app/reference/config/
- Tauri 아키텍처(wry) — https://v2.tauri.app/concept/architecture/
- `tauri-apps/plugins-workspace` deep-link 소스(`register*` 는 macOS 에서 `UnsupportedPlatform`) — https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/deep-link/src/lib.rs
- `tauri-bundler` macOS `CFBundleURLTypes` 생성 — https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/macos/app.rs
- Tauri IPC 스크립트(CSP 차단 시 postMessage 폴백) — https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/scripts/ipc-protocol.js
- wry README(플랫폼별 웹뷰 엔진) — https://github.com/tauri-apps/wry/blob/dev/README.md
- `FabianLars/tauri-plugin-oauth`(v2 브랜치 README, `src/lib.rs`) — https://github.com/FabianLars/tauri-plugin-oauth/tree/v2
- crates.io `tauri-plugin-oauth` — https://crates.io/crates/tauri-plugin-oauth

Apple

- `CFBundleURLTypes` — https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleurltypes
