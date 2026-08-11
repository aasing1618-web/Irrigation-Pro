/**
 * Version du site, injectée à la compilation depuis `package.json`
 * (voir `vite.config.ts`). Sous Vitest, la constante n'est pas définie : on
 * retombe alors sur une valeur neutre plutôt que de faire échouer le rendu.
 */
export const SITE_VERSION: string =
  typeof __SITE_VERSION__ === 'string' ? __SITE_VERSION__ : '0.0.0';
