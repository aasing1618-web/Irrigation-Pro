/**
 * Fabriques partagées par les tests d'authentification.
 *
 * Ce fichier n'est pas un test (il n'est pas capté par `include` de Vitest) :
 * c'est l'outillage commun qui permet aux tests de tourner **sans PostgreSQL**.
 * La base réelle est hébergée chez Supabase et n'est pas joignable depuis un
 * poste de développement ; toute la couche `db` est donc remplacée par un état
 * en mémoire.
 */

export type LigneUtilisateur = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  company: string | null;
  role: 'CLIENT' | 'ADMIN';
  status: 'ACTIF' | 'SUSPENDU';
  must_change_password: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
};

/** Motifs de révocation d'une session (migration 003). */
export type MotifRevocation = 'ROTATION' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'ADMIN';

export type LigneJeton = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  /**
   * `null` si et seulement si `revoked_at` l'est — la base fait respecter
   * cette équivalence (contrainte `refresh_tokens_motif_coherent`), l'état en
   * mémoire ci-dessous aussi.
   */
  revoked_reason: MotifRevocation | null;
  user_agent: string | null;
  created_at: Date;
};

/** Mot de passe en clair utilisé par les tests. Jamais présent en base. */
export const MOT_DE_PASSE_TEST = 'un-mot-de-passe-vraiment-solide-2026';

let compteur = 0;

export function creerLigneUtilisateur(
  empreinte: string,
  surcharges: Partial<LigneUtilisateur> = {},
): LigneUtilisateur {
  compteur += 1;
  const maintenant = new Date('2026-01-15T09:00:00.000Z');
  return {
    id: `11111111-1111-4111-8111-${String(compteur).padStart(12, '0')}`,
    email: `client${compteur}@bureau-etudes.sn`,
    password_hash: empreinte,
    full_name: 'Jean Diop',
    company: 'Bureau d’études Sahel',
    role: 'CLIENT',
    status: 'ACTIF',
    must_change_password: false,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: maintenant,
    updated_at: maintenant,
    created_by: null,
    ...surcharges,
  };
}

/**
 * État en mémoire tenant lieu de base de données.
 * Recréé avant chaque test pour qu'aucun test n'hérite de l'état d'un autre.
 */
export interface EtatFactice {
  utilisateurs: LigneUtilisateur[];
  jetons: LigneJeton[];
  journal: { userId: string | null; action: string; metadata: unknown }[];
}

export function creerEtatFactice(): EtatFactice {
  return { utilisateurs: [], jetons: [], journal: [] };
}

/** Implémentations des dépôts, branchées sur l'état en mémoire. */
export function implementationsDepots(etat: EtatFactice) {
  return {
    findUserByEmail: async (email: string) =>
      etat.utilisateurs.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,

    findUserById: async (id: string) => etat.utilisateurs.find((u) => u.id === id) ?? null,

    registerFailedLogin: async (userId: string, lockUntil: Date | null) => {
      const utilisateur = etat.utilisateurs.find((u) => u.id === userId);
      if (!utilisateur) return 0;
      utilisateur.failed_login_attempts += 1;
      if (lockUntil !== null) utilisateur.locked_until = lockUntil;
      return utilisateur.failed_login_attempts;
    },

    registerSuccessfulLogin: async (userId: string) => {
      const utilisateur = etat.utilisateurs.find((u) => u.id === userId);
      if (!utilisateur) return;
      utilisateur.failed_login_attempts = 0;
      utilisateur.locked_until = null;
      utilisateur.last_login_at = new Date();
    },

    updatePassword: async (userId: string, passwordHash: string) => {
      const utilisateur = etat.utilisateurs.find((u) => u.id === userId);
      if (!utilisateur) return;
      utilisateur.password_hash = passwordHash;
      utilisateur.must_change_password = false;
      utilisateur.failed_login_attempts = 0;
      utilisateur.locked_until = null;
    },

    createRefreshToken: async (input: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      userAgent?: string | null;
    }) => {
      const ligne: LigneJeton = {
        id: `jeton-${etat.jetons.length + 1}`,
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        revoked_at: null,
        revoked_reason: null,
        user_agent: input.userAgent ?? null,
        created_at: new Date(),
      };
      etat.jetons.push(ligne);
      return ligne;
    },

    findRefreshTokenByHash: async (tokenHash: string) =>
      etat.jetons.find((j) => j.token_hash === tokenHash) ?? null,

    // Comme en base : une session déjà révoquée n'est ni ré-horodatée ni
    // re-motivée. Son motif d'origine est justement ce qui permet de juger un
    // éventuel rejeu.
    revokeRefreshToken: async (tokenHash: string, motif: MotifRevocation) => {
      const ligne = etat.jetons.find((j) => j.token_hash === tokenHash);
      if (!ligne || ligne.revoked_at !== null) return false;
      ligne.revoked_at = new Date();
      ligne.revoked_reason = motif;
      return true;
    },

    revokeAllUserTokens: async (userId: string, motif: MotifRevocation) => {
      let nombre = 0;
      for (const ligne of etat.jetons) {
        if (ligne.user_id === userId && ligne.revoked_at === null) {
          ligne.revoked_at = new Date();
          ligne.revoked_reason = motif;
          nombre += 1;
        }
      }
      return nombre;
    },

    logActivity: async (input: {
      userId?: string | null;
      action: string;
      metadata?: Record<string, unknown> | null;
    }) => {
      etat.journal.push({
        userId: input.userId ?? null,
        action: input.action,
        metadata: input.metadata ?? null,
      });
    },
  };
}
