/// <reference types="vite/client" />
/**
 * 첨부 ownership. An attachment hangs off a 노트, so the note handed in as an
 * argument must belong to the 소유자 as well as the 첨부 itself
 * (ADR-0002).
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
    const storageId = await ctx.storage.store(new Blob(["남의 파일"]));
    const attachment = await ctx.db.insert("attachments", {
      userId: them,
      noteId: note,
      storageId,
      fileName: "secret.png",
      mimeType: "image/png",
      size: 9,
      createdAt: now,
    });
    return { note, attachment, storageId };
  });
  return { t, asMe: t.withIdentity({ tokenIdentifier: ME }), theirs };
}

describe("attachments", () => {
  it("refuses an upload URL to a caller with no identity", async () => {
    const { t } = await setup();

    await expect(t.mutation(api.attachments.generateUploadUrl, {})).rejects.toThrow(
      /not authenticated/i,
    );
  });

  it("refuses to list 첨부 on another 소유자's 노트", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.query(api.attachments.listByNote, { noteId: theirs.note }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to attach to another 소유자's 노트", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.attachments.create, {
        noteId: theirs.note,
        storageId: theirs.storageId,
        fileName: "mine.png",
        mimeType: "image/png",
        size: 4,
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  // The stored file is a reference handed in as an argument just like the 노트
  // is. Without this check a 소유자 can plant another 소유자's file on their own
  // 노트 and then delete it through the ordinary remove path.
  it("refuses to attach another 소유자's stored file to my own 노트", async () => {
    const { asMe, theirs } = await setup();
    const myNote = (await asMe.mutation(api.notes.create, {
      title: "내 노트",
      content: "안녕",
    })) as Id<"notes">;

    await expect(
      asMe.mutation(api.attachments.create, {
        noteId: myNote,
        storageId: theirs.storageId,
        fileName: "stolen.png",
        mimeType: "image/png",
        size: 9,
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("keeps another 소유자's stored file intact when that attach is refused", async () => {
    const { t, asMe, theirs } = await setup();
    const myNote = (await asMe.mutation(api.notes.create, {
      title: "내 노트",
      content: "안녕",
    })) as Id<"notes">;

    await expect(
      asMe.mutation(api.attachments.create, {
        noteId: myNote,
        storageId: theirs.storageId,
        fileName: "stolen.png",
        mimeType: "image/png",
        size: 9,
      }),
    ).rejects.toThrow();

    const stillStored = await t.run(async (ctx) =>
      ctx.storage.getUrl(theirs.storageId),
    );
    expect(stillStored).not.toBeNull();
  });

  it("refuses to remove another 소유자's 첨부", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.attachments.remove, { attachmentId: theirs.attachment }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("leaves another 소유자's 첨부 untouched after a refused remove", async () => {
    const { t, asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.attachments.remove, { attachmentId: theirs.attachment }),
    ).rejects.toThrow();

    const still = await t.run(async (ctx) => ctx.db.get(theirs.attachment));
    expect(still).not.toBeNull();
  });

  it("attaches to my own 노트 and lists it back, with no userId argument", async () => {
    const { t, asMe } = await setup();
    const myNote = (await asMe.mutation(api.notes.create, {
      title: "내 노트",
      content: "안녕",
    })) as Id<"notes">;
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["내 파일"])),
    );

    await asMe.mutation(api.attachments.create, {
      noteId: myNote,
      storageId,
      fileName: "mine.png",
      mimeType: "image/png",
      size: 4,
    });

    const listed = await asMe.query(api.attachments.listByNote, {
      noteId: myNote,
    });
    expect(listed.map((a) => a.fileName)).toEqual(["mine.png"]);
  });
});
