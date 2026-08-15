import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/$noteId")({
  component: NoteEditorPage,
});

function NoteEditorPage() {
  const { noteId } = Route.useParams();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Note: {noteId}</h1>
      <p className="text-muted">Editor coming soon.</p>
    </main>
  );
}
