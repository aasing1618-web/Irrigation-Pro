/**
 * Détection d'une nouvelle version — mécanisme web (D-013).
 *
 * ## Ce que « nouvelle version » veut dire ici
 *
 * L'application n'est plus installée : elle est servie par un hébergeur de
 * fichiers statiques. Une nouvelle version, c'est donc uniquement ceci : *le
 * serveur de fichiers sert un build plus récent que celui qui tourne dans cet
 * onglet.* Le backend n'a rien à voir là-dedans et n'est jamais interrogé.
 *
 * ## Comment on le sait
 *
 * La compilation dépose `dist/version.json` à côté de l'application (greffon
 * maison dans `vite.config.ts`) :
 *
 * ```json
 * { "version": "0.1.0", "builtAt": "2026-08-11T09:00:00.000Z" }
 * ```
 *
 * Ce fichier est relu périodiquement avec `cache: 'no-store'` — sans quoi le
 * cache du navigateur renverrait indéfiniment l'ancienne version, et le
 * mécanisme ne servirait à rien. Sa version est comparée à `APP_VERSION`,
 * figée dans le code au moment de la compilation.
 *
 * ## Deux principes non négociables
 *
 * 1. **Toute erreur est avalée en silence.** Hors ligne, fichier absent, JSON
 *    cassé, hébergeur qui renvoie une page d'erreur : rien ne doit apparaître à
 *    l'écran. Une bannière déclenchée par un réseau capricieux est pire que pas
 *    de bannière du tout — l'utilisateur apprendrait à l'ignorer.
 * 2. **Jamais de rechargement automatique.** Un ingénieur en train de saisir
 *    une étude ne doit pas voir son écran se réinitialiser sous ses doigts.
 *    Ce module se contente de signaler ; le rechargement est un clic, et c'est
 *    l'utilisateur qui le fait.
 *
 * Ce module est **inactif en développement** : `npm run dev` ne sert pas de
 * `version.json`, et un rechargement à chaud n'a rien à voir avec une
 * publication.
 *
 * > Exception assumée à la règle « aucun `fetch` hors de `api.ts` » :
 * > `version.json` n'appartient pas à l'API, il est servi par l'hébergeur de
 * > l'application. Le faire passer par `apiRequest` le préfixerait de
 * > `VITE_API_URL` et viserait le mauvais serveur.
 */

import { APP_VERSION } from './version';

/** Contenu attendu de `version.json`. */
export interface VersionManifest {
  version: string;
  builtAt?: string;
}

/** Première vérification : après 30 s, le temps que l'écran se stabilise. */
export const FIRST_CHECK_DELAY_MS = 30_000;

/** Vérification périodique : toutes les 30 minutes. */
export const CHECK_INTERVAL_MS = 30 * 60_000;

/**
 * Intervalle minimum entre deux lectures effectives.
 *
 * Sans ce garde-fou, quelqu'un qui bascule sans arrêt entre deux onglets
 * déclencherait une requête à chaque aller-retour.
 */
export const MIN_INTERVAL_MS = 5 * 60_000;

/**
 * Lit la version publiée. Renvoie `null` dès que le moindre doute existe :
 * réseau indisponible, fichier absent, corps illisible, version vide.
 */
export async function fetchPublishedVersion(): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json`, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response.ok) return null;

    const manifest = (await response.json()) as Partial<VersionManifest> | null;
    const version = typeof manifest?.version === 'string' ? manifest.version.trim() : '';
    return version === '' ? null : version;
  } catch {
    // Silence volontaire : voir le principe 1 en tête de fichier.
    return null;
  }
}

export interface UpdateWatchOptions {
  /**
   * Permet de forcer l'activation. Par défaut, la surveillance est active
   * partout **sauf** en développement.
   */
  enabled?: boolean;
  /** Version de référence ; `APP_VERSION` en dehors des tests. */
  currentVersion?: string;
}

/**
 * Surveille la version publiée et signale, **une fois**, qu'elle a changé.
 *
 * Renvoie la fonction d'arrêt à appeler au démontage : sans elle, un
 * `setInterval` et un écouteur d'événement survivraient au composant.
 */
export function startUpdateWatch(
  onUpdateAvailable: (version: string) => void,
  options: UpdateWatchOptions = {},
): () => void {
  const enabled = options.enabled ?? !import.meta.env.DEV;
  if (!enabled) return () => {};

  const currentVersion = options.currentVersion ?? APP_VERSION;

  let stopped = false;
  let lastCheckedAt = 0;

  const check = async (): Promise<void> => {
    if (stopped) return;

    const now = Date.now();
    if (now - lastCheckedAt < MIN_INTERVAL_MS) return;
    lastCheckedAt = now;

    const published = await fetchPublishedVersion();
    if (stopped || published === null || published === currentVersion) return;

    onUpdateAvailable(published);
  };

  const firstCheck = setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
  const periodic = setInterval(() => void check(), CHECK_INTERVAL_MS);

  // Retour sur l'onglet : c'est le moment où quelqu'un reprend son travail,
  // donc le bon moment pour l'informer — sous réserve du garde-fou des 5 min.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void check();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    stopped = true;
    clearTimeout(firstCheck);
    clearInterval(periodic);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
