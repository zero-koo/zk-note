/**
 * 노트 source of truth A/B — A안 검증용 순수 모듈.
 *
 * 질문: 마크다운을 원본으로 두었을 때(ARCHITECTURE §10.1 Option A),
 * TaskNode·WikiLink 같은 커스텀 노드를 품은 마크다운이 TipTap 을 왕복하고도
 * 그대로 남는가? 새면 "마크다운이 source of truth" 라는 A안의 전제가 깨진다.
 *
 * 이 파일은 TUI 를 모른다 — 순수 함수만 노출하므로 A안이 채택되면 그대로
 * 실코드로 옮길 수 있다. 화면은 tui.ts 가 담당하고 버려진다.
 */

import { Editor, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";

/*
 * 파싱 경로에 대한 사실 (라이브러리 소스 확인):
 * tiptap-markdown 은 markdown-it 으로 **HTML 을 만든 뒤** TipTap 의 HTML 파서에
 * 넘긴다. 따라서 커스텀 인라인 문법은 markdown-it 규칙만으로는 부족하고
 * **렌더러까지** 붙여 HTML 을 내보내야 노드가 살아남는다.
 * StarterKit v3 에는 Image·Table 이 없어 따로 등록해야 한다.
 */

/* ── 커스텀 노드 ──────────────────────────────────────────────────────────
 * ARCHITECTURE §10 이 정한 직렬화 형태:
 *   TaskNode → "- [ ] 제목 <!-- task:abc123 -->"
 *   WikiLink → "[[노트이름]]"
 * TaskNode 는 TaskItem 에 taskId 속성을 얹어 HTML 주석으로 실어 나른다.
 */

/** `[[노트이름]]` — 노트 간 링크. 저장 시 원문 그대로 복원돼야 한다. */
const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      target: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
        getAttrs: (el: HTMLElement) => ({ target: el.getAttribute("data-target") ?? "" }),
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-link": "",
        "data-target": node.attrs.target,
      }),
      `[[${node.attrs.target}]]`,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void },
          node: { attrs: { target: string } },
        ) {
          state.write(`[[${node.attrs.target}]]`);
        },
        parse: {
          setup(md: MarkdownIt) {
            md.inline.ruler.before("link", "wiki_link", wikiLinkRule);
            // 렌더러가 있어야 HTML 로 나가고, 그래야 TipTap 이 노드로 되읽는다.
            md.renderer.rules.wiki_link = (tokens, idx) => {
              const target = tokens[idx].attrGet?.("target") ?? "";
              const esc = md.utils.escapeHtml(target);
              return `<span data-wiki-link data-target="${esc}">[[${esc}]]</span>`;
            };
          },
        },
      },
    };
  },
});

/** markdown-it 중 이 프로토타입이 실제로 쓰는 부분만. */
interface MarkdownIt {
  inline: { ruler: { before: (a: string, b: string, c: unknown) => void } };
  renderer: {
    rules: Record<
      string,
      ((tokens: Array<{ attrGet?: (n: string) => string | null }>, idx: number) => string) | undefined
    >;
  };
  utils: { escapeHtml: (s: string) => string };
}

/** markdown-it inline rule: `[[target]]` → wikiLink 토큰. */
function wikiLinkRule(
  state: {
    src: string;
    pos: number;
    posMax: number;
    push: (t: string, tag: string, n: number) => { attrs?: unknown[][]; markup?: string };
  },
  silent: boolean,
): boolean {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
  if (state.src.charCodeAt(start + 1) !== 0x5b) return false;

  const close = state.src.indexOf("]]", start + 2);
  if (close === -1 || close > state.posMax) return false;

  const target = state.src.slice(start + 2, close);
  if (target.includes("[") || target.includes("]") || target.includes("\n")) return false;

  if (!silent) {
    const token = state.push("wiki_link", "span", 0);
    token.attrs = [["target", target]];
  }
  state.pos = close + 2;
  return true;
}

/**
 * TaskItem + taskId. 태스크 DB 와 노트 체크박스를 잇는 id 를 HTML 주석으로
 * 마크다운에 실어 나른다 — 다른 뷰어에서는 안 보이고, 우리 파서는 되읽는다.
 */
const TaskNode = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      taskId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-task-id"),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.taskId ? { "data-task-id": String(attrs.taskId) } : {},
      },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: {
            write: (s: string) => void;
            renderContent: (n: unknown) => void;
            out?: string;
          },
          node: { attrs: { checked?: boolean; taskId?: string | null } },
        ) {
          state.write(node.attrs.checked ? "[x] " : "[ ] ");
          state.renderContent(node);
          // renderContent 가 줄바꿈까지 찍은 뒤이므로, 주석은 그 앞에 끼워 넣는다.
          if (node.attrs.taskId && typeof state.out === "string") {
            state.out = state.out.replace(
              /\n*$/,
              (tail) => ` <!-- task:${node.attrs.taskId} -->${tail}`,
            );
          }
        },
        parse: {
          // markdown-it(html:true) 이 남긴 주석을 data 속성으로 옮기고 지운다.
          // 중첩 리스트가 있으면 바깥 li 가 안쪽 주석을 삼키므로,
          // "자기 소유의" 체크박스와 주석만 본다.
          updateDOM(element: HTMLElement) {
            for (const item of [...element.querySelectorAll("li")]) {
              const input = [...item.getElementsByTagName("input")].find(
                (i) => i.closest("li") === item,
              );
              if (!input) continue;
              item.setAttribute("data-type", "taskItem");
              item.setAttribute("data-checked", String(input.checked));
              input.remove();

              // 중첩 리스트를 잠시 떼어내고 자기 내용에서만 주석을 찾는다.
              const nested = [...item.children].filter(
                (c) => c.tagName === "UL" || c.tagName === "OL",
              );
              const parked = nested.map((n) => {
                n.remove();
                return n;
              });

              const m = item.innerHTML.match(/<!--\s*task:([A-Za-z0-9_-]+)\s*-->/);
              if (m) {
                item.setAttribute("data-task-id", m[1]);
                item.innerHTML = item.innerHTML
                  .replace(m[0], "")
                  .replace(/\s+(<\/)/g, "$1")
                  .replace(/\s+$/, "");
              }
              for (const n of parked) item.appendChild(n);
            }
          },
        },
      },
    };
  },
});

/* ── 공개 인터페이스 ─────────────────────────────────────────────────────── */

export interface RoundTrip {
  /** 넣은 마크다운. */
  input: string;
  /** 파싱 후 다시 직렬화해서 나온 마크다운. */
  output: string;
  /** 중간 표현 (ProseMirror JSON). */
  doc: unknown;
  /** 입력과 출력이 바이트로 같은가. */
  lossless: boolean;
  /**
   * 출력을 다시 파싱했을 때 문서가 같은가.
   * lossless=false 인데 stable=true 라면 **데이터는 온전하고 서식만 바뀐 것**이다.
   * 저장할 때마다 파일이 재포맷되지만 내용은 잃지 않는다.
   * stable=false 면 진짜 손실이다.
   */
  stable: boolean;
  /** 파싱·직렬화 중 터진 에러. 있으면 나머지 필드는 믿을 수 없다. */
  error: string | null;
}

export type Verdict = "보존" | "서식변형" | "손실";

export function verdict(r: RoundTrip): Verdict {
  if (r.error !== null || !r.stable) return "손실";
  return r.lossless ? "보존" : "서식변형";
}

let _editor: Editor | null = null;

/** 헤드리스 에디터. DOM 전역은 호출자가 먼저 깔아둬야 한다(happy-dom). */
function editor(): Editor {
  if (_editor) return _editor;
  _editor = new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskNode,
      WikiLink,
      Image,
      TableKit,
      Markdown.configure({ html: true, transformPastedText: false }),
    ],
    content: "",
  });
  return _editor;
}

/** 마크다운 → ProseMirror JSON → 마크다운. A안의 전제를 그대로 시험한다. */
export function roundTrip(markdown: string): RoundTrip {
  try {
    const e = editor();
    e.commands.setContent(markdown);
    const doc = e.getJSON();
    const output = (
      e.storage as unknown as { markdown: { getMarkdown: () => string } }
    ).markdown.getMarkdown();

    // 두 번째 왕복: 출력이 같은 문서로 되읽히는가 (내용이 남았는가).
    e.commands.setContent(output);
    const doc2 = e.getJSON();

    return {
      input: markdown,
      output,
      doc,
      lossless: normalise(markdown) === normalise(output),
      stable: JSON.stringify(doc) === JSON.stringify(doc2),
      error: null,
    };
  } catch (err) {
    return {
      input: markdown,
      output: "",
      doc: null,
      lossless: false,
      stable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 비교 전 정규화. 줄 끝 공백과 문서 끝 개행 차이는 손실이 아니라고 본다 —
 * 그 정도는 저장 직전에 정리하면 되고, A안의 성패를 가르는 지점이 아니다.
 */
function normalise(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/** 첫 번째로 어긋나는 줄. 없으면 null. */
export function firstDivergence(
  r: RoundTrip,
): { line: number; expected: string; actual: string } | null {
  const a = normalise(r.input).split("\n");
  const b = normalise(r.output).split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return { line: i + 1, expected: a[i] ?? "(없음)", actual: b[i] ?? "(없음)" };
    }
  }
  return null;
}

/* ── 시험 대상 ───────────────────────────────────────────────────────────
 * 종이 위에서 판단이 안 서는 것들만 모았다. 평범한 문단은 넣지 않았다.
 */

export interface Case {
  name: string;
  /** 이게 왜 어려운 경우인지. */
  why: string;
  markdown: string;
}

export const CASES: Case[] = [
  {
    name: "태스크 + id 주석",
    why: "§10 의 핵심 장치. 주석이 살아 돌아와야 노트 체크박스와 태스크 DB 가 이어진다",
    markdown: "- [ ] 장보기 <!-- task:abc123 -->",
  },
  {
    name: "체크된 태스크",
    why: "체크 상태와 id 가 함께 보존되는가",
    markdown: "- [x] 끝난 일 <!-- task:done42 -->",
  },
  {
    name: "태스크 여러 개",
    why: "id 가 섞이거나 첫 항목에만 붙지 않는가",
    markdown: [
      "- [ ] 첫째 <!-- task:t1 -->",
      "- [x] 둘째 <!-- task:t2 -->",
      "- [ ] 셋째 <!-- task:t3 -->",
    ].join("\n"),
  },
  {
    name: "위키링크 (한글)",
    why: "[[노트이름]] 이 링크로 파싱됐다가 원문으로 복원되는가",
    markdown: "어제 쓴 [[회의록]] 을 보자.",
  },
  {
    name: "위키링크 (공백·특수문자)",
    why: "공백이 들어간 제목에서 규칙이 깨지지 않는가",
    markdown: "[[2026년 8월 회고]] 참고.",
  },
  {
    name: "위키링크 여러 개 한 줄",
    why: "인라인 규칙이 첫 개만 먹고 마는 흔한 실패",
    markdown: "[[가]] 와 [[나]] 를 비교.",
  },
  {
    name: "링크 아닌 대괄호",
    why: "오탐. 배열 표기가 링크로 잡아먹히면 안 된다",
    markdown: "코드에서 `arr[[0]]` 같은 표기.",
  },
  {
    name: "코드블록 안의 태스크 주석",
    why: "오탐. 코드 안의 문자열이 태스크로 해석되면 데이터가 오염된다",
    markdown: ["```md", "- [ ] 예시 <!-- task:notreal -->", "```"].join("\n"),
  },
  {
    name: "코드블록 (언어 지정)",
    why: "언어 태그가 보존되는가",
    markdown: ["```ts", "const x: number = 1;", "```"].join("\n"),
  },
  {
    name: "중첩 리스트 안의 태스크",
    why: "들여쓰기가 유지되면서 id 도 남는가",
    markdown: ["- 상위", "  - [ ] 하위 <!-- task:nested1 -->"].join("\n"),
  },
  {
    name: "수식",
    why: "§10 이 약속한 $$ 형태가 문단으로 뭉개지지 않는가",
    markdown: "$$ E = mc^2 $$",
  },
  {
    name: "이미지",
    why: "첨부 URL 이 그대로 남는가",
    markdown: "![스크린샷](https://example.convex.cloud/storage/abc)",
  },
  {
    name: "표",
    why: "StarterKit 에 표가 없으면 통째로 사라진다 — 조용한 데이터 손실",
    markdown: ["| 항목 | 값 |", "| --- | --- |", "| 가 | 1 |"].join("\n"),
  },
  {
    name: "강조 + 인라인 코드",
    why: "가장 흔한 서식. 여기서 새면 나머지는 볼 것도 없다",
    markdown: "**굵게** 와 *기울임* 과 `코드`.",
  },
  {
    name: "인용 + 리스트 혼합",
    why: "블록 중첩에서 구조가 평평해지지 않는가",
    markdown: ["> 인용문", ">", "> - 항목"].join("\n"),
  },
  {
    name: "한글 + 마크다운 특수문자",
    why: "이스케이프가 덧붙어 원문이 오염되지 않는가",
    markdown: "가격은 100_000원이고 * 표시는 각주다.",
  },
];
