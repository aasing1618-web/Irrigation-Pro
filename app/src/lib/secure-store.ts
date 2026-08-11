/**
 * Rangement du **jeton de rafraîchissement** — et de lui seul.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Ce qu'il faut savoir avant de toucher à ce fichier                        │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ Le jeton de rafraîchissement est le seul secret de longue durée du        │
 * │ logiciel : il vaut 30 jours d'accès au compte. Il ne doit donc JAMAIS     │
 * │ être écrit dans `localStorage`, `sessionStorage`, ni un fichier en clair. │
 * │                                                                           │
 * │ Le jeton d'accès (15 min), lui, ne passe pas par ici : il vit uniquement  │
 * │ en mémoire vive, dans `auth-store.ts`.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ## Deux mondes, deux rangements (décisions D-005b puis D-013)
 *
 * | Où tourne le logiciel | Rangement | Transport du jeton |
 * |---|---|---|
 * | Coque Tauri (poste Windows) | Trousseau du système, ou mémoire vive | `body` — le jeton circule dans le JSON |
 * | Navigateur (cible retenue, D-013) | Cookie `HttpOnly` détenu par le serveur | `cookie` — le jeton ne touche jamais le JavaScript |
 *
 * D-005b interdisait tout cookie : le raisonnement tenait pour une application
 * installée, servie depuis `tauri://localhost`, où un cookie serait un cookie
 * tierce-partie. Il ne tient plus dans un navigateur, où la mémoire vive est
 * vidée à chaque F5 : le client serait déconnecté à chaque rechargement de
 * page. D-013 amende donc D-005b sur ce seul point, et rien d'autre ne bouge —
 * `localStorage` et `sessionStorage` restent **interdits**, car lisibles par
 * n'importe quel script de la page, donc par la moindre faille XSS.
 *
 * Le cookie, lui, est `HttpOnly` : il accompagne les requêtes vers
 * `/api/auth/*` sans qu'aucune ligne de JavaScript ne puisse le lire. C'est
 * exactement pour cette raison que `read()` et `write()` n'ont **aucun sens**
 * en mode cookie — et c'est une garantie, pas une lacune.
 *
 * ## Ce qu'il restera exactement à faire pour le trousseau Windows
 *
 * 1. Côté Rust (`src-tauri/`), exposer trois commandes qui parlent au
 *    gestionnaire d'identifiants de Windows :
 *      `secure_store_read`, `secure_store_write`, `secure_store_clear`,
 *    chacune prenant `key: String` (et `value: String` pour l'écriture).
 * 2. Passer `KEYRING_PLUGIN_READY` à `true` ci-dessous.
 *
 * Ce chantier ne concerne que la coque Tauri : la version web n'en dépend pas.
 */

/** Nom sous lequel le jeton est rangé dans le trousseau du système. */
const REFRESH_TOKEN_KEY = 'irrigation-pro.refresh-token';

/**
 * Passera à `true` le jour où les commandes Rust existeront.
 * Tant que c'est `false`, le logiciel range le jeton en mémoire vive : la
 * session est parfaitement fonctionnelle, mais elle ne survit pas à la
 * fermeture de la fenêtre.
 */
const KEYRING_PLUGIN_READY: boolean = false;

/**
 * Où vit le jeton de rafraîchissement, du point de vue du serveur.
 *
 * C'est ce que le client **déclare** au serveur (champ `sessionTransport` du
 * corps de `login`, `refresh`, `change-password` et `logout`) : le serveur ne
 * devine rien.
 *
 * - `body`   : le serveur renvoie le jeton dans le JSON, le client le range.
 * - `cookie` : le serveur pose un cookie `HttpOnly` et **omet** le jeton du
 *              JSON. Le client n'a jamais le secret entre les mains.
 *
 * `body` est la valeur par défaut du contrat : une requête qui ne précise rien
 * se comporte exactement comme avant la Vague 4.
 */
export type SessionTransport = 'body' | 'cookie';

/**
 * Un emplacement protégé capable de retenir une valeur secrète.
 *
 * Volontairement réduit à une seule valeur : moins il y a de surface, moins il
 * y a d'occasions de ranger par erreur autre chose que le jeton.
 */
export interface SecureStore {
  /** À des fins de diagnostic et de documentation, jamais de logique métier. */
  readonly kind: 'memory' | 'os-keyring' | 'http-cookie';
  /**
   * Ce que le client annonce au serveur. Seule propriété de cette interface
   * qui porte une décision : `auth-store.ts` et `api.ts` s'y réfèrent pour
   * savoir s'il faut envoyer `sessionTransport: "cookie"` et joindre le cookie
   * aux requêtes d'authentification.
   */
  readonly transport: SessionTransport;
  /** Vrai si la session survit à la fermeture du logiciel (ou à un F5). */
  readonly survivesRestart: boolean;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Implémentation en mémoire vive.
 *
 * Utilisée par la coque Tauri tant que le greffon Rust n'existe pas, et par
 * tous les tests. La valeur disparaît à la fermeture de la fenêtre : c'est une
 * limite assumée et documentée, pas un défaut.
 */
export function createMemorySecureStore(): SecureStore {
  let value: string | null = null;

  return {
    kind: 'memory',
    transport: 'body',
    survivesRestart: false,
    read: () => Promise.resolve(value),
    write: (next) => {
      value = next;
      return Promise.resolve();
    },
    clear: () => {
      value = null;
      return Promise.resolve();
    },
  };
}

/**
 * Implémentation **navigateur** : il n'y a rien à ranger côté client.
 *
 * Le jeton de rafraîchissement vit dans un cookie `HttpOnly` posé par le
 * serveur. Les trois opérations sont donc sans objet, chacune pour une raison
 * précise — ce ne sont pas des trous laissés à combler plus tard :
 *
 * - `read()`  : le JavaScript **ne peut pas** lire un cookie `HttpOnly`.
 *               C'est le but même du dispositif. Le rafraîchissement n'a donc
 *               besoin d'aucune valeur : il envoie la requête, le navigateur
 *               joint le cookie, le serveur décide.
 * - `write()` : c'est le serveur qui pose le cookie, via `Set-Cookie`.
 * - `clear()` : `POST /api/auth/logout` efface le cookie côté serveur. Rien
 *               ici ne pourrait le faire, et un cookie effacé à moitié (par
 *               exemple avec des attributs différents) serait pire que rien.
 */
export function createCookieSecureStore(): SecureStore {
  return {
    kind: 'http-cookie',
    transport: 'cookie',
    // Le cookie a 30 jours de durée de vie : la session survit au F5, à la
    // fermeture de l'onglet et au redémarrage du navigateur.
    survivesRestart: true,
    read: () => Promise.resolve(null),
    write: () => Promise.resolve(),
    clear: () => Promise.resolve(),
  };
}

/** Vrai lorsque le code s'exécute dans la coque Tauri, et pas dans un navigateur. */
function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Implémentation adossée au trousseau du système, via le greffon Rust.
 *
 * L'import de l'API Tauri est **dynamique** : la version navigateur du logiciel
 * ne charge jamais ce code, et `npm run dev` continue de fonctionner sans coque
 * desktop.
 */
export function createOsKeyringSecureStore(): SecureStore {
  const call = async <T>(command: string, args: Record<string, unknown>): Promise<T> => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, args);
  };

  return {
    kind: 'os-keyring',
    transport: 'body',
    survivesRestart: true,
    read: () => call<string | null>('secure_store_read', { key: REFRESH_TOKEN_KEY }),
    write: (value) => call<void>('secure_store_write', { key: REFRESH_TOKEN_KEY, value }),
    clear: () => call<void>('secure_store_clear', { key: REFRESH_TOKEN_KEY }),
  };
}

/**
 * Choisit le rangement adapté à l'endroit où le logiciel s'exécute.
 *
 * C'est le **seul** endroit du logiciel qui décide « cookie, trousseau ou
 * mémoire ». Deux branches, dans cet ordre :
 *
 * 1. coque Tauri  → trousseau du système si le greffon Rust est là, sinon
 *                   mémoire vive. Transport `body`, comme depuis la Vague 1 ;
 * 2. navigateur   → cookie `HttpOnly`. Transport `cookie` : c'est la cible
 *                   retenue par le propriétaire (D-013).
 */
export function resolveSecureStore(): SecureStore {
  if (isTauriRuntime()) {
    return KEYRING_PLUGIN_READY ? createOsKeyringSecureStore() : createMemorySecureStore();
  }
  return createCookieSecureStore();
}
