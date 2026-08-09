/**
 * Version de l'application.
 *
 * La valeur vient de `app/package.json` et est injectée à la compilation par
 * Vite (`define: { __APP_VERSION__ }`). Elle n'est jamais saisie à la main
 * ailleurs dans le code : pour publier une nouvelle version, on ne modifie que
 * `package.json` (et `src-tauri/tauri.conf.json`, qui la relit de son côté).
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Forme affichable : « Version 0.1.0 ». */
export const APP_VERSION_LABEL = `Version ${APP_VERSION}`;
