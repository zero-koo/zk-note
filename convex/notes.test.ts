/// <reference types="vite/client" />
/**
 * Harness smoke test — domain round-trip (issue #23).
 *
 * Proves a note written through the public interface comes back through it.
 * NOTE: create/list still take a caller-supplied userId — that interface is
 * slated to change with the owner module (ADR-0002); this file only proves
 * the harness, so it seeds a user directly via t.run.
 */
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("notes", () => {
  it("a created note comes back from list", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { tokenIdentifier: "google|seed" }),
    );

    const noteId = await t.mutation(api.notes.create, {
      userId,
      title: "첫 노트",
      content: "# 안녕",
    });

    const notes = await t.query(api.notes.list, { userId });
    expect(notes).toMatchObject([
      { _id: noteId, title: "첫 노트", content: "# 안녕" },
    ]);
  });
});
