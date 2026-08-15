import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  return (
    <main className="p-8">
      <p>Completing sign-in…</p>
    </main>
  );
}
