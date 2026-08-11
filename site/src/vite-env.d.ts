/// <reference types="vite/client" />

/** Version du site, injectée à la compilation depuis package.json. */
declare const __SITE_VERSION__: string;

interface ImportMetaEnv {
  /** Numéro WhatsApp du propriétaire, si on veut le changer sans toucher au code. */
  readonly VITE_WHATSAPP_NUMBER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
