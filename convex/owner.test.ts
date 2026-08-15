/// <reference types="vite/client" />
/**
 * The owner module is the single pass-through point for every backend
 * function (ADR-0002). These tests cover the wrapper itself: what happens
 * before any handler body starts running.
 *
 * `folders.list` is used as the vehicle — it is an ordinary wrapped function,
 * so exercising it exercises the wrapper. Nothing here reaches into the
 * module's internals.
 */
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { seedFolder, twoOwners } from "./fixtures.test";

const modules = import.meta.glob("./**/*.*s");

// Globs every depth, not just the top level, so a function tucked into
// convex/notes/list.ts cannot slip past the audit below.
const sources = import.meta.glob("./**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * Does this file declare Convex functions itself, i.e. bypass the 소유자
 * wrapper?
 *
 * The rule is deliberately blunt: **any value import from `_generated/server`
 * counts.** A wrapped module gets its builders from `./owner` and needs
 * nothing from there at runtime, so a value import is already the tell. Naming
 * the builders instead (`query`, `mutation`, …) would mean maintaining a list
 * that silently misses whatever Convex adds next — `internalMutation`,
 * `httpAction`, a namespace import — which is exactly how this check leaked
 * before. Type-only imports are free; they generate no code.
 *
 * Matching is on source text, so it accepts either quote style, any depth of
 * relative path, and clauses spanning lines. `[^;]` keeps a match from
 * smearing across a statement boundary into an unrelated import.
 */
function declaresRawFunctions(src: string): boolean {
  const importRe =
    /import\s+(type\s+)?([^;]*?)\s+from\s+['"][^'"]*_generated\/server['"]/g;

  for (const match of src.matchAll(importRe)) {
    if (match[1]) continue; // `import type { ... } from ...`

    // `import { type A, type B } from ...` also generates no code.
    const named = match[2].match(/^\{([\s\S]*)\}$/);
    if (named) {
      const bindings = named[1]
        .split(",")
        .map((binding) => binding.trim())
        .filter(Boolean);
      if (bindings.length > 0 && bindings.every((b) => /^type\s/.test(b))) {
        continue;
      }
    }
    return true;
  }
  return false;
}

const backendFiles = Object.keys(sources).filter(
  (path) =>
    !path.endsWith(".test.ts") &&
    !path.startsWith("./_generated/") &&
    path !== "./schema.ts",
);

describe("owner resolution", () => {
  it("rejects a caller with no identity", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.folders.list, {})).rejects.toThrow(
      /not authenticated/i,
    );
  });

  it("rejects an authenticated caller who has no 사용자 record yet", async () => {
    const t = convexTest(schema, modules);
    const firstLogin = t.withIdentity({ tokenIdentifier: "google|newcomer" });

    await expect(firstLogin.query(api.folders.list, {})).rejects.toThrow(
      /no user record/i,
    );
  });

  it("runs the handler with the 소유자 resolved once a record exists", async () => {
    const { t, asMe, me } = await twoOwners();
    await seedFolder(t, me, "내 폴더");

    const folders = await asMe.query(api.folders.list, {});

    expect(folders.map((f) => f.name)).toEqual(["내 폴더"]);
  });

  it("scopes results to the 소유자, never another's", async () => {
    const { t, asMe, me, them } = await twoOwners();
    await seedFolder(t, me, "내 폴더");
    await seedFolder(t, them, "남의 폴더");

    const folders = await asMe.query(api.folders.list, {});

    expect(folders.map((f) => f.name)).toEqual(["내 폴더"]);
  });
});

describe("the wrapper is structural, not a convention", () => {
  // Guards ADR-0002's core claim: a function that skips the wrapper shows up
  // in one search. If someone adds a backend function with the raw `query` or
  // `mutation` builder, this fails.
  it("declares every backend function through the 소유자 wrapper", () => {
    const bypassing = backendFiles.filter((path) =>
      declaresRawFunctions(sources[path]),
    );

    expect(bypassing.sort()).toEqual(["./auth.ts", "./owner.ts"]);
  });

  // Keeps the check above honest: these two files really do use the raw
  // builders, so the detector above is matching something rather than
  // silently returning false for every file.
  it("sees the raw builders where they genuinely are", () => {
    expect(declaresRawFunctions(sources["./auth.ts"])).toBe(true);
    expect(declaresRawFunctions(sources["./owner.ts"])).toBe(true);
    expect(declaresRawFunctions(sources["./notes.ts"])).toBe(false);
  });

  // The audit is only as good as its detector, and the detector reads source
  // text. These pin the ways a bypass could dress itself up.
  it.each([
    ['double quotes', 'import { mutation } from "./_generated/server";'],
    ['single quotes', "import { mutation } from './_generated/server';"],
    ['a subdirectory', 'import { query } from "../_generated/server";'],
    ['an internal builder', 'import { internalMutation } from "./_generated/server";'],
    ['a namespace import', 'import * as server from "./_generated/server";'],
    ['a renamed binding', 'import { mutation as m } from "./_generated/server";'],
    ['a multiline clause', 'import {\n  query,\n  mutation,\n} from "./_generated/server";'],
  ])("catches a bypass declared with %s", (_label, src) => {
    expect(declaresRawFunctions(src)).toBe(true);
  });

  it.each([
    ['a type-only import', 'import type { QueryCtx } from "./_generated/server";'],
    ['inline type bindings', 'import { type QueryCtx } from "./_generated/server";'],
    ['the wrapper module', 'import { ownerQuery } from "./owner";'],
  ])("does not cry wolf over %s", (_label, src) => {
    expect(declaresRawFunctions(src)).toBe(false);
  });

  it("does not smear across statements to accuse an innocent file", () => {
    const src = [
      'import { v } from "convex/values";',
      'import { ownerQuery } from "./owner";',
      'import type { QueryCtx } from "./_generated/server";',
    ].join("\n");

    expect(declaresRawFunctions(src)).toBe(false);
  });

  it("covers the whole backend, not an empty file list", () => {
    expect(backendFiles.sort()).toEqual([
      "./attachments.ts",
      "./auth.ts",
      "./folders.ts",
      "./notes.ts",
      "./owner.ts",
      "./tasks.ts",
    ]);
  });
});

describe("the two documented wrapper exceptions", () => {
  it("answers 'nobody' rather than throwing when logged out, so the UI can gate", async () => {
    const t = convexTest(schema, modules);

    expect(await t.query(api.auth.currentUser, {})).toBeNull();
  });

  it("creates the 사용자 record that owner resolution needs on first login", async () => {
    const t = convexTest(schema, modules);
    const firstLogin = t.withIdentity({ tokenIdentifier: "google|newcomer" });

    // Before: every wrapped function is closed to them.
    await expect(firstLogin.query(api.folders.list, {})).rejects.toThrow(
      /no user record/i,
    );

    await firstLogin.mutation(api.auth.upsertUser, { name: "새 사용자" });

    // After: the wrapper resolves them and the backend opens up.
    expect(await firstLogin.query(api.folders.list, {})).toEqual([]);
  });
});
