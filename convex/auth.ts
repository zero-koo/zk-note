// convex/auth.ts
//
// UNRESOLVED DECISION — Convex Auth vs custom users table:
//
// ARCHITECTURE §3 defines a custom `users` table keyed by `tokenIdentifier`
// (Google OAuth sub). There are two paths to wire this:
//
//   Option A (custom table, current stubs):
//     Use `ctx.auth.getUserIdentity()` (Convex built-in JWT verification) to
//     read the raw identity, then look up / upsert the `users` table manually.
//     Gives full control over the users record; requires a server action or
//     mutation to perform the upsert on first login. This is what the stubs
//     below implement.
//
//   Option B (convex-auth library):
//     Use the `@convex-dev/auth` package, which manages its own session /
//     account tables and provides React hooks (useAuthActions, etc.).
//     Simpler OAuth wiring, but the built-in user model may conflict with the
//     custom `users` table schema above, requiring a migration or adapter layer.
//
// DECISION GATE: Tauri OAuth PoC (ARCHITECTURE §8.3 / §13). Until the
// desktop OAuth callback pattern (deep-link vs localhost) is validated, do NOT
// fully commit to either option. When the PoC is done, pick one and delete the
// other path.
//
// For now, stubs use Option A (getUserIdentity + custom table lookup).

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Returns the currently authenticated user record from the `users` table,
 * or null if the caller is not authenticated.
 *
 * Uses Option A: raw getUserIdentity() + custom table lookup by_token.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    return user;
  },
});

/**
 * Upsert the authenticated user into the `users` table.
 * Call this once after a successful OAuth login to ensure the record exists.
 *
 * IMPORTANT: In a full implementation this should be triggered server-side
 * (e.g. via a Convex Auth webhook or http action) rather than exposed as a
 * public mutation. For now it is a plain mutation guarded by identity check.
 */
export const upsertUser = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name ?? existing.name,
        email: args.email ?? existing.email,
        avatarUrl: args.avatarUrl ?? existing.avatarUrl,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: args.name,
      email: args.email,
      avatarUrl: args.avatarUrl,
    });
  },
});
