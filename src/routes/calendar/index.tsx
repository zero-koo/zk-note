import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/calendar/")({
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Calendar</h1>
      <p style={{ color: "var(--color-text-muted)" }}>Coming soon.</p>
    </main>
  );
}
