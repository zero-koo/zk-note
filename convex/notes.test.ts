/// <reference types="vite/client" />
/**
 * 노트 ownership. Reads are scoped to the 소유자, and every function
 * that touches a note by id — or that is handed a 폴더 / 노트 reference as an
 * argument — refuses documents belonging to someone else (ADR-0002).
 */
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

const ME = "google|owner";
const THEM = "google|other";

async function setup() {
  const t = convexTest(schema, modules);
  const theirs = await t.run(async (ctx) => {
    await ctx.db.insert("users", { tokenIdentifier: ME });
    const them = await ctx.db.insert("users", { tokenIdentifier: THEM });
    const now = Date.now();
    const folder = await ctx.db.insert("folders", {
      userId: them,
      name: "남의 폴더",
      sortOrder: 0,
    });
    const note = await ctx.db.insert("notes", {
      userId: them,
      title: "남의 노트",
      content: "비밀",
      tags: [],
      linkedNoteIds: [],
      isDailyNote: false,
      updatedAt: now,
      createdAt: now,
    });
    return { folder, note };
  });
  return { t, asMe: t.withIdentity({ tokenIdentifier: ME }), theirs };
}

describe("notes", () => {
  it("creates a 노트 owned by the 소유자, with no userId argument", async () => {
    const { asMe } = await setup();

    await asMe.mutation(api.notes.create, { title: "내 노트", content: "안녕" });

    const mine = await asMe.query(api.notes.list, {});
    expect(mine.map((n) => n.title)).toEqual(["내 노트"]);
  });

  it("lists only the 소유자's 노트", async () => {
    const { asMe } = await setup();

    const mine = await asMe.query(api.notes.list, {});

    expect(mine).toEqual([]);
  });

  it("searches only the 소유자's 노트", async () => {
    const { asMe } = await setup();
    await asMe.mutation(api.notes.create, {
      title: "내 노트",
      content: "비밀",
    });

    const hits = await asMe.query(api.notes.search, { query: "비밀" });

    expect(hits.map((n) => n.title)).toEqual(["내 노트"]);
  });

  it("treats an empty tag as no filter when searching", async () => {
    const { asMe } = await setup();
    await asMe.mutation(api.notes.create, {
      title: "내 노트",
      content: "비밀",
      tags: ["일기"],
    });

    const hits = await asMe.query(api.notes.search, { query: "비밀", tag: "" });

    expect(hits.map((n) => n.title)).toEqual(["내 노트"]);
  });

  it("filters search results by tag when one is given", async () => {
    const { asMe } = await setup();
    await asMe.mutation(api.notes.create, {
      title: "태그 있는 노트",
      content: "비밀",
      tags: ["일기"],
    });
    await asMe.mutation(api.notes.create, {
      title: "태그 없는 노트",
      content: "비밀",
    });

    const hits = await asMe.query(api.notes.search, {
      query: "비밀",
      tag: "일기",
    });

    expect(hits.map((n) => n.title)).toEqual(["태그 있는 노트"]);
  });

  it("refuses to get another 소유자's 노트", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.query(api.notes.get, { noteId: theirs.note }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to update another 소유자's 노트", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.notes.update, {
        noteId: theirs.note,
        title: "가로챈 제목",
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to remove another 소유자's 노트", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.notes.remove, { noteId: theirs.note }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to create a 노트 inside another 소유자's 폴더", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.notes.create, {
        title: "내 노트",
        content: "안녕",
        folderId: theirs.folder,
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to move my 노트 into another 소유자's 폴더", async () => {
    const { asMe, theirs } = await setup();
    const mine = (await asMe.mutation(api.notes.create, {
      title: "내 노트",
      content: "안녕",
    })) as Id<"notes">;

    await expect(
      asMe.mutation(api.notes.update, {
        noteId: mine,
        folderId: theirs.folder,
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to link my 노트 to another 소유자's 노트", async () => {
    const { asMe, theirs } = await setup();
    const mine = (await asMe.mutation(api.notes.create, {
      title: "내 노트",
      content: "안녕",
    })) as Id<"notes">;

    await expect(
      asMe.mutation(api.notes.update, {
        noteId: mine,
        linkedNoteIds: [theirs.note],
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to list 노트 in another 소유자's 폴더", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.query(api.notes.list, { folderId: theirs.folder }),
    ).rejects.toThrow(/not found or not owned/i);
  });
});
