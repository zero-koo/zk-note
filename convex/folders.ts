// convex/folders.ts
//
// ⚠️ SECURITY TODO (tracked: Task 4 — gated on auth PoC, see auth.ts):
// These are STUBS with NO authorization. `list` takes a caller-supplied
// `userId` with no verification — any caller can enumerate another user's
// folders. `rename`, `move`, and `remove` patch/delete by ID without
// confirming the caller owns the document.
// Before exposing to real multi-user data: derive the user from
// ctx.auth.getUserIdentity() (ignore the userId arg on reads) and on every
// patch/delete do ctx.db.get(id) + throw if doc.userId !== me._id.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * List all folders for a user.
 * Returns a flat list; the client builds the tree from parentId relationships.
 */
export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/** Create a new folder. */
export const create = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    parentId: v.optional(v.id("folders")),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("folders", {
      userId: args.userId,
      name: args.name,
      parentId: args.parentId,
      sortOrder: args.sortOrder ?? Date.now(),
    });
  },
});

/** Rename a folder. */
export const rename = mutation({
  args: {
    folderId: v.id("folders"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.folderId, { name: args.name });
  },
});

/** Move a folder to a new parent (or to root when parentId is undefined). */
export const move = mutation({
  args: {
    folderId: v.id("folders"),
    parentId: v.optional(v.id("folders")),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { parentId: args.parentId };
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    await ctx.db.patch(args.folderId, patch);
  },
});

/**
 * Delete a folder by ID.
 * NOTE: does NOT cascade-delete child folders or notes; the caller is
 * responsible for moving or removing children first.
 */
export const remove = mutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.folderId);
  },
});
