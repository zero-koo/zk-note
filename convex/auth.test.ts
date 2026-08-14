/// <reference types="vite/client" />
/**
 * Harness smoke test — auth path (issue #23).
 *
 * Proves the convex-test in-memory backend exercises identity resolution:
 * an unauthenticated caller gets null, an authenticated caller round-trips
 * through upsertUser → currentUser.
 */
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("auth", () => {
  it("currentUser returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    expect(await t.query(api.auth.currentUser, {})).toBeNull();
  });

  it("upsertUser then currentUser returns the signed-in user's record", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "sub123", name: "Zero Koo" });

    await asUser.mutation(api.auth.upsertUser, {
      name: "Zero Koo",
      email: "zero@example.com",
    });

    const me = await asUser.query(api.auth.currentUser, {});
    expect(me).toMatchObject({ name: "Zero Koo", email: "zero@example.com" });
  });
});
