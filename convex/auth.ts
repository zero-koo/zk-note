// convex/auth.ts
//
// OPEN DECISION — Convex Auth vs custom users table.
// (Unblocked as of ADR-0004; still unmade. See the gate note below.)
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
// GATE STATUS — LIFTED, CHOICE NOT YET MADE.
// The old gate was the Tauri OAuth PoC: "until the desktop callback pattern
// (deep-link vs localhost) is validated, do NOT commit to either option."
// That PoC is done and ADR-0004 settled the pattern: loopback server, no
// custom scheme. ADR-0004 is explicit that this does NOT decide A vs B —
// "두 갈래 모두 루프백으로 수렴하므로, 이 결정은 auth Option A/B 결정을
// 기다릴 필요가 없다." So the blocker is gone and the choice is now simply
// open. Nothing here is waiting on evidence any more.
//
// What ADR-0004 pins for whichever option is picked:
//   Option A — Google applies its Desktop-client rules directly, and loopback
//     is then the only permitted redirect. No extra work beyond this file.
//   Option B — `callbacks.redirect` MUST be overridden here. Convex Auth's
//     default prefix-matches SITE_URL and would reject an arbitrary port like
//     http://127.0.0.1:51004. That override is an open-redirect surface, so it
//     is a whitelist ("127.0.0.1, any port") and nothing looser. It does not
//     exist yet.
//
// For now, stubs use Option A (getUserIdentity + custom table lookup).
//
// ─────────────────────────────────────────────────────────────────────────
// THE ONLY TWO FUNCTIONS THAT MAY SKIP THE 소유자 WRAPPER (ADR-0002).
//
// Every other public backend function is declared with `ownerQuery` /
// `ownerMutation` from ./owner, so the owner is resolved before the handler
// body runs. These two cannot be, and the rule would quietly rot at its
// exceptions, so the reasons are stated here rather than left to be guessed:
//
//   upsertUser  — creates the `users` record that owner resolution looks up.
//                 It has to run BEFORE the wrapper can ever succeed; wrapping
//                 it would make first login impossible (a chicken-and-egg
//                 deadlock: no record → wrapper rejects → record never made).
//
//   currentUser — must answer "nobody" instead of throwing when logged out.
//                 The UI gates subscriptions on this answer, so a rejection
//                 here would break the gate that keeps every wrapped function
//                 from being called unauthenticated in the first place.
//
// Both still verify identity themselves via ctx.auth.getUserIdentity().
// Adding a third exception is a change to ADR-0002, not a local decision.
// ─────────────────────────────────────────────────────────────────────────

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Returns the currently authenticated 사용자 record from the `users` table,
 * or null if the caller is not authenticated.
 *
 * Uses Option A: raw getUserIdentity() + custom table lookup by_token.
 *
 * WRAPPER EXCEPTION (ADR-0002): deliberately declared with the raw `query`.
 * Returning null on logout is the point — the UI gate depends on it.
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
 *
 * WRAPPER EXCEPTION (ADR-0002): deliberately declared with the raw `mutation`.
 * This function creates the record that owner resolution reads, so it must be
 * able to run before an owner can be resolved.
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
