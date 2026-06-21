import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/daily")({
  component: DailyPage,
});

function DailyPage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main
      style={{
        padding: "2rem",
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
        Daily Note — {today}
      </h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        Editor coming soon (Task 4).
      </p>
    </main>
  );
}
