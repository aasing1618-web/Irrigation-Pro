/**
 * Logique métier de l'authentification.
 *
 * Ces fonctions ne connaissent ni Express, ni `Request`, ni `Response` : elles
 * reçoivent des données simples et un contexte (adresse IP, User-Agent) passé
 * explicitement. C'est ce découplage qui permet de les tester sans serveur HTTP,
 * et c'est aussi ce qui évite qu'un jour une route contourne une vérification
 * en réimplémentant « juste un petit bout » de la connexion.
 *
 * Trois règles structurent tout ce fichier :
 *
 * 1. **Un e-mail inconnu et un mot de passe faux sont indiscernables.** Même
 *    code, même message, même durée — d'où l'appel à `verifyDummyPassword()`
 *    dans la branche « compte inconnu ».
 * 2. **Le statut du compte n'est examiné qu'après un mot de passe correct.**
 *    Sinon `ACCOUNT_SUSPENDED` deviendrait un détecteur de comptes existants.
 * 3. **Aucun mot de passe, aucun jeton, aucun fragment de l'un des deux** ne
 *    part dans les journaux ou dans `metadata`.
 */

import { logger } from '../logger.js';
import {
  logActivity,
  type ActivityAction,
} from '../db/repositories/activity-logs.repo.js';
import {
  createRefreshToken,
  findRefreshTokenByHash,
  revokeAllUserTokens,
  revokeRefreshToken,
  type RevocationReason,
} from '../db/repositories/refresh-tokens.repo.js';
import {
  findUserByEmail,
  findUserById,
  registerFailedLogin,
  registerSuccessfulLogin,
  updatePassword,
} from '../db/repositories/users.repo.js';
import {
  accountLocked,
  accountSuspended,
  invalidCredentials,
  passwordTooWeak,
  passwordUnchanged,
  refreshTokenInvalid,
} from './errors.js';
import {
  checkPasswordPolicy,
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from './password.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from './tokens.js';
import {
  toAuthenticatedUser,
  toPublicUserView,
  type AuthenticatedUser,
  type PublicUserView,
} from './user-view.js';

// ---------------------------------------------------------------------------
// Réglages du verrouillage anti-force brute (contrat, § 3)
// ---------------------------------------------------------------------------

/** Nombre d'échecs à partir duquel le compte se verrouille. */
export const SEUIL_VERROUILLAGE = 5;
/** Durée du premier verrouillage. */
const VERROUILLAGE_INITIAL_MS = 15 * 60 * 1000;
/** Plafond : au-delà, la durée n'augmente plus. */
const VERROUILLAGE_MAXIMAL_MS = 2 * 60 * 60 * 1000;

/**
 * Durée de verrouillage correspondant à un nombre d'échecs consécutifs.
 *
 * Renvoie `null` tant que le seuil n'est pas atteint. Au-delà, la durée double
 * à chaque échec supplémentaire (15 min, 30, 60, 120…) et plafonne à 2 h. Le
 * plafond est volontaire : un verrouillage infini deviendrait une arme, un tiers
 * pourrait bloquer indéfiniment le compte d'un client en saisissant n'importe
 * quoi. Un verrouillage n'est pas une suspension, il expire tout seul.
 */
export function dureeDeVerrouillageMs(nombreEchecs: number): number | null {
  if (nombreEchecs < SEUIL_VERROUILLAGE) return null;
  const doublements = nombreEchecs - SEUIL_VERROUILLAGE;
  // 2^30 suffit largement à dépasser le plafond sans risque de débordement.
  const facteur = 2 ** Math.min(doublements, 30);
  return Math.min(VERROUILLAGE_INITIAL_MS * facteur, VERROUILLAGE_MAXIMAL_MS);
}

// ---------------------------------------------------------------------------
// Types d'entrée / sortie
// ---------------------------------------------------------------------------

/** Contexte de la requête, transmis explicitement pour rester testable. */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Couple de jetons émis pour une session. */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Durée de vie du jeton d'accès, en secondes. */
  expiresIn: number;
}

/** Réponse de `login` et de `changePassword`. */
export interface SessionAvecUtilisateur extends SessionTokens {
  user: PublicUserView;
}

// ---------------------------------------------------------------------------
// Utilitaires internes
// ---------------------------------------------------------------------------

/**
 * Écrit une entrée d'audit sans jamais faire échouer l'opération en cours.
 *
 * Arbitrage assumé : si la table d'audit est momentanément indisponible, on
 * préfère qu'un client puisse quand même se connecter plutôt que de bloquer
 * tout le monde. L'incident part dans les journaux serveur.
 */
async function journaliser(
  action: ActivityAction,
  contexte: RequestContext,
  options: { userId?: string | null; metadata?: Record<string, unknown> | null } = {},
): Promise<void> {
  try {
    await logActivity({
      userId: options.userId ?? null,
      action,
      ipAddress: contexte.ipAddress,
      userAgent: contexte.userAgent,
      metadata: options.metadata ?? null,
    });
  } catch (erreur) {
    logger.error({ err: erreur, action }, 'Écriture du journal d’activité impossible');
  }
}

/** Émet un couple de jetons neuf et enregistre la session longue en base. */
async function ouvrirSession(
  utilisateur: AuthenticatedUser,
  contexte: RequestContext,
): Promise<SessionTokens> {
  const accessToken = await signAccessToken({ id: utilisateur.id, role: utilisateur.role });
  const rafraichissement = generateRefreshToken();

  await createRefreshToken({
    userId: utilisateur.id,
    tokenHash: rafraichissement.tokenHash,
    expiresAt: rafraichissement.expiresAt,
    userAgent: contexte.userAgent,
  });

  return {
    accessToken,
    refreshToken: rafraichissement.token,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Minutes restantes avant la fin d'un verrouillage (au moins 1). */
function minutesRestantes(jusqua: Date, maintenant: Date): number {
  return Math.max(1, Math.ceil((jusqua.getTime() - maintenant.getTime()) / 60_000));
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Connexion.
 *
 * Ordre des opérations, non négociable :
 *   compte inconnu → calcul factice puis même erreur que « mot de passe faux »
 *   compte verrouillé → refus AVANT toute vérification de mot de passe
 *   mot de passe faux → incrément du compteur, éventuel verrouillage
 *   mot de passe correct → et seulement là, contrôle du statut ACTIF/SUSPENDU
 */
export async function login(
  input: LoginInput,
  contexte: RequestContext,
): Promise<SessionAvecUtilisateur> {
  const maintenant = new Date();
  const email = input.email.trim().toLowerCase();

  const ligne = await findUserByEmail(email);

  if (!ligne) {
    // Même coût CPU qu'une vérification réelle : sans cela, le temps de réponse
    // trahirait quelles adresses possèdent un compte.
    await verifyDummyPassword();
    // On ne journalise PAS l'adresse saisie : il arrive qu'un utilisateur tape
    // son mot de passe dans le champ e-mail, et le journal deviendrait alors un
    // dépôt de mots de passe en clair.
    await journaliser('LOGIN_FAILED', contexte, {
      userId: null,
      metadata: { raison: 'IDENTIFIANTS_INCONNUS' },
    });
    throw invalidCredentials();
  }

  // Verrouillage vérifié avant le mot de passe : inutile de brûler 200 ms de
  // CPU pour un compte de toute façon refusé — c'est justement ce coût qui
  // rendrait un déni de service facile.
  if (ligne.locked_until && ligne.locked_until.getTime() > maintenant.getTime()) {
    await journaliser('LOGIN_FAILED', contexte, {
      userId: ligne.id,
      metadata: { raison: 'COMPTE_VERROUILLE' },
    });
    throw accountLocked(minutesRestantes(ligne.locked_until, maintenant));
  }

  const motDePasseCorrect = await verifyPassword(input.password, ligne.password_hash);

  if (!motDePasseCorrect) {
    // `registerFailedLogin` incrémente le compteur ; on doit décider du
    // verrouillage AVANT de connaître la nouvelle valeur, donc on la prédit à
    // partir de la ligne lue. Un écart éventuel (deux tentatives simultanées)
    // est sans conséquence : la tentative suivante corrigera le tir.
    const echecsPrevus = ligne.failed_login_attempts + 1;
    const duree = dureeDeVerrouillageMs(echecsPrevus);
    const verrouJusqua = duree === null ? null : new Date(maintenant.getTime() + duree);

    await registerFailedLogin(ligne.id, verrouJusqua);

    await journaliser('LOGIN_FAILED', contexte, {
      userId: ligne.id,
      metadata: { raison: 'MOT_DE_PASSE_INCORRECT', tentatives: echecsPrevus },
    });

    if (verrouJusqua) {
      await journaliser('ACCOUNT_LOCKED', contexte, {
        userId: ligne.id,
        metadata: { verrouilleJusqua: verrouJusqua.toISOString(), tentatives: echecsPrevus },
      });
    }

    // On renvoie INVALID_CREDENTIALS même sur l'échec qui déclenche le verrou :
    // répondre ACCOUNT_LOCKED dès cet instant révélerait que le compte existe
    // (un e-mail inconnu, lui, ne se verrouille jamais). La tentative suivante
    // recevra bien un 429 avec le délai à attendre.
    throw invalidCredentials();
  }

  const utilisateur = toAuthenticatedUser(ligne);

  // Statut examiné seulement maintenant : après un mot de passe correct.
  if (utilisateur.status === 'SUSPENDU') {
    await journaliser('LOGIN_BLOCKED_SUSPENDED', contexte, { userId: utilisateur.id });
    throw accountSuspended();
  }

  await registerSuccessfulLogin(utilisateur.id);

  const jetons = await ouvrirSession(utilisateur, contexte);

  await journaliser('LOGIN_SUCCESS', contexte, { userId: utilisateur.id });

  return { ...jetons, user: toPublicUserView(utilisateur) };
}

// ---------------------------------------------------------------------------
// Rafraîchissement
// ---------------------------------------------------------------------------

export interface RefreshInput {
  refreshToken: string;
}

/**
 * Que faire d'un jeton de rafraîchissement déjà révoqué qu'on nous représente.
 *
 * L'appelant lève `REFRESH_TOKEN_INVALID` dans tous les cas : la seule question
 * tranchée ici est celle de la réaction du serveur AUTOUR de ce refus.
 *
 * ┌─ Pourquoi la révocation en cascade porte elle aussi le motif `ROTATION` ──┐
 * │ Les sessions coupées par cette cascade étaient ACTIVES : leurs jetons     │
 * │ circulent encore et ressemblent en tout point à des jetons valides. Si    │
 * │ l'un d'eux revient, c'est encore un détenteur qui présente un jeton qu'il │
 * │ croit vivant — exactement la même signature, et l'alerte mérite d'être    │
 * │ répétée : elle montre au propriétaire que la tentative continue.          │
 * │                                                                           │
 * │ Le risque habituel d'une alerte répétée — éjecter un utilisateur          │
 * │ légitime — n'existe pas ici : après une cascade, AUCUNE session du compte │
 * │ ne survit, tout le monde doit de toute façon ressaisir son mot de passe.  │
 * │ Il n'y a donc plus rien à couper par erreur.                              │
 * │                                                                           │
 * │ `ADMIN` aurait rendu les rejeux suivants silencieux, et fait perdre la    │
 * │ chronologie de l'incident ; il décrit par ailleurs une fermeture voulue   │
 * │ par le propriétaire, ce qui serait un contresens. Et l'énumération reste  │
 * │ à quatre valeurs, exactement celles du contrat.                           │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
async function traiterJetonRevoque(
  userId: string,
  motif: RevocationReason | null,
  contexte: RequestContext,
): Promise<void> {
  if (motif === 'ROTATION') {
    await revokeAllUserTokens(userId, 'ROTATION');
    await journaliser('REFRESH_TOKEN_REUSE', contexte, { userId });
    return;
  }

  // `LOGOUT`, `PASSWORD_CHANGE`, `ADMIN` — ou aucun motif, cas des lignes
  // antérieures à la migration 003 : rien d'anormal. On refuse, on note
  // l'information côté serveur, et on ne touche à AUCUNE autre session.
  //
  // Volontairement `logger` et non `activity_logs` : le contrat (§ 4) énumère
  // les actions du journal d'activité, et il n'y a pas lieu d'en inventer une
  // pour un non-événement que le propriétaire n'a pas à voir dans son
  // dashboard. Ni le jeton ni son empreinte ne figurent dans cette trace.
  logger.info(
    { userId, motifRevocation: motif ?? 'INCONNU' },
    'Jeton de rafraîchissement révoqué présenté à nouveau — refus simple, aucune session coupée',
  );
}

/**
 * Prolonge une session.
 *
 * **Rotation systématique** : le jeton présenté est révoqué (motif `ROTATION`)
 * et remplacé. Un jeton n'est donc utilisable qu'une seule fois.
 *
 * **Détection de réutilisation — avec discernement.** Un jeton déjà révoqué qui
 * revient ne veut pas dire la même chose selon la raison de sa révocation
 * (contrat, § `POST /api/auth/refresh`) :
 *
 *   * révoqué par `ROTATION` → il avait été remplacé par un rafraîchissement,
 *     et le voilà de retour : DEUX copies circulent, la légitime et celle d'un
 *     voleur. Impossible de savoir laquelle se présente, donc on coupe tout.
 *   * révoqué par `LOGOUT`, `PASSWORD_CHANGE` ou `ADMIN` → un appareil resté
 *     allumé qui n'avait pas vu la nouvelle. C'est banal. Il reçoit un `401`,
 *     rien de plus.
 *
 * Cette distinction n'est pas un raffinement : sans elle, un ingénieur qui
 * changeait son mot de passe au bureau se faisait éjecter de sa propre session
 * dès que son portable resté à la maison tentait un rafraîchissement. Les
 * autres appareils DOIVENT bien être déconnectés après un changement de mot de
 * passe ; c'est le fait d'y voir une intrusion qui était faux.
 */
export async function refresh(
  input: RefreshInput,
  contexte: RequestContext,
): Promise<SessionTokens> {
  const empreinte = hashRefreshToken(input.refreshToken);
  const enregistrement = await findRefreshTokenByHash(empreinte);

  if (!enregistrement) {
    throw refreshTokenInvalid();
  }

  if (enregistrement.revoked_at !== null) {
    await traiterJetonRevoque(enregistrement.user_id, enregistrement.revoked_reason, contexte);
    throw refreshTokenInvalid();
  }

  if (enregistrement.expires_at.getTime() <= Date.now()) {
    // Clôture technique d'une session périmée. Motif `ADMIN` — « fermée côté
    // serveur » — et surtout PAS `ROTATION` : ce jeton n'a jamais été remplacé,
    // et le marquer ainsi ferait passer pour un vol le simple fait qu'un
    // portable resté hors ligne un mois réessaie deux fois de suite.
    await revokeRefreshToken(empreinte, 'ADMIN');
    throw refreshTokenInvalid();
  }

  const ligne = await findUserById(enregistrement.user_id);
  if (!ligne) {
    // Compte disparu : les sessions orphelines n'ont plus lieu d'être. Ce n'est
    // pas une intrusion, c'est une suppression côté propriétaire → `ADMIN`.
    await revokeAllUserTokens(enregistrement.user_id, 'ADMIN');
    throw refreshTokenInvalid();
  }

  const utilisateur = toAuthenticatedUser(ligne);

  if (utilisateur.status === 'SUSPENDU') {
    await journaliser('LOGIN_BLOCKED_SUSPENDED', contexte, { userId: utilisateur.id });
    throw accountSuspended();
  }

  await revokeRefreshToken(empreinte, 'ROTATION');
  const jetons = await ouvrirSession(utilisateur, contexte);

  await journaliser('TOKEN_REFRESHED', contexte, { userId: utilisateur.id });

  return jetons;
}

// ---------------------------------------------------------------------------
// Déconnexion
// ---------------------------------------------------------------------------

export interface LogoutInput {
  refreshToken: string | null;
}

/**
 * Ferme une session.
 *
 * **Ne échoue jamais** (contrat : toujours `204`). Un utilisateur qui veut
 * partir doit pouvoir partir, même avec un jeton déjà périmé.
 *
 * Le jeton n'est révoqué que s'il appartient bien au compte connecté : sans
 * cette vérification, n'importe quel titulaire de compte pourrait déconnecter
 * les sessions d'un autre en devinant ou en rejouant un jeton.
 */
export async function logout(
  input: LogoutInput,
  utilisateur: AuthenticatedUser,
  contexte: RequestContext,
): Promise<void> {
  try {
    if (input.refreshToken) {
      const empreinte = hashRefreshToken(input.refreshToken);
      const enregistrement = await findRefreshTokenByHash(empreinte);
      if (enregistrement && enregistrement.user_id === utilisateur.id) {
        // Motif `LOGOUT` : ce jeton pourra revenir plus tard sans que le
        // serveur y voie un vol — un appareil qui n'avait pas vu la
        // déconnexion, simplement.
        await revokeRefreshToken(empreinte, 'LOGOUT');
      }
    }
  } catch (erreur) {
    logger.error({ err: erreur }, 'Révocation du jeton de rafraîchissement impossible');
  }

  await journaliser('LOGOUT', contexte, { userId: utilisateur.id });
}

// ---------------------------------------------------------------------------
// Changement de mot de passe
// ---------------------------------------------------------------------------

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Change le mot de passe du compte connecté.
 *
 * C'est aussi le seul chemin de sortie de l'état `mustChangePassword` imposé à
 * la première connexion.
 *
 * Effets de bord obligatoires (contrat, § 2), dans l'ordre :
 *   1. `mustChangePassword` passe à `false` (assuré par `updatePassword`) ;
 *   2. **toutes** les sessions longues sont révoquées — si le mot de passe est
 *      changé parce qu'il a fuité, laisser vivre les sessions ouvertes viderait
 *      l'opération de son sens ;
 *   3. un couple de jetons neuf est émis pour la session en cours, afin que
 *      l'utilisateur ne soit pas éjecté de sa propre application ;
 *   4. l'événement est journalisé.
 */
export async function changePassword(
  input: ChangePasswordInput,
  utilisateur: AuthenticatedUser,
  contexte: RequestContext,
): Promise<SessionAvecUtilisateur> {
  // Relecture en base : `res.locals.user` ne porte pas l'empreinte, et c'est
  // volontaire — elle ne doit pas circuler hors de la couche base.
  const ligne = await findUserById(utilisateur.id);
  if (!ligne) {
    throw invalidCredentials();
  }

  const ancienCorrect = await verifyPassword(input.currentPassword, ligne.password_hash);
  if (!ancienCorrect) {
    throw invalidCredentials();
  }

  const politique = checkPasswordPolicy(input.newPassword);
  if (!politique.ok) {
    throw passwordTooWeak(politique.reason);
  }

  // Comparaison directe d'abord (cas courant), puis contre l'empreinte : les
  // deux sont nécessaires, la première ne coûte rien, la seconde attrape le cas
  // où le client renvoie le même mot de passe sous une autre normalisation.
  if (input.newPassword === input.currentPassword) {
    throw passwordUnchanged();
  }
  if (await verifyPassword(input.newPassword, ligne.password_hash)) {
    throw passwordUnchanged();
  }

  const empreinte = await hashPassword(input.newPassword);
  await updatePassword(utilisateur.id, empreinte);
  // Motif `PASSWORD_CHANGE` : les autres appareils DOIVENT être déconnectés,
  // mais le jour où l'un d'eux tentera un rafraîchissement, il recevra un
  // simple 401 — pas une alerte au vol qui couperait la session en cours.
  await revokeAllUserTokens(utilisateur.id, 'PASSWORD_CHANGE');

  const compteAJour: AuthenticatedUser = { ...utilisateur, mustChangePassword: false };
  const jetons = await ouvrirSession(compteAJour, contexte);

  await journaliser('PASSWORD_CHANGED', contexte, { userId: utilisateur.id });

  return { ...jetons, user: toPublicUserView(compteAJour) };
}
