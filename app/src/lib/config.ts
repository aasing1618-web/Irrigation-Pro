/**
 * Configuration de l'application, résolue une seule fois au démarrage.
 *
 * Règle de sécurité non négociable du cahier des charges — « HTTPS partout » :
 * une application distribuée à des clients ne doit JAMAIS envoyer d'identifiants
 * ni de données de projet sur une connexion en clair. On applique donc un
 * contrôle explicite, et on échoue bruyamment plutôt que de dégrader en silence.
 *
 * Le seul cas où « http:// » est toléré est le développement en local
 * (`import.meta.env.DEV`) et uniquement vers la machine du développeur.
 */

/** Adresse par défaut du serveur de développement. */
const DEFAULT_DEV_API_URL = 'http://localhost:4000';

/** Hôtes considérés comme « la machine du développeur ». */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Valide l'adresse du serveur et renvoie sa forme normalisée (sans « / » final).
 *
 * `isDev` est passé en paramètre plutôt que lu directement : la fonction reste
 * ainsi testable sans manipuler l'environnement de compilation.
 */
export function resolveApiUrl(rawValue: string | undefined, isDev: boolean): string {
  const raw = (rawValue ?? (isDev ? DEFAULT_DEV_API_URL : '')).trim();

  if (raw === '') {
    throw new ConfigurationError(
      "L'adresse du serveur Irrigation Pro n'est pas configurée (VITE_API_URL).",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigurationError(
      `L'adresse du serveur Irrigation Pro est invalide : « ${raw} ».`,
    );
  }

  if (url.protocol === 'https:') {
    return stripTrailingSlash(url.toString());
  }

  if (url.protocol === 'http:' && isDev && isLoopback(url)) {
    return stripTrailingSlash(url.toString());
  }

  // Échec bruyant et volontaire : on refuse de communiquer en clair.
  throw new ConfigurationError(
    `Connexion non sécurisée refusée : l'adresse du serveur doit utiliser « https:// » ` +
      `(reçu « ${url.protocol}//${url.host} »). En dehors du développement local, ` +
      `Irrigation Pro n'accepte aucune communication non chiffrée.`,
  );
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export interface AppConfig {
  /** Base URL du backend, sans « / » final. */
  readonly apiUrl: string;
  /** Délai maximum d'une requête réseau, en millisecondes. */
  readonly requestTimeoutMs: number;
  /** Vrai en développement (`npm run dev`). */
  readonly isDev: boolean;
}

let cached: AppConfig | null = null;

/**
 * Renvoie la configuration effective. Lève une `ConfigurationError` si
 * l'application est mal configurée — l'erreur est rattrapée en haut de l'arbre
 * React et présentée à l'utilisateur sous une forme lisible.
 */
export function getConfig(): AppConfig {
  if (cached) return cached;

  cached = {
    apiUrl: resolveApiUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV),
    requestTimeoutMs: 10_000,
    isDev: import.meta.env.DEV,
  };
  return cached;
}

/** Réservé aux tests : oublie la configuration mise en cache. */
export function resetConfigCache(): void {
  cached = null;
}
