/// <reference types="vite/client" />
/**
 * 폴더 ownership. Every function that touches a folder by id must refuse a
 * folder belonging to another 소유자 (ADR-0002).
 */
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedFolder, twoOwners } from "./fixtures.test";

/** Both 소유자 seeded, plus a 폴더 belonging to the other one. */
async function setup() {
  const { t, asMe, me, them } = await twoOwners();
  return { t, asMe, me, theirFolder: await seedFolder(t, them) };
}

describe("folders", () => {
  it("creates a 폴더 owned by the 소유자, with no userId argument", async () => {
    const { asMe, me } = await setup();

    await asMe.mutation(api.folders.create, { name: "새 폴더" });

    const mine = await asMe.query(api.folders.list, {});
    expect(mine.map((f) => f.name)).toEqual(["새 폴더"]);

    // and it really is stored against the 소유자, not left unowned
    expect(mine[0].userId).toBe(me);
  });

  it("refuses to rename another 소유자's 폴더", async () => {
    const { asMe, theirFolder } = await setup();

    await expect(
      asMe.mutation(api.folders.rename, {
        folderId: theirFolder,
        name: "가로챈 이름",
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to move another 소유자's 폴더", async () => {
    const { asMe, theirFolder } = await setup();

    await expect(
      asMe.mutation(api.folders.move, { folderId: theirFolder }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to remove another 소유자's 폴더", async () => {
    const { asMe, theirFolder } = await setup();

    await expect(
      asMe.mutation(api.folders.remove, { folderId: theirFolder }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("leaves another 소유자's 폴더 untouched after a refused remove", async () => {
    const { t, asMe, theirFolder } = await setup();

    await expect(
      asMe.mutation(api.folders.remove, { folderId: theirFolder }),
    ).rejects.toThrow();

    const still = await t.run(async (ctx) => ctx.db.get(theirFolder));
    expect(still).not.toBeNull();
  });

  it("refuses to file a new 폴더 under another 소유자's 폴더", async () => {
    const { asMe, theirFolder } = await setup();

    await expect(
      asMe.mutation(api.folders.create, {
        name: "내 폴더",
        parentId: theirFolder,
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to move my 폴더 under another 소유자's 폴더", async () => {
    const { asMe, theirFolder } = await setup();
    const mine = (await asMe.mutation(api.folders.create, {
      name: "내 폴더",
    })) as Id<"folders">;

    await expect(
      asMe.mutation(api.folders.move, {
        folderId: mine,
        parentId: theirFolder,
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });
});
