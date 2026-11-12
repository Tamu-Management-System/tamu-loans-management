/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Address of the backend API, including /api: a full address, or "/api" when the hosting passes /api on to the backend (required for builds) */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
