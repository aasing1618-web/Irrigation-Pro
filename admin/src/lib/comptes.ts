/**
 * Les comptes clients, vus par le dashboard.
 *
 * Ce module traduit littéralement la section 2 de `docs/API-VAGUE-3.md` : un
 * type par forme de réponse, une fonction par route, et rien de plus. Aucune
 * règle métier ici — elles sont toutes côté serveur, y compris celles qui
 * paraissent évidentes (« on ne suspend pas le dernier administrateur »).
 *
 * ⚠ Ce que ce module n'a PAS, et n'aura pas : le moindre accès aux projets, aux
 *   calculs ou aux rapports d'un client. L'API n'en offre aucun, délibérément —
 *   la confidentialité des études est un argument commercial. Il n'y a pas de
 *   contournement à chercher.
 */

import { apiRequest, queryString } from './api';

/* -------------------------------------------------------------------------- */
/* Formes renvoyées par le serveur                                            */
/* -------------------------------------------------------------------------- */

export type StatutCompte = 'ACTIF' | 'SUSPENDU';
export type RoleCompte = 'CLIENT' | 'ADMIN';

export interface Compte {
  id: string;
  email: string;
  nomComplet: string;
  societe: string | null;
  role: RoleCompte;
  statut: StatutCompte;
  doitChangerMotDePasse: boolean;
  /**
   * Fin d'un verrouillage anti-force-brute, ou `null` — ce qui est le cas la
   * plupart du temps. Ce n'est **pas** un statut : c'est l'information de
   * dépannage qui distingue « bloqué quinze minutes » de « suspendu ».
   */
  verrouilleJusqua: string | null;
  derniereConnexion: string | null;
  creeLe: string;
  /** Nombre de projets — un compteur, jamais leur contenu. */
  nombreProjets?: number;
}

/** Une entrée du journal d'activité (`activity_logs`). */
export interface EntreeActivite {
  id: string;
  compteId: string | null;
  action: string;
  typeEntite: string | null;
  entiteId: string | null;
  adresseIp: string | null;
  appareil: string | null;
  contexte: Record<string, unknown> | null;
  dateHeure: string;
}

/** Une décision d'administration (`admin_actions`). */
export interface ActionAdmin {
  id: string;
  auteurId: string;
  compteCibleId: string | null;
  action: string;
  motif: string | null;
  contexte: Record<string, unknown> | null;
  dateHeure: string;
}

export interface ReponseListeComptes {
  comptes: Compte[];
  total: number;
}

export interface ReponseCreation {
  compte: Compte;
  /** En clair, **une seule fois dans toute la vie du compte**. */
  motDePasseTemporaire: string;
}

export interface ReponseAction {
  compte: Compte;
  sessionsRevoquees?: number;
}

export interface ReponseReinitialisation extends ReponseAction {
  motDePasseTemporaire: string;
}

export interface ReponseActiviteCompte {
  compte: Compte;
  activites: EntreeActivite[];
  actionsAdmin: ActionAdmin[];
  totalActionsAdmin: number;
}

export interface ReponseActiviteRecente {
  activites: EntreeActivite[];
  actionsAdmin: ActionAdmin[];
  statistiques: {
    comptes: number;
    comptesActifs: number;
    comptesSuspendus: number;
  };
}

/* -------------------------------------------------------------------------- */
/* Appels                                                                     */
/* -------------------------------------------------------------------------- */

export interface FiltresComptes {
  statut?: StatutCompte;
  role?: RoleCompte;
  recherche?: string;
  limite?: number;
  depuis?: number;
}

export function listerComptes(
  filtres: FiltresComptes = {},
  signal?: AbortSignal,
): Promise<ReponseListeComptes> {
  return apiRequest<ReponseListeComptes>(
    `/api/admin/users${queryString({
      statut: filtres.statut,
      role: filtres.role,
      recherche: filtres.recherche?.trim(),
      limite: filtres.limite,
      depuis: filtres.depuis,
    })}`,
    { signal },
  );
}

export interface BrouillonCompte {
  email: string;
  nomComplet: string;
  societe?: string;
  role?: RoleCompte;
}

export function creerCompte(brouillon: BrouillonCompte): Promise<ReponseCreation> {
  return apiRequest<ReponseCreation>('/api/admin/users', {
    method: 'POST',
    body: {
      email: brouillon.email.trim(),
      nomComplet: brouillon.nomComplet.trim(),
      // Société vide = pas de société : on n'envoie pas une chaîne vide, que le
      // serveur devrait interpréter.
      societe: brouillon.societe?.trim() || undefined,
      role: brouillon.role ?? 'CLIENT',
    },
  });
}

export function suspendreCompte(id: string, motif: string): Promise<ReponseAction> {
  return apiRequest<ReponseAction>(`/api/admin/users/${id}/suspendre`, {
    method: 'POST',
    body: { motif: motif.trim() },
  });
}

export function reactiverCompte(id: string, motif: string): Promise<ReponseAction> {
  return apiRequest<ReponseAction>(`/api/admin/users/${id}/reactiver`, {
    method: 'POST',
    body: { motif: motif.trim() },
  });
}

/**
 * Le contrat ne prévoit **pas** de motif sur cette route (§ 4) : couper l'accès
 * à un client engage le propriétaire et doit être justifié, remettre un mot de
 * passe perdu n'a pas à l'être. On n'en invente donc pas un.
 */
export function reinitialiserMotDePasse(id: string): Promise<ReponseReinitialisation> {
  return apiRequest<ReponseReinitialisation>(
    `/api/admin/users/${id}/reinitialiser-mot-de-passe`,
    { method: 'POST' },
  );
}

export function activiteDuCompte(
  id: string,
  options: { limite?: number } = {},
  signal?: AbortSignal,
): Promise<ReponseActiviteCompte> {
  return apiRequest<ReponseActiviteCompte>(
    `/api/admin/users/${id}/activite${queryString({ limite: options.limite ?? 50 })}`,
    { signal },
  );
}

export function activiteRecente(
  options: { limite?: number } = {},
  signal?: AbortSignal,
): Promise<ReponseActiviteRecente> {
  return apiRequest<ReponseActiviteRecente>(
    `/api/admin/activite${queryString({ limite: options.limite ?? 60 })}`,
    { signal },
  );
}

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

export const STATUT_LABELS: Record<StatutCompte, string> = {
  ACTIF: 'Actif',
  SUSPENDU: 'Suspendu',
};

export const ROLE_LABELS: Record<RoleCompte, string> = {
  CLIENT: 'Client',
  ADMIN: 'Administrateur',
};

/**
 * Traduction des codes du journal.
 *
 * Le propriétaire n'est pas développeur : « LOGIN_BLOCKED_SUSPENDED » ne lui
 * dit rien, « Connexion refusée — compte suspendu » lui dit tout. Un code
 * inconnu (ajouté par une vague ultérieure) est affiché tel quel plutôt que
 * masqué : mieux vaut un libellé technique qu'une ligne qui disparaît.
 */
const ACTIVITE_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Connexion réussie',
  LOGIN_FAILED: 'Échec de connexion',
  LOGIN_BLOCKED_SUSPENDED: 'Connexion refusée — compte suspendu',
  ACCOUNT_LOCKED: 'Compte verrouillé (trop de tentatives)',
  PASSWORD_CHANGED: 'Mot de passe changé',
  LOGOUT: 'Déconnexion',
  TOKEN_REFRESHED: 'Session prolongée',
  REFRESH_TOKEN_REUSE: 'Jeton de session rejoué — sessions révoquées',
  PROJECT_CREATED: 'Projet créé',
  PROJECT_UPDATED: 'Projet modifié',
  PROJECT_DELETED: 'Projet supprimé',
  CALCUL_RUN: 'Calcul lancé',
  CALCUL_SAVED: 'Calcul enregistré',
  CALCUL_DELETED: 'Calcul supprimé',
  REPORT_GENERATED: 'Rapport généré',
  REPORT_DOWNLOADED: 'Rapport téléchargé',
  REPORT_DELETED: 'Rapport supprimé',
};

const ACTION_ADMIN_LABELS: Record<string, string> = {
  CREATE_ACCOUNT: 'Compte créé',
  UPDATE_ACCOUNT: 'Compte modifié',
  SUSPEND: 'Compte suspendu',
  REACTIVATE: 'Compte réactivé',
  RESET_PASSWORD: 'Mot de passe réinitialisé',
};

export function libelleActivite(code: string): string {
  return ACTIVITE_LABELS[code] ?? code;
}

export function libelleActionAdmin(code: string): string {
  return ACTION_ADMIN_LABELS[code] ?? code;
}

/** Les entrées qui méritent d'être signalées visuellement dans un journal. */
export function activiteEstAlerte(code: string): boolean {
  return (
    code === 'LOGIN_FAILED' ||
    code === 'ACCOUNT_LOCKED' ||
    code === 'LOGIN_BLOCKED_SUSPENDED' ||
    code === 'REFRESH_TOKEN_REUSE'
  );
}

/** Vrai si le verrou anti-force-brute est encore en cours. */
export function estVerrouille(compte: Pick<Compte, 'verrouilleJusqua'>): boolean {
  if (!compte.verrouilleJusqua) return false;
  const fin = new Date(compte.verrouilleJusqua).getTime();
  return Number.isFinite(fin) && fin > Date.now();
}
