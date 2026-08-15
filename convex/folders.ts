// convex/folders.ts
//
// Every function here is declared with the 소유자 wrapper (ADR-0002), so the
// owner is already resolved when a handler body starts. Folders are reached
// through `getOwned`, which refuses another 소유자's folder — including the
// `parentId` handed in as an argument, so a folder cannot be filed under
// someone else's.

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  getOwned,
  getOwnedIfPresent,
  ownerMutation,
  ownerQuery,
} from "./owner";
import { LIST_LIMIT } from "./limits";

/**
 * List all 폴더 for the 소유자.
 * Returns a flat list; the client builds the tree from parentId relationships.
 */
export const list = ownerQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", ctx.owner._id))
      .take(LIST_LIMIT);
  },
});

/** Create a new 폴더. */
export const create = ownerMutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("folders")),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getOwnedIfPresent(ctx, "folders", args.parentId);

    return await ctx.db.insert("folders", {
      userId: ctx.owner._id,
      name: args.name,
      parentId: args.parentId,
      sortOrder: args.sortOrder ?? Date.now(),
    });
  },
});

/** Rename a 폴더. */
export const rename = ownerMutation({
  args: {
    folderId: v.id("folders"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const folder = await getOwned(ctx, "folders", args.folderId);
    await ctx.db.patch(folder._id, { name: args.name });
  },
});

/** Move a 폴더 to a new parent (or to root when parentId is undefined). */
export const move = ownerMutation({
  args: {
    folderId: v.id("folders"),
    parentId: v.optional(v.id("folders")),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const folder = await getOwned(ctx, "folders", args.folderId);
    await getOwnedIfPresent(ctx, "folders", args.parentId);

    const patch: Partial<Doc<"folders">> = { parentId: args.parentId };
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    await ctx.db.patch(folder._id, patch);
  },
});

/**
 * Delete a 폴더 by ID.
 * NOTE: does NOT cascade-delete child folders or notes; the caller is
 * responsible for moving or removing children first.
 */
export const remove = ownerMutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    const folder = await getOwned(ctx, "folders", args.folderId);
    await ctx.db.delete(folder._id);
  },
});
