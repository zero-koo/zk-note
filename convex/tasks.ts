// convex/tasks.ts
//
// Every function here is declared with the 소유자 wrapper (ADR-0002), so the
// owner is already resolved when a handler body starts. Tasks are reached
// through `getOwned`, which also covers the 노트 a task points at.
//
// Task model per REQUIREMENTS §6.4:
//   title, status (todo|in_progress|done), detail (markdown), dueDate,
//   tags, linkedNoteId, linkedDate (Daily Note date), sortOrder.

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  getOwned,
  getOwnedIfPresent,
  ownerMutation,
  ownerQuery,
} from "./owner";

const taskStatus = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
);

/**
 * List 태스크 for the 소유자. Supports optional filter by status
 * and/or linkedDate (Daily Note date, YYYY-MM-DD). Falls back to a full
 * owner scan when no specific index can be used.
 *
 * Sort contract: results are NOT sorted by `sortOrder` server-side — there is
 * no `by_sort_order` index. The client is responsible for sorting by sortOrder
 * after receiving results. TODO: add index if server-side ordering is needed.
 */
export const list = ownerQuery({
  args: {
    status: v.optional(taskStatus),
    linkedDate: v.optional(v.string()), // YYYY-MM-DD
    dueDate: v.optional(v.string()), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const ownerId = ctx.owner._id;

    if (args.status !== undefined) {
      const status = args.status;
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) =>
          q.eq("userId", ownerId).eq("status", status),
        )
        .collect();
    }
    if (args.linkedDate !== undefined) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_linked_date", (q) =>
          q.eq("userId", ownerId).eq("linkedDate", args.linkedDate),
        )
        .collect();
    }
    if (args.dueDate !== undefined) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_due_date", (q) =>
          q.eq("userId", ownerId).eq("dueDate", args.dueDate),
        )
        .collect();
    }
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", ownerId))
      .collect();
  },
});

/** Create a new 태스크. */
export const create = ownerMutation({
  args: {
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
    await getOwnedIfPresent(ctx, "notes", args.linkedNoteId);

    const now = Date.now();
    return await ctx.db.insert("tasks", {
      userId: ctx.owner._id,
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

/** Update 태스크 status only (checkbox toggle path). */
export const updateStatus = ownerMutation({
  args: {
    taskId: v.id("tasks"),
    status: taskStatus,
  },
  handler: async (ctx, args) => {
    const task = await getOwned(ctx, "tasks", args.taskId);
    await ctx.db.patch(task._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/** Update 태스크 detail fields (title, detail, dueDate, tags). */
export const update = ownerMutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    detail: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await getOwned(ctx, "tasks", args.taskId);

    const patch: Partial<Doc<"tasks">> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.detail !== undefined) patch.detail = args.detail;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    await ctx.db.patch(task._id, patch);
  },
});

/** Delete a 태스크 by ID. */
export const remove = ownerMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await getOwned(ctx, "tasks", args.taskId);
    await ctx.db.delete(task._id);
  },
});
