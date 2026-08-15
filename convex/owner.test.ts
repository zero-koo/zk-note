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

const modules = import.meta.glob("./**/*.*s");

// Globs every depth, not just the top level, so a function tucked into
// convex/notes/list.ts cannot slip past the audit below.
const sources = import.meta.glob("./**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The public function builders — using one directly bypasses the wrapper. */
const RAW_BUILDERS = ["query", "mutation", "action", "httpAction"];

/**
 * Does this file declare Convex functions with the raw builders, i.e. bypass
 * the 소유자 wrapper? `import type { QueryCtx } from "./_generated/server"`
 * does not count — only value imports do. The specifier is matched loosely so
 * that "../_generated/server" from a subdirectory counts too.
 */
function declaresRawFunctions(src: string): boolean {
  const importRe =
    /import\s+(type\s+)?\{([^}]*)\}\s+from\s+"[^"]*_generated\/server"/g;
  for (const match of src.matchAll(importRe)) {
    if (match[1]) continue; // `import type { ... }`
    const bound = match[2]
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/)[0].trim());
    if (bound.some((name) => RAW_BUILDERS.includes(name))) return true;
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
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        tokenIdentifier: "google|owner",
      });
      await ctx.db.insert("folders", {
        userId: ownerId,
        name: "내 폴더",
        sortOrder: 0,
      });
    });

    const folders = await t
      .withIdentity({ tokenIdentifier: "google|owner" })
      .query(api.folders.list, {});

    expect(folders.map((f) => f.name)).toEqual(["내 폴더"]);
  });

  it("scopes results to the 소유자, never another's", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const mine = await ctx.db.insert("users", {
        tokenIdentifier: "google|owner",
      });
      const theirs = await ctx.db.insert("users", {
        tokenIdentifier: "google|other",
      });
      await ctx.db.insert("folders", {
        userId: mine,
        name: "내 폴더",
        sortOrder: 0,
      });
      await ctx.db.insert("folders", {
        userId: theirs,
        name: "남의 폴더",
        sortOrder: 0,
      });
    });

    const folders = await t
      .withIdentity({ tokenIdentifier: "google|owner" })
      .query(api.folders.list, {});

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
