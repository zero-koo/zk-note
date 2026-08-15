/// <reference types="vite/client" />
/**
 * 태스크 ownership. Reads are scoped to the 소유자, and the 노트 a
 * 태스크 points at must belong to the 소유자 too (ADR-0002).
 */
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedNote, seedTask, twoOwners } from "./fixtures.test";

async function setup() {
  const { t, asMe, them } = await twoOwners();
  return {
    t,
    asMe,
    theirs: { note: await seedNote(t, them), task: await seedTask(t, them) },
  };
}

describe("tasks", () => {
  it("creates a 태스크 owned by the 소유자, with no userId argument", async () => {
    const { asMe } = await setup();

    await asMe.mutation(api.tasks.create, { title: "내 태스크" });

    const mine = await asMe.query(api.tasks.list, {});
    expect(mine.map((task) => task.title)).toEqual(["내 태스크"]);
  });

  it("lists only the 소유자's 태스크", async () => {
    const { asMe } = await setup();

    expect(await asMe.query(api.tasks.list, {})).toEqual([]);
  });

  it("refuses to change the status of another 소유자's 태스크", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.tasks.updateStatus, {
        taskId: theirs.task,
        status: "done",
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to update another 소유자's 태스크", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.tasks.update, {
        taskId: theirs.task,
        title: "가로챈 제목",
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to remove another 소유자's 태스크", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.tasks.remove, { taskId: theirs.task }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("refuses to point a new 태스크 at another 소유자's 노트", async () => {
    const { asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.tasks.create, {
        title: "내 태스크",
        linkedNoteId: theirs.note,
      }),
    ).rejects.toThrow(/not found or not owned/i);
  });

  it("leaves another 소유자's 태스크 untouched after a refused update", async () => {
    const { t, asMe, theirs } = await setup();

    await expect(
      asMe.mutation(api.tasks.updateStatus, {
        taskId: theirs.task,
        status: "done",
      }),
    ).rejects.toThrow();

    const still = await t.run(async (ctx) => ctx.db.get(theirs.task));
    expect(still!.status).toBe("todo");
  });

  it("lets the 소유자 point a 태스크 at their own 노트", async () => {
    const { asMe } = await setup();
    const myNote = (await asMe.mutation(api.notes.create, {
      title: "내 노트",
      content: "안녕",
    })) as Id<"notes">;

    await asMe.mutation(api.tasks.create, {
      title: "내 태스크",
      linkedNoteId: myNote,
    });

    const mine = await asMe.query(api.tasks.list, {});
    expect(mine[0].linkedNoteId).toBe(myNote);
  });
});
