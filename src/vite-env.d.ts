/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Convex deployment URL, e.g. https://elated-chipmunk-307.convex.cloud */
  readonly VITE_CONVEX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
