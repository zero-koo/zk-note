// convex/attachments.ts
//
// ⚠️ SECURITY TODO (tracked: Task 4 — gated on auth PoC, see auth.ts):
// These are STUBS with NO authorization. `listByNote` takes a caller-supplied
// `noteId` with no ownership check — any caller can list another note's
// attachments. `create` takes a caller-supplied `userId`/`noteId` without
// verifying the caller owns the parent note. `remove` deletes by ID without
// confirming the caller owns the attachment record.
// Before exposing to real multi-user data: derive the user from
// ctx.auth.getUserIdentity() (ignore the userId arg on reads) and on every
// patch/delete do ctx.db.get(id) + throw if doc.userId !== me._id.
//
// Attachment handling using Convex File Storage.
// Upload flow:
//   1. Client calls generateUploadUrl() to get a short-lived upload URL.
//   2. Client PUTs the file to that URL (returns a storageId).
//   3. Client calls create() with the storageId + metadata.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** List all attachments for a given note. */
export const listByNote = query({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("attachments")
      .withIndex("by_note", (q) => q.eq("noteId", args.noteId))
      .collect();
  },
});

/**
 * Generate a short-lived upload URL for Convex File Storage.
 * The client uploads directly to this URL, then calls create() with the
 * returned storageId.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Save attachment metadata after a successful file upload. */
export const create = mutation({
  args: {
    userId: v.id("users"),
    noteId: v.id("notes"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("attachments", {
      userId: args.userId,
      noteId: args.noteId,
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      size: args.size,
      createdAt: Date.now(),
    });
  },
});

/**
 * Delete an attachment record and its stored file.
 */
export const remove = mutation({
  args: { attachmentId: v.id("attachments") },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) return;
    await ctx.storage.delete(attachment.storageId);
    await ctx.db.delete(args.attachmentId);
  },
});
