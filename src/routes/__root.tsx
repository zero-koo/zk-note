import type { ReactNode } from "react";
import {
  createRootRoute,
  Outlet,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { ConvexClientProvider } from "~/lib/convex";
import { PlatformProvider } from "~/lib/platform";
import "../styles/globals.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "ZK-Note" },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <RootDocument>
      {/* PlatformProvider outermost: the platform adapter must resolve even
          when the Convex URL is missing/invalid (AC #2 holds independently
          of AC #5's error screen). */}
      <PlatformProvider>
        <ConvexClientProvider>
          <Outlet />
        </ConvexClientProvider>
      </PlatformProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app-root">
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  );
}
