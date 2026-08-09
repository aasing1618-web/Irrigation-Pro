/**
 * Rangement du **jeton de rafraîchissement** — et de lui seul.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Ce qu'il faut savoir avant de toucher à ce fichier                        │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ Le jeton de rafraîchissement est le seul secret de longue durée du        │
 * │ logiciel : il vaut 30 jours d'accès au compte. Il ne doit donc JAMAIS     │
 * │ être écrit dans `localStorage`, `sessionStorage`, un cookie, ni un        │
 * │ fichier en clair (décision D-005b).                                       │
 * │                                                                           │
 * │ Le jeton d'accès (15 min), lui, ne passe pas par ici : il vit uniquement  │
 * │ en mémoire vive, dans `auth-store.ts`.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ## Pourquoi une abstraction plutôt qu'un appel direct
 *
 * L'implémentation définitive (trousseau Windows) demande un **greffon Rust**
 * côté Tauri, et la chaîne Rust n'est pas installée sur le poste de
 * développement. Toute la Vague 1 — connexion, compte suspendu, mot de passe à
 * changer, rafraîchissement, révocation — se développe et se teste donc avec
 * l'implémentation en mémoire, dans un simple navigateur.
 *
 * Le seul comportement qui manque tant que le greffon n'est pas livré est
 * celui-ci : « je relance le logiciel demain et je suis encore connecté ».
 *
 * ## Ce qu'il restera exactement à faire (une seule fois, ici)
 *
 * 1. Côté Rust (`src-tauri/`), exposer trois commandes qui parlent au
 *    gestionnaire d'identifiants de Windows :
 *      `secure_store_read`, `secure_store_write`, `secure_store_clear`,
 *    chacune prenant `key: String` (et `value: String` pour l'écriture).
 * 2. Passer `KEYRING_PLUGIN_READY` à `true` ci-dessous.
 *
 * **Aucun autre fichier du logiciel ne change** : ni `auth-store.ts`, ni
 * `api.ts`, ni un écran, ni un test. C'est tout l'intérêt de cette frontière.
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
 * Un emplacement protégé capable de retenir une valeur secrète.
 *
 * Volontairement réduit à une seule valeur : moins il y a de surface, moins il
 * y a d'occasions de ranger par erreur autre chose que le jeton.
 */
export interface SecureStore {
  /** À des fins de diagnostic et de documentation, jamais de logique métier. */
  readonly kind: 'memory' | 'os-keyring';
  /** Vrai si la valeur survit à la fermeture du logiciel. */
  readonly survivesRestart: boolean;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Implémentation en mémoire vive.
 *
 * Utilisée aujourd'hui (poste sans chaîne Rust) et par tous les tests. La
 * valeur disparaît à la fermeture de la fenêtre : c'est une limite assumée et
 * documentée, pas un défaut.
 */
export function createMemorySecureStore(): SecureStore {
  let value: string | null = null;

  return {
    kind: 'memory',
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
    survivesRestart: true,
    read: () => call<string | null>('secure_store_read', { key: REFRESH_TOKEN_KEY }),
    write: (value) => call<void>('secure_store_write', { key: REFRESH_TOKEN_KEY, value }),
    clear: () => call<void>('secure_store_clear', { key: REFRESH_TOKEN_KEY }),
  };
}

/**
 * Choisit le meilleur emplacement disponible sur cette machine.
 *
 * C'est le seul endroit du logiciel qui décide « trousseau ou mémoire ».
 */
export function resolveSecureStore(): SecureStore {
  if (KEYRING_PLUGIN_READY && isTauriRuntime()) {
    return createOsKeyringSecureStore();
  }
  return createMemorySecureStore();
}
