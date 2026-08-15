/// <reference types="vite/client" />
/**
 * 첨부 ownership. An attachment hangs off a 노트, so the note handed in as an
 * argument must belong to the 소유자 as well as the 첨부 itself
 * (ADR-0002).
 */
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedAttachment, seedNote, twoOwners } from "./fixtures.test";

async function setup() {
  const { t, asMe, them } = await twoOwners();
  const note = await seedNote(t, them);
  const { attachment, storageId } = await seedAttachment(t, them, note);
  return { t, asMe, theirs: { note, attachment, storageId } };
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
