/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_FUUL_API_KEY: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_DEV_MODE_ENABLED: string; // "true" | "false"
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
