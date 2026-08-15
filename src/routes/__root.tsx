import type { ReactNode } from "react";
import {
  createRootRoute,
  Outlet,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import "../styles/globals.css";
import { PlatformProvider } from "../lib/platform";
import { UpdatePrompt } from "../components/UpdatePrompt";

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
      {/* The provider gates rendering until the adapter resolves, so everything
          below it can call usePlatform() synchronously. */}
      <PlatformProvider>
        <Outlet />
        <UpdatePrompt />
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
