/**
 * Outillage des tests d'administration — **Vague 3**.
 *
 * Ce fichier n'est pas un test : c'est l'état en mémoire qui tient lieu de
 * PostgreSQL pour `tests/admin.*.test.ts`. La base réelle est chez Supabase et
 * n'est pas joignable depuis un poste de développement ; toute la couche `db`
 * est donc remplacée ici.
 *
 * Deux exigences ont guidé son écriture, et elles comptent plus que la
 * commodité :
 *
 *  1. **Les fausses lectures « publiques » se comportent comme le vrai SQL.**
 *     `listUsers`, `getUserForAdmin`, `suspendUser`… ne sélectionnent pas la
 *     colonne `password_hash` (cf. `USER_PUBLIC_COLUMNS` dans `users.repo.ts`) :
 *     les doublures ne la renvoient pas non plus. Un test qui passerait ici
 *     parce que la doublure est plus prude que la base ne prouverait rien.
 *     L'option `fuiteEmpreinte` permet, à l'inverse, de simuler un dépôt devenu
 *     bavard et de vérifier que la **seconde** barrière (`vueCompte`) tient
 *     seule.
 *
 *  2. **Le journal enregistre ce que la route lui a passé, sans filtrage.**
 *     `logAdminAction` applique en vrai `assainirMetadata`. Si la doublure le
 *     faisait aussi, le test « le mot de passe temporaire n'apparaît dans aucun
 *     journal » ne prouverait que l'efficacité du filet — pas le fait que la
 *     route ne lui envoie jamais le secret. On enregistre donc brut.
 */

import type { LigneUtilisateur } from './comptes.js';

// ---------------------------------------------------------------------------
// Types de l'état en mémoire
// ---------------------------------------------------------------------------

/** Une ligne de `admin_actions`, telle que la doublure la conserve. */
export interface LigneActionAdmin {
  id: string;
  admin_id: string;
  target_user_id: string | null;
  action: string;
  reason: string | null;
  metadata: unknown;
  created_at: Date;
}

/** Une ligne de `activity_logs`. */
export interface LigneActivite {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: unknown;
  created_at: Date;
}

/** Un projet, réduit à ce que le dashboard a le droit d'en savoir : son existence. */
export interface LigneProjetCompte {
  id: string;
  owner_id: string;
  deleted_at: Date | null;
}

export interface EtatAdmin {
  utilisateurs: LigneUtilisateur[];
  jetons: {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
    revoked_reason: 'ROTATION' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'ADMIN' | null;
    user_agent: string | null;
    created_at: Date;
  }[];
  actionsAdmin: LigneActionAdmin[];
  activites: LigneActivite[];
  projets: LigneProjetCompte[];
}

export function creerEtatAdmin(): EtatAdmin {
  return { utilisateurs: [], jetons: [], actionsAdmin: [], activites: [], projets: [] };
}

/** Identifiant valide au format UUID mais absent de l'état : sert aux 404. */
export const UUID_ABSENT = '99999999-9999-4999-8999-999999999999';

let compteurActivite = 0;

export function creerLigneActivite(
  userId: string | null,
  surcharges: Partial<LigneActivite> = {},
): LigneActivite {
  compteurActivite += 1;
  return {
    id: String(compteurActivite),
    user_id: userId,
    action: 'LOGIN_SUCCESS',
    entity_type: null,
    entity_id: null,
    ip_address: '41.82.10.4',
    user_agent: 'Irrigation Pro Desktop',
    metadata: null,
    created_at: new Date(2026, 0, 15, 9, compteurActivite % 60),
    ...surcharges,
  };
}

let compteurProjet = 0;

export function creerLigneProjetCompte(ownerId: string): LigneProjetCompte {
  compteurProjet += 1;
  return {
    id: `22222222-2222-4222-8222-${String(compteurProjet).padStart(12, '0')}`,
    owner_id: ownerId,
    deleted_at: null,
  };
}

// ---------------------------------------------------------------------------
// Transactions et verrous
// ---------------------------------------------------------------------------

/**
 * Remplace `withTransaction` et modélise le verrou de `lockActiveAdminIds`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  CE QUE CE MODÈLE REPRODUIT — ET CE QU'IL NE PROUVE PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *  `lockActiveAdminIds` exécute en vrai un `SELECT … FOR UPDATE` sur toutes les
 *  lignes d'administrateurs actifs. En READ COMMITTED, une seconde transaction
 *  qui demande le même verrou **attend**, puis **relit** l'état validé : c'est
 *  ce qui empêche deux suspensions simultanées de laisser le produit sans
 *  administrateur.
 *
 *  La doublure reproduit exactement ces deux propriétés — attente jusqu'à la
 *  fin de la transaction détentrice, puis relecture de l'état courant. Elle
 *  permet donc de vérifier que **la logique de la route** conclut correctement
 *  quand l'ordonnancement est celui-là.
 *
 *  Elle ne prouve **pas** que PostgreSQL se comporte ainsi : cela ne se vérifie
 *  que sur une vraie base, et c'est dit tel quel dans le rapport de vague.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function creerGestionnaireTransactions() {
  let detenteur: object | null = null;
  const fileDAttente: { client: object; reprendre: () => void }[] = [];

  function liberer(client: object): void {
    if (detenteur !== client) return;
    detenteur = null;
    const suivant = fileDAttente.shift();
    if (suivant) {
      detenteur = suivant.client;
      suivant.reprendre();
    }
  }

  /** Pose le verrou « ensemble des administrateurs actifs » pour cette transaction. */
  async function acquerirVerrouAdmins(client: object): Promise<void> {
    if (detenteur === client) return;
    if (detenteur === null) {
      detenteur = client;
      return;
    }
    await new Promise<void>((reprendre) => {
      fileDAttente.push({ client, reprendre });
    });
  }

  async function withTransaction<T>(fn: (client: unknown) => Promise<T>): Promise<T> {
    const client = { transactionFactice: true };
    try {
      return await fn(client);
    } finally {
      liberer(client);
    }
  }

  return { withTransaction, acquerirVerrouAdmins };
}

// ---------------------------------------------------------------------------
// Doublures des dépôts
// ---------------------------------------------------------------------------

export interface OptionsDepotsAdmin {
  /**
   * Simule un dépôt devenu bavard : les lectures « publiques » ramènent aussi
   * `password_hash`. Sert à vérifier que `vueCompte()` tiendrait seul si la
   * première barrière tombait un jour.
   */
  fuiteEmpreinte?: boolean;
  /** Verrou partagé, fourni par `creerGestionnaireTransactions`. */
  acquerirVerrouAdmins?: (client: object) => Promise<void>;
}

/** Erreur PostgreSQL de violation d'unicité, telle que la route la reconnaît. */
export class ErreurUniciteFactice extends Error {
  readonly code = '23505';
  constructor() {
    super('duplicate key value violates unique constraint "users_email_unique_idx"');
  }
}

type VueCompteFactice = Record<string, unknown> & { id: string };

export function implementationsDepotsAdmin(
  etat: EtatAdmin,
  options: OptionsDepotsAdmin = {},
) {
  /** Reproduit `USER_PUBLIC_COLUMNS` : la colonne `password_hash` n'est pas lue. */
  function vuePublique(ligne: LigneUtilisateur): VueCompteFactice {
    const { password_hash: empreinte, ...reste } = ligne;
    return options.fuiteEmpreinte ? { ...reste, password_hash: empreinte } : { ...reste };
  }

  function nombreProjets(userId: string): string {
    return String(
      etat.projets.filter((p) => p.owner_id === userId && p.deleted_at === null).length,
    );
  }

  function vueAdmin(ligne: LigneUtilisateur): VueCompteFactice {
    return { ...vuePublique(ligne), project_count: nombreProjets(ligne.id) };
  }

  function correspond(
    ligne: LigneUtilisateur,
    filtres: { status?: string | null; role?: string | null; search?: string | null },
  ): boolean {
    if (filtres.status && ligne.status !== filtres.status) return false;
    if (filtres.role && ligne.role !== filtres.role) return false;
    const recherche = filtres.search?.trim();
    if (recherche) {
      const aiguille = recherche.toLowerCase();
      const meule = [ligne.email, ligne.full_name, ligne.company ?? '']
        .join(' ')
        .toLowerCase();
      if (!meule.includes(aiguille)) return false;
    }
    return true;
  }

  return {
    // --- users.repo -------------------------------------------------------

    /** Lecture d'authentification : celle-ci ramène bien l'empreinte (comme en base). */
    findUserById: async (id: string) => etat.utilisateurs.find((u) => u.id === id) ?? null,

    findUserByEmail: async (email: string) =>
      etat.utilisateurs.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,

    createUser: async (input: {
      email: string;
      passwordHash: string;
      fullName: string;
      company?: string | null;
      role?: 'CLIENT' | 'ADMIN';
      createdBy?: string | null;
    }) => {
      // L'index unique de la base, reproduit : deux créations simultanées sur
      // la même adresse ne peuvent pas aboutir toutes les deux.
      if (etat.utilisateurs.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
        throw new ErreurUniciteFactice();
      }
      const maintenant = new Date();
      const ligne: LigneUtilisateur = {
        id: `33333333-3333-4333-8333-${String(etat.utilisateurs.length + 1).padStart(12, '0')}`,
        email: input.email.trim(),
        password_hash: input.passwordHash,
        full_name: input.fullName.trim(),
        company: input.company ?? null,
        role: input.role ?? 'CLIENT',
        status: 'ACTIF',
        // Valeur par défaut de la colonne : le client devra remplacer le mot de
        // passe temporaire à sa première connexion.
        must_change_password: true,
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: null,
        created_at: maintenant,
        updated_at: maintenant,
        created_by: input.createdBy ?? null,
      };
      etat.utilisateurs.push(ligne);
      return ligne;
    },

    listUsers: async (
      filtres: {
        status?: string | null;
        role?: string | null;
        search?: string | null;
        limit?: number;
        offset?: number;
      } = {},
    ) => {
      const limit = Math.min(Math.max(filtres.limit ?? 50, 1), 200);
      const offset = Math.max(filtres.offset ?? 0, 0);
      return etat.utilisateurs
        .filter((u) => correspond(u, filtres))
        .slice()
        .reverse() // ORDER BY created_at DESC
        .slice(offset, offset + limit)
        .map(vueAdmin);
    },

    countUsers: async (
      filtres: { status?: string | null; role?: string | null; search?: string | null } = {},
    ) => etat.utilisateurs.filter((u) => correspond(u, filtres)).length,

    getUserForAdmin: async (id: string) => {
      const ligne = etat.utilisateurs.find((u) => u.id === id);
      return ligne ? vueAdmin(ligne) : null;
    },

    updateUserProfile: async (
      id: string,
      patch: { fullName?: string; company?: string | null; role?: 'CLIENT' | 'ADMIN' },
    ) => {
      const ligne = etat.utilisateurs.find((u) => u.id === id);
      if (!ligne) return null;
      if (patch.fullName !== undefined) ligne.full_name = patch.fullName.trim();
      if (patch.company !== undefined) ligne.company = patch.company;
      if (patch.role !== undefined) ligne.role = patch.role;
      ligne.updated_at = new Date();
      return vuePublique(ligne);
    },

    suspendUser: async (id: string) => {
      const ligne = etat.utilisateurs.find((u) => u.id === id);
      if (!ligne) return null;
      ligne.status = 'SUSPENDU';
      return vuePublique(ligne);
    },

    reactivateUser: async (id: string) => {
      const ligne = etat.utilisateurs.find((u) => u.id === id);
      if (!ligne) return null;
      ligne.status = 'ACTIF';
      ligne.failed_login_attempts = 0;
      ligne.locked_until = null;
      return vuePublique(ligne);
    },

    resetUserPassword: async (id: string, passwordHash: string) => {
      const ligne = etat.utilisateurs.find((u) => u.id === id);
      if (!ligne) return null;
      ligne.password_hash = passwordHash;
      ligne.must_change_password = true;
      ligne.failed_login_attempts = 0;
      ligne.locked_until = null;
      return vuePublique(ligne);
    },

    lockActiveAdminIds: async (client: object) => {
      // `SELECT … FOR UPDATE` : on attend le verrou, PUIS on relit l'état.
      if (options.acquerirVerrouAdmins) await options.acquerirVerrouAdmins(client);
      return etat.utilisateurs
        .filter((u) => u.role === 'ADMIN' && u.status === 'ACTIF')
        .map((u) => u.id)
        .sort();
    },

    findUserByIdForUpdate: async (id: string) => {
      const ligne = etat.utilisateurs.find((u) => u.id === id);
      return ligne ? vuePublique(ligne) : null;
    },

    // --- refresh-tokens.repo ---------------------------------------------

    revokeAllUserTokens: async (
      userId: string,
      motif: 'ROTATION' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'ADMIN',
    ) => {
      let nombre = 0;
      for (const jeton of etat.jetons) {
        if (jeton.user_id === userId && jeton.revoked_at === null) {
          jeton.revoked_at = new Date();
          jeton.revoked_reason = motif;
          nombre += 1;
        }
      }
      return nombre;
    },

    // --- admin-actions.repo ----------------------------------------------

    /** Enregistre BRUT ce que la route a transmis : aucun filtrage ici. */
    logAdminAction: async (input: {
      adminId: string;
      targetUserId?: string | null;
      action: string;
      reason?: string | null;
      metadata?: Record<string, unknown> | null;
    }) => {
      const ligne: LigneActionAdmin = {
        id: String(etat.actionsAdmin.length + 1),
        admin_id: input.adminId,
        target_user_id: input.targetUserId ?? null,
        action: input.action,
        reason: input.reason?.trim() ? input.reason.trim() : null,
        metadata: input.metadata ?? null,
        created_at: new Date(),
      };
      etat.actionsAdmin.push(ligne);
      return ligne;
    },

    listAdminActions: async (
      filtres: { targetUserId?: string | null; limit?: number; offset?: number } = {},
    ) => {
      const limit = Math.min(Math.max(filtres.limit ?? 50, 1), 200);
      const offset = Math.max(filtres.offset ?? 0, 0);
      return etat.actionsAdmin
        .filter((a) => !filtres.targetUserId || a.target_user_id === filtres.targetUserId)
        .slice()
        .reverse()
        .slice(offset, offset + limit);
    },

    countAdminActions: async (filtres: { targetUserId?: string | null } = {}) =>
      etat.actionsAdmin.filter((a) => !filtres.targetUserId || a.target_user_id === filtres.targetUserId)
        .length,

    // --- activity-logs.repo ----------------------------------------------

    listActivityForUser: async (userId: string, opts: { limit?: number } = {}) => {
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
      return etat.activites
        .filter((a) => a.user_id === userId)
        .slice()
        .reverse()
        .slice(0, limit);
    },

    listRecentActivity: async (opts: { limit?: number } = {}) => {
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
      return etat.activites.slice().reverse().slice(0, limit);
    },

    logActivity: async () => {
      /* Les routes d'administration n'écrivent pas dans `activity_logs`. */
    },
  };
}
