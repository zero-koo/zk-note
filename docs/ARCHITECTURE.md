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

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(), // Google OAuth sub
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    settings: v.optional(
      v.object({
        theme: v.union(
          v.literal("light"),
          v.literal("dark"),
          v.literal("system"),
        ),
        dailyNoteTemplate: v.optional(v.string()), // 마크다운 템플릿
      }),
    ),
  }).index("by_token", ["tokenIdentifier"]),

  folders: defineTable({
    userId: v.id("users"),
    name: v.string(),
    parentId: v.optional(v.id("folders")), // null = 루트
    sortOrder: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_parent", ["userId", "parentId"]),

  notes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    content: v.string(), // 표준 마크다운 문자열
    folderId: v.optional(v.id("folders")),
    tags: v.array(v.string()),
    linkedNoteIds: v.array(v.id("notes")), // 백링크 계산용
    isDailyNote: v.boolean(),
    dailyNoteDate: v.optional(v.string()), // YYYY-MM-DD (Daily Note만)
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_folder", ["userId", "folderId"])
    .index("by_daily_date", ["userId", "isDailyNote", "dailyNoteDate"])
    .index("by_updated", ["userId", "updatedAt"])
    .searchIndex("search_notes", {
      searchField: "content",
      filterFields: ["userId", "tags"],
    }),

  tasks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
    ),
    detail: v.optional(v.string()), // 마크다운 (토글 상세 내용)
    dueDate: v.optional(v.string()), // YYYY-MM-DD
    tags: v.array(v.string()),
    linkedNoteId: v.optional(v.id("notes")), // 생성된 노트 참조
    linkedDate: v.optional(v.string()), // Daily Note 날짜
    sortOrder: v.number(),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["userId", "status"])
    .index("by_due_date", ["userId", "dueDate"])
    .index("by_linked_date", ["userId", "linkedDate"])
    .index("by_linked_note", ["linkedNoteId"]),

  attachments: defineTable({
    userId: v.id("users"),
    noteId: v.id("notes"),
    storageId: v.id("_storage"), // Convex File Storage
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    createdAt: v.number(),
  }).index("by_note", ["noteId"]),
});
```

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

```typescript
// src/lib/platform/types.ts
export interface PlatformAdapter {
  kind: "tauri" | "web";

  // OAuth: 데스크탑은 deep link / localhost 콜백, 웹은 redirect
  startOAuthFlow(provider: "google"): Promise<void>;

  // 외부 링크 열기: 데스크탑은 OS 기본 브라우저, 웹은 window.open
  openExternal(url: string): Promise<void>;

  // 파일 다운로드 (Export): 데스크탑은 OS save dialog, 웹은 anchor download
  saveFile(name: string, data: Blob): Promise<void>;

  // 윈도우/메뉴 통합: 데스크탑만 의미 있음
  setWindowTitle?(title: string): void;
  registerMenuHandler?(id: string, handler: () => void): void;

  // 향후 확장 (Phase 2~3, 데스크탑 전용)
  registerGlobalShortcut?(
    accelerator: string,
    handler: () => void,
  ): Promise<void>;
  spawnTerminal?(opts: TerminalOptions): Promise<TerminalHandle>;
}
```

### 런타임 분기

```typescript
// src/lib/platform/index.ts
import type { PlatformAdapter } from "./types";

let adapter: PlatformAdapter | null = null;

export async function getPlatform(): Promise<PlatformAdapter> {
  if (adapter) return adapter;

  const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
  if (isTauri) {
    adapter = (await import("./tauri")).createTauriAdapter();
  } else {
    adapter = (await import("./web")).createWebAdapter();
  }
  return adapter;
}

// React 훅
export function usePlatform(): PlatformAdapter {
  /* ... */
}
```

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

브라우저 redirect를 사용할 수 없으므로 두 가지 패턴 중 선택:

| 패턴                                                     | 동작                                                                                                | 트레이드오프                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **A. 커스텀 URL 스킴** (`zknote://callback`)             | OS 기본 브라우저에서 OAuth → 완료 시 `zknote://` URL로 앱 깨움 → Tauri deep link 핸들러가 토큰 처리 | OS 등록 필요(macOS Info.plist, Windows registry) — Tauri가 자동 처리 |
| **B. 임시 로컬 서버** (`http://localhost:포트/callback`) | Tauri 셸이 임시 HTTP 서버 기동 → Google이 localhost로 redirect → 코드 수신 후 서버 종료             | 포트 충돌 / 방화벽 가능성, 구현 단순                                 |

> **결정 보류**: Convex Auth가 데스크탑 환경에서 권장하는 패턴 검증 후 결정 (REQUIREMENTS 미결 #6 참고). 우선 패턴 A를 기본으로 PoC 진행.

---

## 9. 오프라인 전략

Convex 클라이언트는 기본적으로 낙관적 업데이트(Optimistic Updates)를 지원합니다.

```
오프라인 상태
  │
  ▼
useMutation 호출 → Convex 클라이언트 로컬 캐시에 낙관적 반영
  │                (UI는 즉시 업데이트)
  ▼
네트워크 복구 → Convex 자동 재연결 + 큐된 mutation 순서대로 실행
  │
  ▼
Last-Write-Wins: updatedAt 타임스탬프 비교, 나중 것으로 덮어씀
```

> **제약**: Convex의 오프라인 지원은 현재 세션 내 캐시 기반. 앱을 완전히 종료하고 재진입 시 오프라인에서 작성한 내용은 유실될 수 있음. Phase 2에서 IndexedDB 기반 영구 오프라인 캐시 검토.

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

---

## 11. 주요 기술 결정 및 근거

| 결정                       | 선택                                               | 근거                                                                                                              |
| -------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **데스크탑 셸**            | **Tauri (vs Electron)**                            | 번들 사이즈 (~3MB → 앱 < 30MB vs Electron 150MB+), 메모리 가벼움, Rust 셸로 향후 OS 통합(터미널 등) 안전하게 확장 |
| **플랫폼 코드 공유**       | **단일 React 코드 + `lib/platform/` 추상화**       | 데스크탑/웹/모바일 ≥ 95% 코드 공유. UI는 플랫폼 무관, 분기는 한 곳에 격리                                         |
| **TanStack Start 모드**    | **SPA 모드 (Tauri WebView 호환)**                  | Tauri 환경에는 Node 서버 없음. 웹 빌드는 동일 코드를 SSR/SPA 중 선택 가능                                         |
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
5. **오프라인 Phase 2**: IndexedDB 캐시 레이어 설계
6. **Tauri OAuth 콜백 패턴**: deep link(`zknote://`) vs 임시 localhost 서버 — Convex Auth 권장 패턴 검증 후 확정 (8.3 참고)
7. **TanStack Start 라우터 호환성**: Tauri WebView(`tauri://localhost`)에서 파일 기반 라우팅이 정상 동작하는지 PoC 필요
8. **Tauri 자동 업데이트 호스팅**: 업데이트 manifest 호스팅 위치 (Convex Storage / GitHub Releases / 별도 정적 호스팅)
9. **데스크탑 코드 서명**: macOS 공증 / Windows 코드 서명 적용 시점 (개인 사용 단계에서는 생략)
10. **모바일 PWA 한계**: iOS Safari의 PWA 제약 (오프라인, 설치 UX) 파악 후 native 래퍼 필요 시점 결정

---

## 13. 다음 단계

1. **Tauri PoC** (모든 결정의 선결 조건):
   - Tauri + TanStack Start + Convex React Client 동작 검증
   - Tauri WebView 환경에서 라우팅 / WebSocket 정상 동작 확인
   - Google OAuth 데스크탑 콜백 패턴 결정 (8.3)
2. **에디터 PoC**:
   - `tiptap-markdown` 라이브러리가 커스텀 노드 직렬화를 지원하는지
   - TaskNode / WikiLink / SlashCommands 의 마크다운 라운드트립
3. Phase 1 MVP 구현 시작
   - 권장 순서: Tauri 셸 셋업 → 플랫폼 추상화 → Convex 스키마 → 인증 → 에디터 기본 → Daily Note → 태스크 연동 → 자동 업데이트 채널
