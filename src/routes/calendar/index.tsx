import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/calendar/")({
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Calendar</h1>
      <p className="text-muted">Coming soon.</p>
    </main>
  );
}
