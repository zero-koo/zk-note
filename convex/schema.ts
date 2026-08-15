// convex/schema.ts
//
// NOTE — notes.content field is PROVISIONAL (§10.1 "Option A: markdown = source of truth").
// If the editor PoC selects Option B (prosemirror-sync), this field and the
// search_notes index will be redesigned: the note body moves to component
// snapshots+steps, and content becomes a derived snapshot used only for search.
// Do NOT build critical logic around this field until the PoC decision is made.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(), // Google OAuth sub
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    settings: v.optional(
      v.object({
        theme: v.union(
          v.literal("light"),
          v.literal("dark"),
          v.literal("system"),
        ),
        dailyNoteTemplate: v.optional(v.string()), // markdown template
      }),
    ),
  }).index("by_token", ["tokenIdentifier"]),

  folders: defineTable({
    userId: v.id("users"),
    name: v.string(),
    parentId: v.optional(v.id("folders")), // null = root
    sortOrder: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_parent", ["userId", "parentId"]),

  notes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    // PROVISIONAL (§10.1 Option A): standard markdown string as source of truth.
    // Under Option B (prosemirror-sync), this becomes a snapshot-derived field.
    content: v.string(),
    folderId: v.optional(v.id("folders")),
    tags: v.array(v.string()),
    linkedNoteIds: v.array(v.id("notes")), // used for backlink calculation
    isDailyNote: v.boolean(),
    dailyNoteDate: v.optional(v.string()), // YYYY-MM-DD (Daily Notes only)
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_folder", ["userId", "folderId"])
    .index("by_daily_date", ["userId", "isDailyNote", "dailyNoteDate"])
    .index("by_updated", ["userId", "updatedAt"])
    .searchIndex("search_notes", {
      searchField: "content",
      filterFields: ["userId", "tags"],
    }),

  tasks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
    ),
    detail: v.optional(v.string()), // markdown (toggle detail content)
    dueDate: v.optional(v.string()), // YYYY-MM-DD
    tags: v.array(v.string()),
    linkedNoteId: v.optional(v.id("notes")), // note reference
    linkedDate: v.optional(v.string()), // Daily Note date
    sortOrder: v.number(),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["userId", "status"])
    .index("by_due_date", ["userId", "dueDate"])
    .index("by_linked_date", ["userId", "linkedDate"])
    .index("by_linked_note", ["linkedNoteId"]),

  attachments: defineTable({
    userId: v.id("users"),
    noteId: v.id("notes"),
    storageId: v.id("_storage"), // Convex File Storage
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_note", ["noteId"])
    // Stored files carry no 소유자 of their own — the attachment record is the
    // only thing that says who a file belongs to. This index lets a create
    // refuse a storageId another 소유자 has already claimed (ADR-0002).
    .index("by_storage", ["storageId"]),
});
