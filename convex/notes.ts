// convex/notes.ts
//
// ⚠️ SECURITY TODO (tracked: Task 4 — gated on auth PoC, see auth.ts):
// These are STUBS with NO authorization. `list` and `search` take a
// caller-supplied `userId` with no verification — any caller can read
// another user's notes. `update` and `remove` patch/delete by ID
// without confirming the caller owns the document.
// Before exposing to real multi-user data: derive the user from
// ctx.auth.getUserIdentity() (ignore the userId arg on reads) and on every
// patch/delete do ctx.db.get(id) + throw if doc.userId !== me._id.
//
// NOTE — content field dependency: all read/write paths here treat
// notes.content as the markdown source of truth (§10.1 Option A).
// If the editor PoC picks Option B (prosemirror-sync), this file will
// be updated once that decision is made.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** List notes for the authenticated user, optionally filtered by folder. */
export const list = query({
  args: {
    userId: v.id("users"),
    folderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    if (args.folderId !== undefined) {
      return await ctx.db
        .query("notes")
        .withIndex("by_folder", (q) =>
          q.eq("userId", args.userId).eq("folderId", args.folderId),
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("notes")
      .withIndex("by_updated", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

/** Get a single note by ID. */
export const get = query({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.noteId);
  },
});

/** Create a new note. */
export const create = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
    folderId: v.optional(v.id("folders")),
    tags: v.optional(v.array(v.string())),
    isDailyNote: v.optional(v.boolean()),
    dailyNoteDate: v.optional(v.string()), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("notes", {
      userId: args.userId,
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

/** Update note content and/or title. Bumps updatedAt. */
// `isDailyNote` and `dailyNoteDate` are intentionally NOT updatable here —
// daily-note identity is immutable after creation (see REQUIREMENTS §5.2).
export const update = mutation({
  args: {
    noteId: v.id("notes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    tags: v.optional(v.array(v.string())),
    linkedNoteIds: v.optional(v.array(v.id("notes"))),
  },
  handler: async (ctx, args) => {
    const { noteId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.content !== undefined) patch.content = fields.content;
    if (fields.folderId !== undefined) patch.folderId = fields.folderId;
    if (fields.tags !== undefined) patch.tags = fields.tags;
    if (fields.linkedNoteIds !== undefined)
      patch.linkedNoteIds = fields.linkedNoteIds;
    await ctx.db.patch(noteId, patch);
  },
});

/** Delete a note by ID. */
export const remove = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.noteId);
  },
});

/**
 * Full-text search over note content, filtered by userId.
 * Optionally filter by a single tag (Convex search index supports one
 * filter field per query call).
 */
export const search = query({
  args: {
    userId: v.id("users"),
    query: v.string(),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let searchQuery = ctx.db
      .query("notes")
      .withSearchIndex("search_notes", (q) => {
        const base = q.search("content", args.query).eq("userId", args.userId);
        return base;
      });

    const results = await searchQuery.collect();

    // If a tag filter was requested, apply it in memory (Convex search index
    // supports array field filter only as an existence check, not element match).
    if (args.tag) {
      return results.filter((n) => n.tags.includes(args.tag!));
    }
    return results;
  },
});
