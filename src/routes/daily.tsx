import { createFileRoute } from "@tanstack/react-router";
import { BackendStatus } from "~/components/layout/BackendStatus";

export const Route = createFileRoute("/daily")({
  component: DailyPage,
});

function DailyPage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-[720px] p-8">
      <h1 className="mb-4 text-2xl font-bold">Daily Note — {today}</h1>
      <p className="text-muted">Editor coming soon (Task 4).</p>
      <BackendStatus />
    </main>
  );
}
