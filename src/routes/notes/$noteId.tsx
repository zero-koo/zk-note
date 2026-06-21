import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/$noteId")({
  component: NoteEditorPage,
});

function NoteEditorPage() {
  const { noteId } = Route.useParams();

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Note: {noteId}</h1>
      <p style={{ color: "var(--color-text-muted)" }}>Editor coming soon.</p>
    </main>
  );
}
