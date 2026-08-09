/// <reference types="vite/client" />

/** Version de l'application, injectée à la compilation depuis package.json. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
