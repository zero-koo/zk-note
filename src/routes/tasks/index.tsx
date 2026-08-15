import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tasks/")({
  component: TasksPage,
});

function TasksPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Tasks</h1>
      <p className="text-muted">Coming soon.</p>
    </main>
  );
}
