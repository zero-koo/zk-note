import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  return (
    <main style={{ padding: "2rem" }}>
      <p>Completing sign-in…</p>
    </main>
  );
}
