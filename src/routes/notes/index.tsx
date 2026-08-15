import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/")({
  component: NotesIndexPage,
});

function NotesIndexPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Notes</h1>
      <p className="text-muted">Coming soon.</p>
    </main>
  );
}
