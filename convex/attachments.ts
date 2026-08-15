// convex/attachments.ts
//
// Every function here is declared with the 소유자 wrapper (ADR-0002), so the
// owner is already resolved when a handler body starts. Attachments are
// reached through `getOwned`, which also covers the 노트 an attachment hangs
// off — handed in as an argument on create and on listByNote.
//
// Attachment handling using Convex File Storage.
// Upload flow:
//   1. Client calls generateUploadUrl() to get a short-lived upload URL.
//   2. Client PUTs the file to that URL (returns a storageId).
//   3. Client calls create() with the storageId + metadata.

import { v } from "convex/values";
import { getOwned, ownerMutation, ownerQuery } from "./owner";

/** List all 첨부 for a given 노트. */
export const listByNote = ownerQuery({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const note = await getOwned(ctx, "notes", args.noteId);
    return await ctx.db
      .query("attachments")
      .withIndex("by_note", (q) => q.eq("noteId", note._id))
      .collect();
  },
});

/**
 * Generate a short-lived upload URL for Convex File Storage.
 * The client uploads directly to this URL, then calls create() with the
 * returned storageId.
 */
export const generateUploadUrl = ownerMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Save 첨부 metadata after a successful file upload. */
export const create = ownerMutation({
  args: {
    noteId: v.id("notes"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const note = await getOwned(ctx, "notes", args.noteId);

    // The stored file is a reference argument too. Files have no 소유자 field,
    // so the attachment records pointing at one are what establish who it
    // belongs to: refuse a file another 소유자 has already claimed. Otherwise a
    // 소유자 could hang someone else's file off their own 노트 and then delete
    // it through `remove` below.
    //
    // Residual gap: a file uploaded but not yet attached is claimed by nobody,
    // so this cannot catch it. Closing that needs an owner recorded at upload
    // time, which is a schema change beyond ADR-0002 — storage ids are
    // unguessable, so the exposure is a caller re-using an id they already saw.
    const claimants = await ctx.db
      .query("attachments")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .collect();
    if (claimants.some((claim) => claim.userId !== ctx.owner._id)) {
      throw new Error("Not found or not owned: _storage");
    }

    return await ctx.db.insert("attachments", {
      userId: ctx.owner._id,
      noteId: note._id,
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      size: args.size,
      createdAt: Date.now(),
    });
  },
});

/**
 * Delete a 첨부 record and its stored file.
 */
export const remove = ownerMutation({
  args: { attachmentId: v.id("attachments") },
  handler: async (ctx, args) => {
    const attachment = await getOwned(ctx, "attachments", args.attachmentId);
    await ctx.storage.delete(attachment.storageId);
    await ctx.db.delete(attachment._id);
  },
});
