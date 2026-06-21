import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/")({
  component: NotesIndexPage,
});

function NotesIndexPage() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Notes</h1>
      <p style={{ color: "var(--color-text-muted)" }}>Coming soon.</p>
    </main>
  );
}
