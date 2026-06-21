import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tasks/")({
  component: TasksPage,
});

function TasksPage() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Tasks</h1>
      <p style={{ color: "var(--color-text-muted)" }}>Coming soon.</p>
    </main>
  );
}
