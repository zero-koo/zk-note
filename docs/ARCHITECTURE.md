# ZK-Note — 아키텍처 설계

> 생성일: 2026-04-26  
> 기반: REQUIREMENTS.md

---

## 1. 시스템 개요

```
┌─────────────────────────────────────────────────────────┐
│                     클라이언트 (브라우저)                  │
│                                                         │
│   TanStack Start (React)                                │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│   │  Editor  │  │  Tasks   │  │ Calendar │             │
│   │ (TipTap) │  │   View   │  │   View   │             │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│        │              │              │                   │
│   ┌────▼──────────────▼──────────────▼────┐             │
│   │         Convex React Client           │             │
│   │     (useQuery / useMutation)          │             │
│   └────────────────────┬──────────────────┘             │
└────────────────────────┼────────────────────────────────┘
                         │ WebSocket (실시간)
┌────────────────────────▼────────────────────────────────┐
│                   Convex Backend                        │
│                                                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│   │  notes   │  │  tasks   │  │ folders  │             │
│   │ queries  │  │ queries  │  │ queries  │             │
│   │mutations │  │mutations │  │mutations │             │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│        │                            │                   │
│   ┌────▼────────────────────────────▼────┐              │
│   │           Convex Database            │              │
│   │  users / folders / notes / tasks /   │              │
│   │  attachments                         │              │
│   └──────────────────────────────────────┘              │
│   ┌──────────────────────────────────────┐              │
│   │         Convex File Storage          │              │
│   │         (이미지, 첨부파일)             │              │
│   └──────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 프로젝트 디렉토리 구조

```
zk-note/
├── convex/                        # Convex 백엔드
│   ├── schema.ts                  # DB 스키마 정의
│   ├── auth.ts                    # 인증 설정 (Google OAuth)
│   ├── notes.ts                   # 노트 queries/mutations
│   ├── tasks.ts                   # 태스크 queries/mutations
│   ├── folders.ts                 # 폴더 queries/mutations
│   └── attachments.ts             # 파일 업로드 queries/mutations
│
├── src/
│   ├── routes/                    # TanStack Start 파일 기반 라우팅
│   │   ├── __root.tsx             # 루트 레이아웃 (auth guard, theme)
│   │   ├── index.tsx              # / → /daily redirect
│   │   ├── daily.tsx              # 오늘의 Daily Note
│   │   ├── notes/
│   │   │   ├── index.tsx          # 노트 목록
│   │   │   └── $noteId.tsx        # 노트 에디터
│   │   ├── tasks/
│   │   │   └── index.tsx          # 태스크 뷰 (리스트/캘린더)
│   │   ├── calendar/
│   │   │   └── index.tsx          # 캘린더 뷰
│   │   └── auth/
│   │       └── callback.tsx       # Google OAuth 콜백
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx       # 3-패널 레이아웃
│   │   │   ├── Sidebar.tsx        # 좌측: 폴더 트리 + 네비
│   │   │   └── RightPanel.tsx     # 우측: 백링크, 태스크 패널
│   │   │
│   │   ├── editor/
│   │   │   ├── NoteEditor.tsx     # TipTap 에디터 래퍼
│   │   │   ├── extensions/
│   │   │   │   ├── TaskNode.tsx   # 커스텀: 태스크 임베드 노드
│   │   │   │   ├── WikiLink.tsx   # 커스텀: [[노트]] 링크
│   │   │   │   ├── SlashCommands.tsx  # / 커맨드 팔레트
│   │   │   │   └── index.ts       # 확장 모음 export
│   │   │   └── toolbar/
│   │   │       └── EditorToolbar.tsx
│   │   │
│   │   ├── sidebar/
│   │   │   ├── FolderTree.tsx     # 폴더/노트 트리
│   │   │   ├── FolderItem.tsx
│   │   │   └── NoteItem.tsx
│   │   │
│   │   ├── tasks/
│   │   │   ├── TaskList.tsx       # 태스크 리스트 뷰
│   │   │   ├── TaskItem.tsx       # 태스크 아이템 (토글)
│   │   │   ├── TaskDetail.tsx     # 태스크 상세 (토글 안 내용)
│   │   │   └── TaskCreateForm.tsx
│   │   │
│   │   └── calendar/
│   │       ├── CalendarView.tsx   # 월간 캘린더
│   │       └── DayPanel.tsx       # 날짜 클릭 시 사이드패널
│   │
│   ├── lib/
│   │   ├── markdown.ts            # TipTap ↔ Markdown 직렬화
│   │   ├── export.ts              # .md 파일 Export
│   │   └── utils.ts
│   │
│   └── styles/
│       └── globals.css            # Tailwind + 테마 변수
│
├── public/
├── package.json
└── app.config.ts                  # TanStack Start 설정
```

---

## 3. Convex 데이터베이스 스키마

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),        // Google OAuth sub
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    settings: v.optional(v.object({
      theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
      dailyNoteTemplate: v.optional(v.string()),  // 마크다운 템플릿
    })),
  }).index("by_token", ["tokenIdentifier"]),

  folders: defineTable({
    userId: v.id("users"),
    name: v.string(),
    parentId: v.optional(v.id("folders")),  // null = 루트
    sortOrder: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_parent", ["userId", "parentId"]),

  notes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),                     // 표준 마크다운 문자열
    folderId: v.optional(v.id("folders")),
    tags: v.array(v.string()),
    linkedNoteIds: v.array(v.id("notes")),   // 백링크 계산용
    isDailyNote: v.boolean(),
    dailyNoteDate: v.optional(v.string()),   // YYYY-MM-DD (Daily Note만)
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
      v.literal("done")
    ),
    detail: v.optional(v.string()),          // 마크다운 (토글 상세 내용)
    dueDate: v.optional(v.string()),         // YYYY-MM-DD
    tags: v.array(v.string()),
    linkedNoteId: v.optional(v.id("notes")), // 생성된 노트 참조
    linkedDate: v.optional(v.string()),      // Daily Note 날짜
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
    storageId: v.id("_storage"),             // Convex File Storage
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

| 확장 | 용도 | 출처 |
|---|---|---|
| `StarterKit` | 기본 마크다운 요소 전체 | TipTap 공식 |
| `Markdown` | ProseMirror ↔ Markdown 직렬화 | `tiptap-markdown` |
| `CodeBlockLowlight` | 신택스 하이라이트 | TipTap 공식 |
| `Mathematics` | LaTeX/KaTeX 렌더링 | TipTap 공식 |
| `Image` | 이미지 업로드/렌더링 | TipTap 공식 |
| `TaskList` | `- [ ]` 체크리스트 (베이스) | TipTap 공식 |
| **`TaskNode`** | Convex 태스크 DB 연동 토글 | **커스텀** |
| **`WikiLink`** | `[[노트이름]]` 양방향 링크 | **커스텀** |
| **`SlashCommands`** | `/` 커맨드 팔레트 | **커스텀** |

### 5.2 커스텀 TaskNode 명세

```typescript
// TaskNode: Convex 태스크와 1:1 연결된 에디터 노드
Node.create({
  name: "taskNode",
  group: "block",
  atom: true,  // 내부 편집 없음 (React 컴포넌트로 렌더)

  addAttributes() {
    return {
      taskId: { default: null },    // Convex Task ID
      title: { default: "" },       // 초기 제목 (로딩 전 표시용)
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
      noteId: { default: null },    // 저장 시 resolve된 ID
    };
  },
  // 렌더: 파란색 링크, hover 시 미리보기 팝오버
  // 마크다운: [[노트이름]] 그대로 직렬화 (표준 wikilink 포맷)
});
```

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
      Google OAuth 버튼 클릭
        │
        ▼
      Google 인증 완료 → /auth/callback
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

```
TipTap (ProseMirror JSON)
    ↕ tiptap-markdown 라이브러리
마크다운 문자열 (Convex 저장)

커스텀 노드 직렬화:
  TaskNode   → "- [ ] 제목 <!-- task:abc123 -->"
  WikiLink   → "[[노트이름]]"
  CodeBlock  → "```언어\n코드\n```"
  Math       → "$$ 수식 $$"
  Image      → "![alt](convex-storage-url)"
```

**Export 흐름**:
```
Convex content (마크다운) → HTML comment 제거 → .md 파일 다운로드
```

---

## 11. 주요 기술 결정 및 근거

| 결정 | 선택 | 근거 |
|---|---|---|
| 에디터 내부 포맷 | ProseMirror JSON (메모리) + Markdown (저장) | 편집 성능 vs 호환성 분리 |
| 태스크-노트 연결 | HTML 주석으로 taskId 보존 | 마크다운 호환성 깨지지 않으면서 ID 유지 |
| 실시간 동기화 | Convex WebSocket | 별도 구현 없이 실시간 반영 |
| 파일 스토리지 | Convex File Storage | 백엔드 단일화 |
| 스타일링 | Tailwind CSS + CSS 변수 | 다크모드 테마 전환 용이 |
| 상태 관리 | Convex useQuery 전역 (별도 상태 라이브러리 불필요) | Convex가 서버 상태 관리 대체 |

---

## 12. 미결 설계 이슈

1. **태스크 마크다운 직렬화**: `<!-- task:id -->` HTML 주석 방식이 모든 마크다운 뷰어에서 안전하게 무시되는지 검증 필요
2. **양방향 링크 resolve**: `[[노트이름]]` → noteId 변환 시점 (저장 시 vs 렌더 시)
3. **Daily Note 템플릿**: 사용자 정의 템플릿 저장 위치 (users.settings vs 별도 템플릿 테이블)
4. **태스크 상세(detail) 에디터**: 별도 TipTap 인스턴스 vs 간단한 textarea
5. **오프라인 Phase 2**: IndexedDB 캐시 레이어 설계

---

## 13. 다음 단계

1. `/sc:implement` — Phase 1 MVP 구현 시작
   - 권장 순서: Convex 스키마 → 인증 → 에디터 기본 → Daily Note → 태스크 연동
2. 기술 검증 (PoC 먼저 필요한 것들):
   - `tiptap-markdown` 라이브러리가 커스텀 노드 직렬화를 지원하는지
   - TanStack Start + Convex 통합 설정
