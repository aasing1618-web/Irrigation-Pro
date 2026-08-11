/**
 * Version du dashboard, injectée à la compilation depuis `package.json`
 * (voir `vite.config.ts`). Sous Vitest, la constante n'est pas définie : on
 * retombe alors sur une valeur neutre plutôt que de faire échouer le rendu.
 */
export const ADMIN_VERSION: string =
  typeof __ADMIN_VERSION__ === 'string' ? __ADMIN_VERSION__ : '0.0.0';
