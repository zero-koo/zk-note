# AGENTS.md

ZK-Note 레포에서 에이전트가 참고하는 규약 파일.

## Agent skills

### Issue tracker

이슈는 GitHub Issues(`zero-koo/zk-note`)에서 `gh` CLI 로 관리한다. 외부 PR 은 triage 대상이 아니다(이슈만 처리). 자세한 내용은 `docs/agents/issue-tracker.md`.

### Triage labels

canonical 5개 역할(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`)을 이름 그대로 라벨 문자열로 쓴다. 자세한 내용은 `docs/agents/triage-labels.md`.

### Domain docs

단일 컨텍스트 — 루트 `CONTEXT.md` 하나 + `docs/adr/`. 자세한 내용은 `docs/agents/domain.md`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
