/// <reference types="vite/client" />
/**
 * Shared fixtures for the backend tests — the one place that knows what
 * "두 소유자, 하나는 남" looks like.
 *
 * WHY THE `.test.ts` NAME WHEN THERE ARE NO TESTS HERE:
 * Convex bundles every file under convex/ into the deployment except
 * `*.test.ts`. A plain `convex/fixtures.ts` importing `convex-test` therefore
 * ships the test library to production. Naming it `*.test.ts` keeps it out of
 * the deployment; `vitest.config.ts` excludes it from suite collection so the
 * runner doesn't fail looking for tests inside it. Importing it from the real
 * test files works either way.
 *
 * The document literals live here on purpose: adding a required field to a
 * table should break one fixture, not three.
 */
import { convexTest } from "convex-test";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

// Resolved relative to convex/, the same as in each test file.
const modules = import.meta.glob("./**/*.*s");

export const ME = "google|owner";
export const THEM = "google|other";

type TestConvex = ReturnType<typeof convexTest>;

/**
 * A backend seeded with two 소유자 — the caller and a stranger — and nothing
 * else. `asMe` is the caller's handle; `them` owns everything a test wants to
 * be refused.
 */
export async function twoOwners() {
  const t = convexTest(schema, modules);
  const { me, them } = await t.run(async (ctx) => ({
    me: await ctx.db.insert("users", { tokenIdentifier: ME }),
    them: await ctx.db.insert("users", { tokenIdentifier: THEM }),
  }));

  return {
    t,
    asMe: t.withIdentity({ tokenIdentifier: ME }),
    me,
    them,
  };
}

/** Seed a 폴더 owned by `owner`. */
export async function seedFolder(
  t: TestConvex,
  owner: Id<"users">,
  name = "남의 폴더",
): Promise<Id<"folders">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("folders", { userId: owner, name, sortOrder: 0 }),
  );
}

/** Seed a 노트 owned by `owner`. */
export async function seedNote(
  t: TestConvex,
  owner: Id<"users">,
  { title = "남의 노트", content = "비밀" } = {},
): Promise<Id<"notes">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("notes", {
      userId: owner,
      title,
      content,
      tags: [],
      linkedNoteIds: [],
      isDailyNote: false,
      updatedAt: now,
      createdAt: now,
    });
  });
}

/** Seed a 태스크 owned by `owner`. */
export async function seedTask(
  t: TestConvex,
  owner: Id<"users">,
  title = "남의 태스크",
): Promise<Id<"tasks">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      userId: owner,
      title,
      status: "todo",
      tags: [],
      sortOrder: 0,
      updatedAt: now,
      createdAt: now,
    });
  });
}

/** Seed a stored file plus the 첨부 record that claims it for `owner`. */
export async function seedAttachment(
  t: TestConvex,
  owner: Id<"users">,
  noteId: Id<"notes">,
): Promise<{ attachment: Id<"attachments">; storageId: Id<"_storage"> }> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["남의 파일"]));
    const attachment = await ctx.db.insert("attachments", {
      userId: owner,
      noteId,
      storageId,
      fileName: "secret.png",
      mimeType: "image/png",
      size: 9,
      createdAt: Date.now(),
    });
    return { attachment, storageId };
  });
}
