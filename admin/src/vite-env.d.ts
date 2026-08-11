/// <reference types="vite/client" />

/** Version du dashboard, injectée à la compilation depuis package.json. */
declare const __ADMIN_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
