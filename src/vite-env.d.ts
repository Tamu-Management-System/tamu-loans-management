/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the real backend, e.g. https://api.tamu.example. Defaults to /api (the mock API). */
  readonly VITE_API_URL?: string;
  /** Mock API: in dev, "false" turns it off; in builds, only "true" turns it on (`npm run build:demo`). */
  readonly VITE_USE_MOCKS?: string;
}

/** Set by vite.config.ts at build time: whether the mock API and demo tools are included. */
declare const __MOCK_API_ENABLED__: boolean;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
