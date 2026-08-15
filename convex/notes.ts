// convex/notes.ts
//
// Every function here is declared with the 소유자 wrapper (ADR-0002), so the
// owner is already resolved when a handler body starts. Notes are reached
// through `getOwned`, which also covers the references handed in as arguments
// — the 폴더 a note belongs to, and the 노트 it links to.
//
// NOTE — content field dependency: all read/write paths here treat
// notes.content as the markdown source of truth (§10.1 Option A, settled in
// ADR-0003).

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  getOwned,
  getOwnedIfPresent,
  ownerMutation,
  ownerQuery,
} from "./owner";

/** List 노트 for the 소유자, optionally filtered by 폴더. */
export const list = ownerQuery({
  args: {
    folderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    if (args.folderId !== undefined) {
      await getOwned(ctx, "folders", args.folderId);
      return await ctx.db
        .query("notes")
        .withIndex("by_folder", (q) =>
          q.eq("userId", ctx.owner._id).eq("folderId", args.folderId),
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("notes")
      .withIndex("by_updated", (q) => q.eq("userId", ctx.owner._id))
      .order("desc")
      .collect();
  },
});

/** Get a single 노트 by ID. */
export const get = ownerQuery({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    return await getOwned(ctx, "notes", args.noteId);
  },
});

/** Create a new 노트. */
export const create = ownerMutation({
  args: {
    title: v.string(),
    content: v.string(),
    folderId: v.optional(v.id("folders")),
    tags: v.optional(v.array(v.string())),
    isDailyNote: v.optional(v.boolean()),
    dailyNoteDate: v.optional(v.string()), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    await getOwnedIfPresent(ctx, "folders", args.folderId);

    const now = Date.now();
    return await ctx.db.insert("notes", {
      userId: ctx.owner._id,
      title: args.title,
      content: args.content,
      folderId: args.folderId,
      tags: args.tags ?? [],
      linkedNoteIds: [],
      isDailyNote: args.isDailyNote ?? false,
      dailyNoteDate: args.dailyNoteDate,
      updatedAt: now,
      createdAt: now,
    });
  },
});

/** Update 노트 content and/or title. Bumps updatedAt. */
// `isDailyNote` and `dailyNoteDate` are intentionally NOT updatable here —
// daily-note identity is immutable after creation (see REQUIREMENTS §5.2).
export const update = ownerMutation({
  args: {
    noteId: v.id("notes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    tags: v.optional(v.array(v.string())),
    linkedNoteIds: v.optional(v.array(v.id("notes"))),
  },
  handler: async (ctx, args) => {
    const note = await getOwned(ctx, "notes", args.noteId);
    await getOwnedIfPresent(ctx, "folders", args.folderId);
    for (const linkedNoteId of args.linkedNoteIds ?? []) {
      await getOwned(ctx, "notes", linkedNoteId);
    }

    const patch: Partial<Doc<"notes">> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.content !== undefined) patch.content = args.content;
    if (args.folderId !== undefined) patch.folderId = args.folderId;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.linkedNoteIds !== undefined)
      patch.linkedNoteIds = args.linkedNoteIds;
    await ctx.db.patch(note._id, patch);
  },
});

/** Delete a 노트 by ID. */
export const remove = ownerMutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const note = await getOwned(ctx, "notes", args.noteId);
    await ctx.db.delete(note._id);
  },
});

/**
 * Full-text search over 노트 content, scoped to the 소유자.
 * Optionally filter by a single tag (Convex search index supports one
 * filter field per query call).
 */
export const search = ownerQuery({
  args: {
    query: v.string(),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("notes")
      .withSearchIndex("search_notes", (q) =>
        q.search("content", args.query).eq("userId", ctx.owner._id),
      )
      .collect();

    // If a tag filter was requested, apply it in memory (Convex search index
    // supports array field filter only as an existence check, not element match).
    // An empty string counts as "no filter", as it always has.
    const tag = args.tag;
    if (tag) {
      return results.filter((n) => n.tags.includes(tag));
    }
    return results;
  },
});
