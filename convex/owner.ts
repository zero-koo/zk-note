// convex/owner.ts
//
// The 소유자(owner) module — the single pass-through point every backend
// function goes behind (ADR-0002).
//
// Identity is enforced by STRUCTURE, not by convention: functions are declared
// with `ownerQuery` / `ownerMutation` instead of the raw `query` / `mutation`,
// so by the time a handler body starts running the owner is already resolved.
// A function that skips the wrapper is visible in one search — it is the only
// kind of file under convex/ that imports `query`/`mutation` from
// `./_generated/server` (see owner.test.ts, which asserts exactly that).

import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import type { ObjectType, PropertyValidators } from "convex/values";

/** The 사용자 record that owns a document. */
export type Owner = Doc<"users">;

/** Tables whose documents belong to exactly one 소유자. */
export type OwnedTable = "folders" | "notes" | "tasks" | "attachments";

export type OwnerQueryCtx = QueryCtx & { owner: Owner };
export type OwnerMutationCtx = MutationCtx & { owner: Owner };

/**
 * Resolve the 소유자 from the caller's verified identity.
 *
 * Rejects when the owner cannot be resolved — either the caller is
 * unauthenticated, or it is authenticated but has no `users` record yet
 * (first login). Creating that record is the job of `auth.upsertUser`,
 * which runs ahead of this wrapper; read functions cannot write, so they
 * cannot create it on demand.
 */
async function resolveOwner(ctx: QueryCtx | MutationCtx): Promise<Owner> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const owner = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!owner) throw new Error("No user record for the authenticated identity");

  return owner;
}

// The `as never` below is confined to the `handler` property, and it is a
// generic pass-through workaround rather than a hole in the types: because
// `Args` is still an unresolved type parameter here, TypeScript cannot reduce
// Convex's conditional `ArgsArrayForOptionalValidator` to a single-argument
// handler. `args` stays fully checked, the handler's own parameters are
// annotated, and the explicit return type is what callers see — so `api.*`
// stays typed and every handler is checked against its own validator.
//
// There is deliberately no `ownerAction`: Convex actions have no `ctx.db`, so
// `resolveOwner`'s users lookup cannot run inside one at all — an action would
// have to go through `ctx.runQuery`. No action exists yet, and ADR-0002 argues
// against standing up seats before there is a second occupant. If one is ever
// added, the audit in owner.test.ts will fail until this is resolved, which is
// the intended way to find out.

/** Declare a query that runs with the 소유자 already resolved on `ctx.owner`. */
export function ownerQuery<Args extends PropertyValidators, Output>(fn: {
  args: Args;
  handler: (ctx: OwnerQueryCtx, args: ObjectType<Args>) => Promise<Output>;
}): RegisteredQuery<"public", ObjectType<Args>, Promise<Output>> {
  return query({
    args: fn.args,
    handler: (async (ctx: QueryCtx, args: ObjectType<Args>) =>
      fn.handler({ ...ctx, owner: await resolveOwner(ctx) }, args)) as never,
  });
}

/** Declare a mutation that runs with the 소유자 already resolved on `ctx.owner`. */
export function ownerMutation<Args extends PropertyValidators, Output>(fn: {
  args: Args;
  handler: (ctx: OwnerMutationCtx, args: ObjectType<Args>) => Promise<Output>;
}): RegisteredMutation<"public", ObjectType<Args>, Promise<Output>> {
  return mutation({
    args: fn.args,
    handler: (async (ctx: MutationCtx, args: ObjectType<Args>) =>
      fn.handler({ ...ctx, owner: await resolveOwner(ctx) }, args)) as never,
  });
}

/**
 * Fetch a document and verify it belongs to the 소유자, in one step.
 *
 * Modifying a document means fetching it anyway, so the natural path is the
 * safe one. Use this for the document being changed AND for every reference
 * handed in as an argument (a 폴더's new parent, a 노트's folder, the 노트 a
 * 태스크 points at, the 노트 a 첨부 hangs off) — otherwise a 소유자 can point
 * their own document at someone else's.
 *
 * "Missing" and "not yours" produce the same error on purpose: distinguishing
 * them would leak which ids exist.
 */
export async function getOwned<T extends OwnedTable>(
  ctx: { db: QueryCtx["db"]; owner: Owner },
  table: T,
  id: Id<T>,
): Promise<Doc<T>> {
  // normalizeId also confirms the id really belongs to `table`, so a 소유자
  // cannot smuggle a 폴더 id into a 노트 lookup.
  const normalized = ctx.db.normalizeId(table, id);
  const doc = normalized === null ? null : await ctx.db.get(normalized);

  if (doc === null || doc.userId !== ctx.owner._id) {
    throw new Error(`Not found or not owned: ${table}`);
  }
  return doc as Doc<T>;
}

/**
 * Same check for a reference that may be absent.
 *
 * On its own this is a thin module — delete it and the call sites just grow an
 * `if` back, so it is not carrying complexity. It earns its place for a
 * different reason: **the check stays greppable.** ADR-0002 rests on a missed
 * ownership check being findable, and `grep getOwned` reaching every one of
 * them only works while there is a single call shape. Fold this back into
 * inline `if (x !== undefined)` blocks and the optional references — exactly
 * the ones easiest to forget — stop showing up in that search.
 */
export async function getOwnedIfPresent<T extends OwnedTable>(
  ctx: { db: QueryCtx["db"]; owner: Owner },
  table: T,
  id: Id<T> | undefined,
): Promise<Doc<T> | undefined> {
  if (id === undefined) return undefined;
  return await getOwned(ctx, table, id);
}
