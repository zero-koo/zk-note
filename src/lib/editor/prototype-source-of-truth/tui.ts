/**
 * PROTOTYPE — 버릴 껍데기. 로직은 roundtrip.ts 에 있고 그쪽만 살아남는다.
 *
 * 한 화면에 현재 케이스의 전체 상태를 그리고, 키 하나로 케이스를 옮겨 다닌다.
 * 스크롤로 흘려보내지 않는 게 요점 — 매 프레임 화면을 지우고 다시 그린다.
 */

import { Window } from "happy-dom";

// TipTap 은 DOM 을 요구한다. import 전에 전역을 깔아야 한다.
const w = new Window({ url: "http://localhost" });

// Node 26 의 navigator 는 getter 전용이라 대입이 안 된다 — defineProperty 로 덮는다.
function put(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    writable: true,
    configurable: true,
  });
}

put("window", w);
put("document", w.document);
put("navigator", w.navigator);
put("HTMLElement", w.HTMLElement);
put("Element", w.Element);
put("Node", w.Node);
put("DocumentFragment", w.DocumentFragment);
put("getComputedStyle", w.getComputedStyle.bind(w));

const { roundTrip, firstDivergence, verdict, CASES } = await import("./roundtrip.js");

const B = "\x1b[1m";
const D = "\x1b[2m";
const R = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

let index = 0;
let showJson = false;

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((l) => `${prefix}${l}`)
    .join("\n");
}

function render(): void {
  console.clear();
  const c = CASES[index];
  const r = roundTrip(c.markdown);

  const all = CASES.map((x) => verdict(roundTrip(x.markdown)));
  const lost = all.filter((v) => v === "손실").length;

  console.log(
    `${B}노트 source of truth — A안 왕복 검증${R}  ${D}(${index + 1}/${CASES.length})${R}`,
  );
  console.log(
    `${D}마크다운 → TipTap → 마크다운. 원문이 그대로 돌아오는가.${R}`,
  );
  console.log(
    `내용 손실 ${lost === 0 ? GREEN : RED}${lost}${R}/${CASES.length}건\n`,
  );

  console.log(`${B}${c.name}${R}`);
  console.log(`${D}${c.why}${R}\n`);

  console.log(`${B}입력${R}`);
  console.log(indent(c.markdown, "  ") + "\n");

  if (r.error !== null) {
    console.log(`${RED}${B}에러${R}`);
    console.log(indent(r.error, "  ") + "\n");
  } else {
    console.log(`${B}출력${R}`);
    console.log(indent(r.output || "(빈 문자열)", "  ") + "\n");
  }

  const v = verdict(r);
  if (v === "보존") {
    console.log(`${GREEN}${B}보존${R} — 바이트까지 원문 그대로\n`);
  } else {
    const d = firstDivergence(r);
    console.log(
      v === "서식변형"
        ? `${YELLOW}${B}서식변형${R} — 내용은 온전, 파일만 재포맷된다`
        : `${RED}${B}손실${R} — 내용이 사라졌다`,
    );
    if (d) {
      console.log(`  ${D}첫 어긋남 ${d.line}번째 줄${R}`);
      console.log(`  ${D}기대${R} ${d.expected}`);
      console.log(`  ${D}실제${R} ${YELLOW}${d.actual}${R}`);
    }
    console.log();
  }

  if (showJson) {
    console.log(`${B}ProseMirror JSON${R}`);
    console.log(indent(JSON.stringify(r.doc, null, 2), "  ").slice(0, 2000));
    console.log();
  }

  console.log(
    `${D}[j] 다음  [k] 이전  [d] JSON ${showJson ? "숨기기" : "보기"}  [a] 전체 요약  [q] 종료${R}`,
  );
}

function mark(v: string): string {
  if (v === "보존") return `${GREEN}보존  ${R}`;
  if (v === "서식변형") return `${YELLOW}서식변형${R}`;
  return `${RED}손실  ${R}`;
}

function summary(): void {
  console.clear();
  console.log(`${B}전체 케이스 요약${R}`);
  console.log(
    `${D}보존 = 바이트까지 동일 · 서식변형 = 내용은 온전, 파일만 재포맷 · 손실 = 내용이 사라짐${R}\n`,
  );
  const counts = { 보존: 0, 서식변형: 0, 손실: 0 };
  for (const c of CASES) {
    const r = roundTrip(c.markdown);
    const v = verdict(r);
    counts[v]++;
    console.log(`  ${mark(v)}  ${c.name}`);
    if (v !== "보존") {
      const d = firstDivergence(r);
      if (r.error) console.log(`            ${D}에러: ${r.error}${R}`);
      else if (d)
        console.log(`            ${D}${d.expected}  →  ${YELLOW}${d.actual}${R}`);
    }
  }
  console.log(
    `\n  ${GREEN}보존 ${counts.보존}${R} · ${YELLOW}서식변형 ${counts.서식변형}${R} · ${RED}손실 ${counts.손실}${R} / ${CASES.length}`,
  );
  console.log(`\n${D}아무 키나 누르면 돌아갑니다. [q] 종료${R}`);
}

let inSummary = false;

// `--summary` 로 부르면 한 번 찍고 끝난다. 답만 필요할 때.
if (process.argv.includes("--summary")) {
  summary();
  process.exit(0);
}

// `--dump` 는 실패한 케이스의 입출력 원문을 그대로 토해낸다. 원인 추적용.
if (process.argv.includes("--dump")) {
  for (const c of CASES) {
    const r = roundTrip(c.markdown);
    if (r.lossless && !r.error) continue;
    console.log(`── ${c.name} ${"─".repeat(Math.max(0, 50 - c.name.length))}`);
    console.log("입력:\n" + JSON.stringify(r.input));
    console.log("출력:\n" + JSON.stringify(r.output));
    if (r.error) console.log("에러: " + r.error);
    console.log("JSON:\n" + JSON.stringify(r.doc));
    console.log();
  }
  process.exit(0);
}

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (key: string) => {
  if (key === "q" || key === "") {
    console.clear();
    process.exit(0);
  }
  if (inSummary) {
    inSummary = false;
    render();
    return;
  }
  if (key === "j") index = (index + 1) % CASES.length;
  else if (key === "k") index = (index - 1 + CASES.length) % CASES.length;
  else if (key === "d") showJson = !showJson;
  else if (key === "a") {
    inSummary = true;
    summary();
    return;
  }
  render();
});

render();
