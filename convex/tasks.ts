// convex/tasks.ts
//
// ⚠️ SECURITY TODO (tracked: Task 4 — gated on auth PoC, see auth.ts):
// These are STUBS with NO authorization. `list` takes a caller-supplied
// `userId` with no verification — any caller can read another user's tasks.
// `updateStatus`, `update`, and `remove` patch/delete by ID without
// confirming the caller owns the document.
// Before exposing to real multi-user data: derive the user from
// ctx.auth.getUserIdentity() (ignore the userId arg on reads) and on every
// patch/delete do ctx.db.get(id) + throw if doc.userId !== me._id.
//
// Task model per REQUIREMENTS §6.4:
//   title, status (todo|in_progress|done), detail (markdown), dueDate,
//   tags, linkedNoteId, linkedDate (Daily Note date), sortOrder.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const taskStatus = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
);

/**
 * List tasks for a user. Supports optional filter by status and/or linkedDate
 * (Daily Note date, YYYY-MM-DD). Falls back to a full user scan when no
 * specific index can be used.
 *
 * Sort contract: results are NOT sorted by `sortOrder` server-side — there is
 * no `by_sort_order` index. The client is responsible for sorting by sortOrder
 * after receiving results. TODO: add index if server-side ordering is needed.
 */
export const list = query({
  args: {
    userId: v.id("users"),
    status: v.optional(taskStatus),
    linkedDate: v.optional(v.string()), // YYYY-MM-DD
    dueDate: v.optional(v.string()), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    if (args.status !== undefined) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) =>
          q.eq("userId", args.userId).eq("status", args.status!),
        )
        .collect();
    }
    if (args.linkedDate !== undefined) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_linked_date", (q) =>
          q.eq("userId", args.userId).eq("linkedDate", args.linkedDate),
        )
        .collect();
    }
    if (args.dueDate !== undefined) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_due_date", (q) =>
          q.eq("userId", args.userId).eq("dueDate", args.dueDate),
        )
        .collect();
    }
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/** Create a new task. */
export const create = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    status: v.optional(taskStatus),
    detail: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    linkedNoteId: v.optional(v.id("notes")),
    linkedDate: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      userId: args.userId,
      title: args.title,
      status: args.status ?? "todo",
      detail: args.detail,
      dueDate: args.dueDate,
      tags: args.tags ?? [],
      linkedNoteId: args.linkedNoteId,
      linkedDate: args.linkedDate,
      sortOrder: args.sortOrder ?? now, // use timestamp as default sort
      updatedAt: now,
      createdAt: now,
    });
  },
});

/** Update task status only (checkbox toggle path). */
export const updateStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: taskStatus,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/** Update task detail fields (title, detail, dueDate, tags). */
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    detail: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { taskId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.detail !== undefined) patch.detail = fields.detail;
    if (fields.dueDate !== undefined) patch.dueDate = fields.dueDate;
    if (fields.tags !== undefined) patch.tags = fields.tags;
    if (fields.sortOrder !== undefined) patch.sortOrder = fields.sortOrder;
    await ctx.db.patch(taskId, patch);
  },
});

/** Delete a task by ID. */
export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.taskId);
  },
});
