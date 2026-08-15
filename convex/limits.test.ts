/// <reference types="vite/client" />
/**
 * List queries stay bounded (Convex guidelines: never return an unbounded
 * collection). Each case seeds past the cap and asserts the query stops there.
 */
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import { twoOwners } from "./fixtures.test";
import { ATTACHMENT_LIMIT, LIST_LIMIT, SEARCH_LIMIT } from "./limits";

describe("list caps", () => {
  it("노트 목록은 LIST_LIMIT 에서 멈춘다", async () => {
    const { t, asMe } = await twoOwners();
    const me = await asMe.query(api.auth.currentUser, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < LIST_LIMIT + 5; i++) {
        await ctx.db.insert("notes", {
          userId: me!._id,
          title: `노트 ${i}`,
          content: "",
          tags: [],
          linkedNoteIds: [],
          isDailyNote: false,
          updatedAt: i,
        });
      }
    });

    const notes = await asMe.query(api.notes.list, {});
    expect(notes).toHaveLength(LIST_LIMIT);
  });

  it("노트 검색은 SEARCH_LIMIT 에서 멈춘다", async () => {
    const { t, asMe } = await twoOwners();
    const me = await asMe.query(api.auth.currentUser, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < SEARCH_LIMIT + 5; i++) {
        await ctx.db.insert("notes", {
          userId: me!._id,
          title: `노트 ${i}`,
          content: "회의록 내용",
          tags: [],
          linkedNoteIds: [],
          isDailyNote: false,
          updatedAt: i,
        });
      }
    });

    const found = await asMe.query(api.notes.search, { query: "회의록" });
    expect(found).toHaveLength(SEARCH_LIMIT);
  });

  it("태스크 목록은 LIST_LIMIT 에서 멈춘다", async () => {
    const { t, asMe } = await twoOwners();
    const me = await asMe.query(api.auth.currentUser, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < LIST_LIMIT + 5; i++) {
        await ctx.db.insert("tasks", {
          userId: me!._id,
          title: `태스크 ${i}`,
          status: "todo",
          tags: [],
          sortOrder: i,
          updatedAt: i,
        });
      }
    });

    const tasks = await asMe.query(api.tasks.list, {});
    expect(tasks).toHaveLength(LIST_LIMIT);
  });

  it("폴더 목록은 LIST_LIMIT 에서 멈춘다", async () => {
    const { t, asMe } = await twoOwners();
    const me = await asMe.query(api.auth.currentUser, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < LIST_LIMIT + 5; i++) {
        await ctx.db.insert("folders", {
          userId: me!._id,
          name: `폴더 ${i}`,
          sortOrder: i,
        });
      }
    });

    const folders = await asMe.query(api.folders.list, {});
    expect(folders).toHaveLength(LIST_LIMIT);
  });

  it("첨부 목록은 ATTACHMENT_LIMIT 에서 멈춘다", async () => {
    const { t, asMe } = await twoOwners();
    const me = await asMe.query(api.auth.currentUser, {});
    const noteId = await asMe.mutation(api.notes.create, {
      title: "내 노트",
      content: "",
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < ATTACHMENT_LIMIT + 5; i++) {
        const storageId = await ctx.storage.store(new Blob([`파일 ${i}`]));
        await ctx.db.insert("attachments", {
          userId: me!._id,
          noteId,
          storageId,
          fileName: `파일 ${i}.png`,
          mimeType: "image/png",
          size: 4,
        });
      }
    });

    const attachments = await asMe.query(api.attachments.listByNote, { noteId });
    expect(attachments).toHaveLength(ATTACHMENT_LIMIT);
  });
});
