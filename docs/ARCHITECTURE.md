# ZK-Note — 아키텍처 설계

> 생성일: 2026-04-26  
> 기반: REQUIREMENTS.md

---

## 1. 시스템 개요

```
┌─────────────────────────────────────────────────────────────┐
│  클라이언트 — 동일한 React 코드 (TanStack Start + TipTap)    │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐     │
│  │  데스크탑     │   │   웹브라우저   │   │   모바일     │     │
│  │  (1순위/MVP) │   │   (2순위)    │   │  (3순위/PWA) │     │
│  │              │   │              │   │              │     │
│  │ ┌──────────┐ │   │              │   │              │     │
│  │ │  Tauri   │ │   │              │   │              │     │
│  │ │  WebView │ │   │              │   │              │     │
│  │ └────┬─────┘ │   │              │   │              │     │
│  │      │ IPC   │   │              │   │              │     │
│  │ ┌────▼─────┐ │   │              │   │              │     │
│  │ │ Tauri 셸 │ │   │              │   │              │     │
│  │ │ (Rust)   │ │   │              │   │              │     │
│  │ │ - 메뉴/창 │ │   │              │   │              │     │
│  │ │ - 단축키  │ │   │              │   │              │     │
│  │ │ - 자동업뎃│ │   │              │   │              │     │
│  │ │ - 향후:   │ │   │              │   │              │     │
│  │ │  터미널/FS│ │   │              │   │              │     │
│  │ └──────────┘ │   │              │   │              │     │
│  └──────────────┘   └──────────────┘   └──────────────┘     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  공통 React 앱 (src/)                               │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐             │    │
│  │  │  Editor  │ │  Tasks   │ │ Calendar │             │    │
│  │  │ (TipTap) │ │  View    │ │  View    │             │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘             │    │
│  │       │            │            │                    │    │
│  │  ┌────▼────────────▼────────────▼────┐               │    │
│  │  │  Platform Abstraction Layer       │               │    │
│  │  │  (lib/platform: tauri | web)      │               │    │
│  │  └─────────────────┬─────────────────┘               │    │
│  │  ┌─────────────────▼─────────────────┐               │    │
│  │  │     Convex React Client           │               │    │
│  │  │  (useQuery / useMutation)         │               │    │
│  │  └─────────────────┬─────────────────┘               │    │
│  └────────────────────┼─────────────────────────────────┘    │
└───────────────────────┼──────────────────────────────────────┘
                        │ WebSocket (실시간)
┌───────────────────────▼──────────────────────────────────────┐
│                   Convex Backend (단일 소스)                  │
│                                                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│   │  notes   │  │  tasks   │  │ folders  │                   │
│   │ queries/ │  │ queries/ │  │ queries/ │                   │
│   │mutations │  │mutations │  │mutations │                   │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│   ┌────▼────────────▼──────────────▼────┐                    │
│   │           Convex Database           │                    │
│   │  users / folders / notes / tasks /  │                    │
│   │  attachments                        │                    │
│   └─────────────────────────────────────┘                    │
│   ┌─────────────────────────────────────┐                    │
│   │         Convex File Storage         │                    │
│   │         (이미지, 첨부파일)            │                    │
│   └─────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

**핵심 설계 원칙**:

- **단일 React 코드베이스**가 데스크탑(Tauri WebView) / 웹브라우저 / 모바일(PWA) 모두에서 동작
- 플랫폼 의존 코드는 `lib/platform/` 추상화 레이어로 격리 — UI 컴포넌트는 플랫폼을 인지하지 않음
- Tauri 셸은 메뉴/단축키/자동업데이트 등 OS 기능만 담당, 앱 로직은 React 쪽에 둠
- 데이터는 모든 플랫폼 공통으로 Convex 클라우드 단일 소스 사용

---

## 2. 프로젝트 디렉토리 구조

```
zk-note/
├── src-tauri/                     # ⭐ Tauri 데스크탑 셸 (Rust)
│   ├── src/
│   │   ├── main.rs                # 엔트리포인트
│   │   ├── menu.rs                # 앱 메뉴 정의
│   │   ├── shortcuts.rs           # 전역 단축키 (Phase 2)
│   │   └── commands.rs            # IPC 커맨드 (향후 터미널/FS 등)
│   ├── icons/                     # 앱 아이콘 (모든 플랫폼)
│   ├── tauri.conf.json            # Tauri 설정 (윈도우, 권한, 업데이터)
│   ├── Cargo.toml
│   └── build.rs
│
├── convex/                        # Convex 백엔드 (모든 플랫폼 공유)
│   ├── schema.ts
│   ├── auth.ts                    # 인증 설정 (Google OAuth)
│   ├── notes.ts
│   ├── tasks.ts
│   ├── folders.ts
│   └── attachments.ts
│
├── src/                           # ⭐ 모든 플랫폼이 공유하는 React 코드
│   ├── routes/                    # TanStack Start 파일 기반 라우팅
│   │   ├── __root.tsx             # 루트 레이아웃 (auth guard, theme, 플랫폼 감지)
│   │   ├── index.tsx              # / → /daily redirect
│   │   ├── daily.tsx              # 오늘의 Daily Note
│   │   ├── notes/
│   │   │   ├── index.tsx
│   │   │   └── $noteId.tsx
│   │   ├── tasks/
│   │   │   └── index.tsx
│   │   ├── calendar/
│   │   │   └── index.tsx
│   │   └── auth/
│   │       └── callback.tsx       # 웹 OAuth 콜백 (데스크탑은 별도)
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── RightPanel.tsx
│   │   ├── editor/
│   │   │   ├── NoteEditor.tsx
│   │   │   ├── extensions/
│   │   │   │   ├── TaskNode.tsx
│   │   │   │   ├── WikiLink.tsx
│   │   │   │   ├── SlashCommands.tsx
│   │   │   │   └── index.ts
│   │   │   └── toolbar/
│   │   │       └── EditorToolbar.tsx
│   │   ├── sidebar/
│   │   │   ├── FolderTree.tsx
│   │   │   ├── FolderItem.tsx
│   │   │   └── NoteItem.tsx
│   │   ├── tasks/
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskItem.tsx
│   │   │   ├── TaskDetail.tsx
│   │   │   └── TaskCreateForm.tsx
│   │   └── calendar/
│   │       ├── CalendarView.tsx
│   │       └── DayPanel.tsx
│   │
│   ├── lib/
│   │   ├── platform/              # ⭐ 플랫폼 추상화 레이어
│   │   │   ├── index.ts           # 인터페이스 + 자동 분기 (런타임 감지)
│   │   │   ├── types.ts           # PlatformAdapter 인터페이스
│   │   │   ├── tauri.ts           # Tauri invoke 기반 구현 (deep link, 메뉴, 단축키, 향후 터미널)
│   │   │   └── web.ts             # 웹/PWA 구현 (브라우저 API 또는 no-op)
│   │   ├── markdown.ts            # TipTap ↔ Markdown 직렬화
│   │   ├── export.ts              # .md 파일 Export (플랫폼별 분기)
│   │   └── utils.ts
│   │
│   └── styles/
│       └── globals.css            # Tailwind + 테마 변수
│
├── public/
├── package.json
├── app.config.ts                  # TanStack Start 설정 (SPA 모드 옵션)
└── README.md
```

### 디렉토리 설계 원칙

- **`src-tauri/`** 는 Tauri 셸 전용. React 코드를 직접 import하지 않음. IPC 커맨드만 노출.
- **`src/`** 는 데스크탑 / 웹 / 모바일이 100% 공유.
- 플랫폼 분기는 오로지 **`src/lib/platform/`** 안에서만 일어남. 다른 곳에서 `window.__TAURI__` 등을 직접 참조하지 않음.
- 라우트와 컴포넌트는 `usePlatform()` 훅을 통해서만 OS 기능에 접근.

---

## 3. Convex 데이터베이스 스키마

스키마 원본은 `convex/schema.ts` 하나다. 필드 목록을 여기에 복제하면 반드시 어긋나므로,
이 문서는 테이블의 **역할과 불변식**만 기록한다.

| 테이블 | 담는 것 | 소유자 |
|---|---|---|
| `users` | 로그인한 사용자. `tokenIdentifier`(Google OAuth sub)로 찾는다 | — (사용자 본인) |
| `folders` | 노트를 담는 그릇. `parentId` 로 중첩된다 | `userId` |
| `notes` | 마크다운 본문(`content`)이 원본인 글 한 편 (ADR-0003) | `userId` |
| `tasks` | 노트와 별개로 존재하는 할 일. `linkedNoteId` 로 노트를 가리킬 수 있다 | `userId` |
| `attachments` | 노트에 딸린 파일. 실제 바이트는 Convex File Storage | `userId` |

불변식:

- **모든 문서는 정확히 한 명의 소유자를 가진다.** `users` 를 뺀 네 테이블 전부에
  `userId` 가 있고, 백엔드 함수는 소유자 module 을 통과해야만 이 문서들에 닿는다
  (ADR-0002).
- 저장된 파일에는 소유자 필드가 없다. 그 파일을 가리키는 `attachments` 레코드가
  소유자를 정하므로, 이미 남이 claim 한 `storageId` 는 거절한다(`by_storage` 인덱스).
- 데일리 노트는 날짜가 정체성이라 만들어진 뒤 `dailyNoteDate` 가 바뀌지 않는다.

> **`notes.content` 의존성 — 결정됨**: §10.1 의 갈림길은 ADR-0003 으로 닫혔다. 안 A(마크다운 = source of truth)를 택했으므로 `content` 필드와 `search_notes` 인덱스는 잠정안이 아니다. 뒤집으려면 ADR-0003 의 "이 결정을 뒤집어야 할 신호"를 먼저 확인할 것.

---

## 4. 핵심 데이터 흐름

### 4.1 노트 편집 → 저장 흐름

```
사용자 타이핑
    │
    ▼
TipTap Editor (ProseMirror JSON - 메모리)
    │
    │ onChange (debounce 500ms)
    ▼
markdownSerializer(editorContent)
    │
    │ 마크다운 문자열
    ▼
useMutation("notes:update") → Convex DB 저장
    │
    │ Convex 실시간 반영
    ▼
다른 탭/기기의 useQuery 자동 업데이트
```

### 4.2 Daily Note 태스크 생성 흐름

```
Daily Note에서 "- [ ] 할일 작성"
    │
    ▼
TipTap TaskNode Extension 감지
    │
    ▼ (taskId가 없는 경우)
useMutation("tasks:create") 호출
  → { title, linkedDate: today, linkedNoteId }
    │
    ▼
반환된 taskId를 TaskNode 속성에 저장
    │
    ▼
노트 저장 시 마크다운으로 직렬화:
  "- [ ] 할일 작성" (표준 마크다운)
  + 노트 content에 taskId 메타 주석 (HTML comment): <!-- task:taskId -->
```

> **설계 결정**: 마크다운 호환성 유지를 위해 태스크는 `- [ ] 제목`으로 직렬화. taskId는 HTML 주석으로 보존하여 재로드 시 Convex 태스크와 연결.

### 4.3 태스크 상태 동기화 흐름

```
체크박스 클릭 (어디서든: 노트 뷰 / 태스크 뷰)
    │
    ▼
useMutation("tasks:updateStatus", { taskId, status: "done" })
    │
    ▼
Convex DB 업데이트
    │
    ├── 노트 에디터의 TaskNode → useQuery로 상태 반영
    └── 태스크 뷰의 TaskItem → useQuery로 상태 반영
```

---

## 5. TipTap 확장 설계

### 5.1 확장 목록

| 확장                | 용도                          | 출처              |
| ------------------- | ----------------------------- | ----------------- |
| `StarterKit`        | 기본 마크다운 요소 전체       | TipTap 공식       |
| `Markdown`          | ProseMirror ↔ Markdown 직렬화 | `tiptap-markdown` |
| `CodeBlockLowlight` | 신택스 하이라이트             | TipTap 공식       |
| `Mathematics`       | LaTeX/KaTeX 렌더링            | TipTap 공식       |
| `Image`             | 이미지 업로드/렌더링          | TipTap 공식       |
| `TaskList`          | `- [ ]` 체크리스트 (베이스)   | TipTap 공식       |
| **`TaskNode`**      | Convex 태스크 DB 연동 토글    | **커스텀**        |
| **`WikiLink`**      | `[[노트이름]]` 양방향 링크    | **커스텀**        |
| **`SlashCommands`** | `/` 커맨드 팔레트             | **커스텀**        |

### 5.2 커스텀 TaskNode 명세

```typescript
// TaskNode: Convex 태스크와 1:1 연결된 에디터 노드
Node.create({
  name: "taskNode",
  group: "block",
  atom: true, // 내부 편집 없음 (React 컴포넌트로 렌더)

  addAttributes() {
    return {
      taskId: { default: null }, // Convex Task ID
      title: { default: "" }, // 초기 제목 (로딩 전 표시용)
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskNodeComponent);
    // TaskNodeComponent: useQuery로 Convex 태스크 실시간 구독
    // 체크박스, 토글(상세 내용), 제목 편집 포함
  },

  // 마크다운 직렬화: "- [ ] 제목 <!-- task:id -->"
  // 마크다운 역직렬화: <!-- task:id --> 감지 → Convex에서 태스크 로드
});
```

### 5.3 커스텀 WikiLink 명세

```typescript
// WikiLink: [[노트 이름]] → 클릭 시 해당 노트로 이동
Mark.create({
  name: "wikiLink",
  addAttributes() {
    return {
      noteTitle: { default: null },
      noteId: { default: null }, // 저장 시 resolve된 ID
    };
  },
  // 렌더: 파란색 링크, hover 시 미리보기 팝오버
  // 마크다운: [[노트이름]] 그대로 직렬화 (표준 wikilink 포맷)
});
```

---

## 5.4 플랫폼 추상화 레이어

데스크탑(Tauri)과 웹/모바일이 동일한 React 코드를 공유하기 위한 핵심 메커니즘.

### 인터페이스 정의

인터페이스 원본은 `src/lib/platform/types.ts` 하나다. 여기에 옮겨 적지 않는다 —
사본은 코드보다 먼저 낡는다. 지켜야 할 성질만 남긴다:

- 모든 멤버는 **필수**이며 `tauri`·`web` 양쪽에 실제 구현이 있다. 호출부는
  `platform.method?.()` 로 방어하지 않는다.
- 이 경계를 사이에 두고 **실제로 달라지는 것만** 멤버가 된다. 구현이나 호출부가 없던
  시그니처(메뉴 핸들러·전역 단축키·내장 터미널, 그리고 양쪽 다 throw 하던
  `startOAuthFlow`, 웹 구현이 없던 `setWindowTitle`)는 모두 제거했다. 두 번째 어댑터가
  생기는 시점에 다시 넣는다.
- **OAuth 는 지금 이 경계에 없다.** ADR-0004 는 `tauri.ts` 의 `startOAuthFlow` 스텁을
  루프백 흐름이 채울 자리로 지목했지만 그 스텁은 지워졌다. 웹(#4)·데스크탑(#5) 로그인을
  구현할 때 이 경계로 **되돌아온다** — ADR-0004 가 "웹과 갈라지는 곳은 브라우저를 어떻게
  여는가와 `?code=` 를 어디서 줍는가 두 군데뿐"이라고 적은 그 두 곳이 여기다.
  커스텀 스킴 딥링크는 쓰지 않는다.

### 런타임 분기

`src/lib/platform/index.tsx` 의 `getPlatform()` 이 `window.__TAURI__` 유무로 어댑터를
골라 한 번만 만들고 캐시한다. 생성이 실패하면 진행 중이던 약속을 비워 다음 호출이 다시
시도한다 — 그 재시도 동작은 `__tests__/index.test.ts` 가 고정한다.

### 사용 예 (UI 컴포넌트는 플랫폼을 인지하지 않음)

```typescript
const platform = usePlatform();
await platform.saveFile("note.md", new Blob([markdown]));
// → 데스크탑: OS save dialog
// → 웹/PWA: anchor 다운로드
```

### 빌드 산출물

| 타겟     | 빌드 도구                     | 산출물                                                |
| -------- | ----------------------------- | ----------------------------------------------------- |
| 데스크탑 | `tauri build`                 | `.app` (macOS), `.msi` (Windows), `.AppImage` (Linux) |
| 웹       | TanStack Start (SPA 또는 SSR) | 정적 사이트 또는 Node 서버                            |
| 모바일   | PWA manifest + service worker | 동일 웹 빌드를 홈 화면 설치                           |

---

## 6. 라우트 설계

```
/                   → /daily (redirect)
/daily              → 오늘의 Daily Note (자동 생성)
/notes              → 노트 목록 (폴더 트리 + 최근 노트)
/notes/:noteId      → 노트 에디터
/tasks              → 태스크 뷰
  ?view=list        → 리스트 뷰 (기본)
  ?view=calendar    → 캘린더 뷰
  ?date=YYYY-MM-DD  → 특정 날짜 필터
/calendar           → 월간 캘린더 뷰
/auth/callback      → Google OAuth 콜백 처리
```

---

## 7. UI 레이아웃 구조

```
┌─────────────────────────────────────────────────────────┐
│  Header: 검색바 (Cmd+K), 사용자 아바타, 테마 토글         │
├──────────┬──────────────────────────────┬───────────────┤
│          │                              │               │
│  Sidebar │        Editor / View         │  Right Panel  │
│          │                              │  (선택적)     │
│  - 네비  │  [노트 에디터 | 태스크 뷰   │  - 백링크     │
│  - 폴더  │   | 캘린더 뷰]              │  - 태스크 요약│
│  - 트리  │                              │  - 아웃라인   │
│          │                              │               │
│  [400px] │       [flex: 1]              │  [280px]      │
│  접이식  │                              │  접이식       │
└──────────┴──────────────────────────────┴───────────────┘
```

**모바일 반응형**: 사이드바/우측패널 숨김, 하단 탭 네비게이션

---

## 8. 인증 흐름

### 8.1 공통 흐름

```
앱 진입
  │
  ▼
Convex Auth 세션 확인
  │
  ├── 세션 있음 → 앱 진입
  │
  └── 세션 없음 → 로그인 페이지
        │
        ▼
      Google OAuth 버튼 클릭 → platform.startOAuthFlow("google")
        │
        ▼
      [플랫폼별 분기 — 8.2 / 8.3 참고]
        │
        ▼
      Convex Auth 토큰 저장
        │
        ▼
      users 테이블 upsert (최초 가입 시 생성)
        │
        ▼
      /daily 로 redirect
```

### 8.2 웹 환경 (브라우저)

표준 OAuth redirect 흐름. Google → `/auth/callback` 라우트 → Convex Auth 토큰 교환.

### 8.3 데스크탑 환경 (Tauri)

브라우저 redirect를 그대로 쓸 수 없으므로 콜백을 앱으로 되돌릴 방법이 필요하다.

> **결정됨 (2026-08-14, ADR-0004): 임시 루프백 서버 (`http://127.0.0.1:<port>/callback`).**
> 커스텀 URL 스킴 딥링크는 채택하지 않는다 — Tauri 딥링크는 **macOS에서 런타임 등록이 불가능**하고
> 번들 + `/Applications` 설치를 요구해, macOS 우선 + 서명 생략인 현재 개발 흐름으로는 검증조차 안 된다.
> Google도 데스크탑에 루프백을 권장하며 커스텀 스킴은 "no longer supported"로 쓴다.
> 근거와 미확인 항목은 `docs/adr/0004-desktop-oauth-uses-loopback-callback.md` 및
> `docs/research/tauri-desktop-oauth-callback.md` 참고.

흐름:

```
앱 → 임시 루프백 서버 기동 (Rust 측, 임의 포트)
  → 시스템 기본 브라우저로 인증 URL 열기 (plugin-opener)
  → 사용자가 브라우저에서 로그인
  → Convex가 http://127.0.0.1:<port>/callback?code=... 로 302
  → Rust가 code 수신 → 이벤트로 프론트에 전달 → 서버 종료
  → signIn(provider, { code }) 재호출 → 토큰이 Convex 클라이언트에 세팅
```

**반드시 지킬 것 세 가지** (상세는 ADR-0004):

- **WebView 안에서 Google 로그인 화면을 열지 않는다.** WKWebView는 Google이 `disallowed_useragent`로
  거부하며, RFC 8252 §8.12도 embedded user-agent를 금지한다. 반드시 시스템 브라우저를 연다.
- **`callbacks.redirect`를 재정의한다.** Convex Auth 기본 구현은 `SITE_URL` 접두사 매칭이라 임의 포트를
  거부한다. open redirect 표면이므로 화이트리스트로만 쓴다.
- **CSP에 `http:`를 열지 않는다.** 루프백 소켓은 Rust가 소유하고 결과는 이벤트로 오므로 WebView는
  `http://127.0.0.1`로 통신하지 않는다.

---

## 9. 오프라인 전략 (온라인 우선)

Convex는 현재 **온라인 우선** 모델이다. 기본 제공 오프라인은 세션 메모리 캐시 기반이라 **앱 완전 종료 후 재진입 시 오프라인 작성분이 유실될 수 있다**. 영구 오프라인을 제공하는 Convex 공식 sync 엔진(`curvilinear`)은 2026 현재 **alpha**(정합성 미해결, 멀티탭/마이그레이션 미지원)라 데이터가 생명인 노트 앱 MVP에는 부적합하다.

### 9.1 MVP — 온라인 우선 + 데이터 유실 안전망

```
온라인: useMutation → 낙관적 반영(UI 즉시) → Convex 저장 → 실시간 동기화
네트워크 단절(짧음): 낙관적 반영 유지 → 복구 시 큐된 mutation 순서 실행
앱 종료(미동기 상태): ───────────────────────────────────────┐
                                                              ▼
  미동기 에디터 버퍼를 로컬에 즉시 영속화
    - 데스크탑: Tauri FS / SQLite 플러그인
    - 웹/PWA: IndexedDB
                                                              │
  재진입 시 미동기 버퍼 복원 → Convex로 재전송 ◀──────────────┘
```

> **MVP 안전망의 범위**: 풀 오프라인 sync를 구현하지 않는다. "방금 친 내용을 오프라인에서 종료해 날리는" 최악의 실패만 막는 얇은 버퍼 레이어다 — 풀 오프라인 엔진보다 훨씬 작고, 곧 나올 공식 엔진과 충돌하지 않는다.

### 9.2 Phase 2 — 공식 sync 엔진 채택

Convex Object Sync Engine / `curvilinear`가 GA 되면 영구 오프라인(IndexedDB→SQLite, 서버 reconciliation)을 그것으로 전환한다. **직접 오프라인 엔진을 만들지 않는다**(공식판 출시 시 폐기될 코드).

### 9.3 충돌 해결

- 기본: Last-Write-Wins(`updatedAt` 비교).
- 단, **노트 본문**은 통짜 마크다운 문자열이라 LWW 덮어쓰기 시 동시편집분이 통째로 유실된다. step 단위 병합(`prosemirror-sync`) 채택을 §10에서 별도 검토.
- 태스크는 필드 단위로 작아 LWW 허용(미결: detail 필드 동시수정 — REQUIREMENTS §10-3).

---

## 10. 마크다운 직렬화 전략

**핵심 원칙**: Convex에는 항상 표준 마크다운 문자열로 저장.

````
TipTap (ProseMirror JSON)
    ↕ tiptap-markdown 라이브러리
마크다운 문자열 (Convex 저장)

커스텀 노드 직렬화:
  TaskNode   → "- [ ] 제목 <!-- task:abc123 -->"
  WikiLink   → "[[노트이름]]"
  CodeBlock  → "```언어\n코드\n```"
  Math       → "$$ 수식 $$"
  Image      → "![alt](convex-storage-url)"
````

**Export 흐름**:

```
Convex content (마크다운) → HTML comment 제거 → .md 파일 다운로드
```

### 10.1 노트 저장 source of truth — 갈림길 (PoC에서 선결)

노트 동시편집 LWW 유실(§9.3)을 막는 정공법은 Convex 공식 컴포넌트 **`prosemirror-sync`**다. 노트는 ProseMirror 문서 자체이므로, 통짜 문자열을 덮어쓰는 대신 **step 단위 OT + 스냅샷으로 병합**한다(production 유지보수, Apache-2.0, TipTap 확장으로 연결). 단 이를 쓰면 노트 본문이 `notes.content` 마크다운 문자열을 떠나 컴포넌트가 관리하는 스냅샷+steps가 된다 — 아래 둘 중 하나를 의식적으로 택해야 한다.

| | A. 마크다운 = source (현 설계) | B. `prosemirror-sync` = source |
|---|---|---|
| 저장 | `notes.content`에 표준 마크다운 | 컴포넌트 스냅샷+steps, 마크다운은 Export 시 파생 |
| 동시편집 | LWW 통짜 덮어쓰기(유실 위험) | step OT 병합(유실 없음), 향후 실시간 협업 기반 |
| 검색(§3) | `content` 직접 full-text | 스냅샷에서 텍스트 추출해 별도 검색 필드 유지 필요 |
| 단순성 | 높음(이식성·외부 .md 호환 직관적) | 낮음(컴포넌트 데이터 모델에 종속) |
| 제약 | — | 문서 1MB 미만, Yjs 불가, **오프라인 편집 미지원(예정)** |

> **결정됨 (2026-08-14, ADR-0003): A — 마크다운이 원본.** 프로토타입에서 커스텀 노드(TaskNode·WikiLink)를 품은 마크다운 왕복을 16개 케이스로 측정해 **내용 손실 0건**을 확인했다. B의 제약인 오프라인 편집 미지원이 Phase 2 로드맵과 충돌하는 것이 결정적이었다 — 이 선택은 "안전 vs 단순"이 아니라 **동시편집이냐 오프라인이냐**의 교환이었고, 개인용 앱에서 후자를 택했다. 남는 대가(LWW 유실 위험, 저장 시 재포맷)와 구현 시 반드시 지켜야 할 항목은 `docs/adr/0003-markdown-is-the-note-source-of-truth.md` 참고.

---

## 11. 주요 기술 결정 및 근거

| 결정                       | 선택                                               | 근거                                                                                                              |
| -------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **데스크탑 셸**            | **Tauri (vs Electron)**                            | 번들 사이즈 (~3MB → 앱 < 30MB vs Electron 150MB+), 메모리 가벼움, Rust 셸로 향후 OS 통합(터미널 등) 안전하게 확장 |
| **플랫폼 코드 공유**       | **단일 React 코드 + `lib/platform/` 추상화**       | 데스크탑/웹/모바일 ≥ 95% 코드 공유. UI는 플랫폼 무관, 분기는 한 곳에 격리                                         |
| **TanStack Start 모드**    | **SPA 모드 (Tauri) + selective SSR (웹 공유 페이지)** | Start 정식 SPA 모드(`spa.enabled` + prerender)로 Node 서버 없는 Tauri WebView에서 동작(공개 Tauri 2.0+Start 템플릿으로 검증). 웹 빌드에서는 라우트별 SSR로 향후 공개 노트 공유 페이지만 SEO 가능. 노트 공유 미계획 시 TanStack Router+Vite로 대체 가능(이주 비용 낮음) |
| 에디터 내부 포맷           | ProseMirror JSON (메모리) + Markdown (저장)        | 편집 성능 vs 호환성 분리                                                                                          |
| 태스크-노트 연결           | HTML 주석으로 taskId 보존                          | 마크다운 호환성 깨지지 않으면서 ID 유지                                                                           |
| 실시간 동기화              | Convex WebSocket                                   | 별도 구현 없이 실시간 반영                                                                                        |
| 파일 스토리지              | Convex File Storage                                | 백엔드 단일화, 모든 플랫폼 공통                                                                                   |
| 스타일링                   | Tailwind CSS + CSS 변수                            | 다크모드 테마 전환 용이                                                                                           |
| 상태 관리                  | Convex useQuery 전역 (별도 상태 라이브러리 불필요) | Convex가 서버 상태 관리 대체                                                                                      |
| **데스크탑 자동 업데이트** | **Tauri Updater**                                  | 별도 인프라 없이 정적 manifest로 업데이트 채널 운영 가능                                                          |

---

## 12. 미결 설계 이슈

1. **태스크 마크다운 직렬화**: `<!-- task:id -->` HTML 주석 방식이 모든 마크다운 뷰어에서 안전하게 무시되는지 검증 필요
2. **양방향 링크 resolve**: `[[노트이름]]` → noteId 변환 시점 (저장 시 vs 렌더 시)
3. **Daily Note 템플릿**: 사용자 정의 템플릿 저장 위치 (users.settings vs 별도 템플릿 테이블)
4. **태스크 상세(detail) 에디터**: 별도 TipTap 인스턴스 vs 간단한 textarea
5. **영구 오프라인(Phase 2)**: 직접 IndexedDB 캐시를 만들기보다 Convex 공식 sync 엔진(`curvilinear`) alpha 졸업 시점에 맞춰 채택. MVP는 미동기 버퍼 로컬 보존으로 한정(§9)
6. ~~**Tauri OAuth 콜백 패턴**~~ → **해결됨 (2026-08-14, ADR-0004)**: 임시 루프백 서버(`http://127.0.0.1:<port>`). Tauri 딥링크가 macOS 런타임 등록 불가라 현 개발 흐름으로 검증 불가능한 것이 결정적. Google·RFC 8252도 데스크탑에 루프백을 권장
7. ~~**Convex × Tauri WebView 연결성**~~ → **해결됨 (2026-08-14, ADR-0001)**: 빌드된 앱의 `tauri://localhost` origin + 현행 CSP에서 WebSocket이 0.7초 만에 연결되고 약 4분간 재연결 0회로 유지됨. Convex는 WS 핸드셰이크에서 Origin을 검사하지 않음. **CSP 수정 불필요.** 측정 방법과 함정은 `docs/adr/0001-convex-websocket-over-tauri-webview.md` 참고
11. ~~**노트 source of truth (A 마크다운 vs B `prosemirror-sync`)**~~ → **해결됨 (2026-08-14, ADR-0003)**: A 채택. 왕복 손실 0건 실측, B의 오프라인 미지원 제약이 로드맵과 충돌. 스키마·검색·Export는 현 설계 유지
8. ~~**Tauri 자동 업데이트 호스팅**~~ → **해결됨 (2026-08-15, ADR-0006)**: **GitHub Releases**. 아티팩트와 manifest 가 같은 릴리스에 함께 올라가 둘이 어긋날 여지가 구조적으로 없는 것이 결정적. 엔드포인트는 버전 무관 고정 URL `releases/latest/download/latest.json`, 릴리스는 `v*` 태그 push 가 GitHub Actions 로 만든다. Convex Storage 는 채널을 앱 백엔드에 묶어 "독립 인프라" 전제가 깨져 기각
9. **데스크탑 코드 서명**: macOS 공증 / Windows 코드 서명 적용 시점 (개인 사용 단계에서는 생략) — **자가 업데이트만 놓고 보면 공증 없이 동작함이 실측됐다 (2026-08-15, ADR-0006).** updater 가 Rust 파일 I/O 로 번들을 써 quarantine 이 붙지 않아 Gatekeeper 를 구조적으로 지나간다. **다만 브라우저로 받는 첫 설치는 막힌다** — quarantine 이 붙은 미공증 앱은 실행되지 않고 macOS 가 휴지통으로 옮기며, ad-hoc 재서명으로도 풀리지 않는다. 현재는 터미널 설치(`tar` 추출)로 우회 중이며, 이 우회를 그만두고 싶어지는 시점이 곧 공증 도입 시점이다
10. **모바일 PWA 한계**: iOS Safari의 PWA 제약 (오프라인, 설치 UX) 파악 후 native 래퍼 필요 시점 결정

---

## 13. 다음 단계

1. ~~**Tauri PoC**~~ — 핵심 위험은 해소됨:
   - ~~Convex React Client WebSocket이 Tauri WebView(`tauri://localhost`)에서 실시간 구독을 유지하는가~~ → **유지된다 (2026-08-14, ADR-0001).** CSP 수정 불필요
   - ~~Start SPA 모드 prerender 산출물이 Tauri에서 라우팅 정상 동작 확인~~ → 확인됨. 빌드된 앱에서 SPA 셸이 뜨고 클라이언트 라우팅으로 딥링크 라우트까지 도달함
   - ~~Google OAuth 데스크탑 콜백 패턴 결정 (8.3)~~ → **루프백으로 확정 (2026-08-14, ADR-0004)**
   - **남음** — 인증 토큰이 붙은 뒤에도 WS 동작이 같은지. 이번 측정은 미인증 상태로만 했다(ADR-0001 "뒤집어야 할 신호")
2. ~~**에디터 PoC**~~ — 완료 (2026-08-14, ADR-0003):
   - ~~노트 source of truth A/B 결정 (§10.1)~~ → **A 채택**
   - ~~`tiptap-markdown`이 커스텀 노드(TaskNode/WikiLink) 직렬화를 지원하는지, 마크다운 라운드트립 검증~~ → 16개 케이스 **내용 손실 0건**. 구현 시 지켜야 할 함정 4가지는 ADR-0003 참고
3. Phase 1 MVP 구현 시작
   - 권장 순서: Tauri 셸 셋업 → 플랫폼 추상화 → Convex 스키마 → 인증 → 에디터 기본 → Daily Note → 태스크 연동 → 자동 업데이트 채널
