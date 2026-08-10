/**
 * Routes d'administration — **Vague 3**.
 *
 * Implémentation littérale de `docs/API-VAGUE-3.md` § 2 :
 *
 *   GET   /api/admin/users                              liste des comptes
 *   POST  /api/admin/users                              créer un compte
 *   PATCH /api/admin/users/:id                          modifier un compte
 *   POST  /api/admin/users/:id/suspendre                suspendre (motif exigé)
 *   POST  /api/admin/users/:id/reactiver                réactiver (motif exigé)
 *   POST  /api/admin/users/:id/reinitialiser-mot-de-passe
 *   GET   /api/admin/users/:id/activite                 activité d'un compte
 *   GET   /api/admin/activite                           activité récente, tous comptes
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  LES QUATRE RÈGLES QUI GOUVERNENT CE FICHIER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  1. **L'empreinte du mot de passe ne sort jamais.** Aucune réponse n'est
 *     construite en recopiant une ligne SQL : `vueCompte()` énumère les champs
 *     un par un. En amont, les lectures d'administration ne sélectionnent même
 *     pas la colonne `password_hash` (cf. `users.repo.ts`). Deux barrières.
 *
 *  2. **Un compte CLIENT reçoit 404 sur toutes ces routes**, jamais 403 : un
 *     403 lui apprendrait que le dashboard existe et où il se trouve. Le corps
 *     renvoyé est celui, mot pour mot, d'une URL inexistante — c'est
 *     `garde404` ci-dessous.
 *
 *  3. **Le mot de passe temporaire n'existe en clair qu'une fois**, dans la
 *     réponse HTTP de création ou de réinitialisation. Il n'est ni stocké
 *     (seule son empreinte part en base), ni journalisé, ni plaçable dans
 *     `metadata`, ni réaffichable.
 *
 *  4. **Le propriétaire ne peut pas s'enfermer dehors.** Il n'existe aucune
 *     inscription dans Irrigation Pro : le dernier administrateur actif qui
 *     perdrait son accès ne pourrait le retrouver qu'en repassant par la ligne
 *     de commande sur le serveur. Les garde-fous du § « Auto-verrouillage »
 *     sont donc des refus durs, pas des avertissements.
 *
 *  Et une limite assumée, qui n'est pas un oubli : **aucune route ne donne
 *  accès au contenu des projets d'un client**. Le dashboard gère des comptes,
 *  pas des données métier. La confidentialité des études est un argument
 *  commercial ; on n'y touche pas « pour le support ».
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { generateTemporaryPassword, hashPassword } from '../auth/password.js';
import { withTransaction, type PoolClient } from '../db/index.js';
import {
  countAdminActions,
  listAdminActions,
  logAdminAction,
  type AdminActionRow,
} from '../db/repositories/admin-actions.repo.js';
import {
  assainirMetadata,
  listActivityForUser,
  listRecentActivity,
  type ActivityLogRow,
} from '../db/repositories/activity-logs.repo.js';
import { revokeAllUserTokens } from '../db/repositories/refresh-tokens.repo.js';
import {
  countUsers,
  createUser,
  findUserByEmail,
  findUserByIdForUpdate,
  getUserForAdmin,
  listUsers,
  lockActiveAdminIds,
  reactivateUser,
  resetUserPassword,
  suspendUser,
  updateUserProfile,
  type AdminUserRow,
  type PublicUser,
  type UserRole,
} from '../db/repositories/users.repo.js';
import { AppError, isAppError, notFound } from '../errors.js';
import { getAuthenticatedUser, requireAdmin } from '../middleware/require-auth.js';
import { getValidated, validate } from '../middleware/validate.js';

export const adminRouter: Router = Router();

// ---------------------------------------------------------------------------
// Codes d'erreur propres à cette section (contrat Vague 3, § 3)
// ---------------------------------------------------------------------------

/** 409 — l'adresse est déjà utilisée par un compte existant. */
function emailDejaUtilise(): AppError {
  return new AppError(
    'Un compte utilise déjà cette adresse e-mail.',
    409,
    'EMAIL_DEJA_UTILISE',
  );
}

/**
 * 409 — l'action demandée enfermerait le propriétaire hors de son produit.
 * Le message est explicite : c'est lui qui sera affiché tel quel, et il doit
 * dire *pourquoi* le refus, pas seulement *que* c'est refusé.
 */
function actionImpossible(message: string): AppError {
  return new AppError(message, 409, 'ACTION_IMPOSSIBLE');
}

const MESSAGE_COMPTE_INTROUVABLE = 'Ce compte est introuvable.';

// ---------------------------------------------------------------------------
// Garde : administrateur, ou 404
// ---------------------------------------------------------------------------

/**
 * `requireAdmin` refuse un compte CLIENT avec un `403 FORBIDDEN`. Le contrat en
 * exige un `404` : un 403 confirmerait l'existence de ces routes, donc du
 * dashboard, à quiconque possède un compte client.
 *
 * On ne modifie pas `requireAdmin` (fichier d'authentification de la Vague 1,
 * utilisé ailleurs) : on traduit sa seule erreur de rôle, ici, au bord de la
 * section administrateur. Les autres refus passent intacts — un jeton absent
 * reste un `401`, un compte suspendu reste un `403 ACCOUNT_SUSPENDED`, sans
 * quoi l'application cliente ne saurait plus quoi afficher.
 *
 * Le corps renvoyé est **identique** à celui d'une URL inexistante
 * (`middleware/not-found.ts`), détails compris : rien, pas même la forme de la
 * réponse, ne distingue « vous n'avez pas le droit » de « cela n'existe pas ».
 *
 * ⚠ `req.path`, dans un routeur monté, est le chemin **relatif au point de
 *   montage** (`/users`, et non `/api/admin/users`). Le 404 ordinaire, lui, est
 *   produit au niveau de l'application et renvoie le chemin complet. Renvoyer
 *   ici `req.path` tel quel suffirait donc à trahir qu'un routeur est monté sous
 *   `/api/admin` : la seule forme de la réponse répondrait à la question qu'on
 *   refuse précisément de laisser poser. D'où `req.baseUrl + req.path`.
 */
const garde404: RequestHandler = (req, res, next) => {
  requireAdmin(req, res, (erreur?: unknown) => {
    if (isAppError(erreur) && erreur.statusCode === 403 && erreur.code === 'FORBIDDEN') {
      next(
        notFound('Cette ressource n’existe pas.', {
          method: req.method,
          path: `${req.baseUrl}${req.path}`.slice(0, 200),
        }),
      );
      return;
    }
    next(erreur);
  });
};

adminRouter.use(garde404);

// ---------------------------------------------------------------------------
// Schémas de validation
// ---------------------------------------------------------------------------

/**
 * Un `:id` mal formé est une entrée invalide (`400`), pas une erreur SQL :
 * sans cette validation, `WHERE id = 'abc'` ferait échouer PostgreSQL sur un
 * cast `uuid` et remonterait en `500`.
 */
const schemaParamsCompte = z.object({ id: z.string().uuid() });

const schemaListe = z.object({
  statut: z.enum(['ACTIF', 'SUSPENDU']).optional(),
  role: z.enum(['CLIENT', 'ADMIN']).optional(),
  recherche: z.string().trim().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
  depuis: z.coerce.number().int().min(0).optional(),
});

const schemaJournal = z.object({
  limite: z.coerce.number().int().min(1).max(200).optional(),
  depuis: z.coerce.number().int().min(0).max(1000).optional(),
});

/** Société : facultative, effaçable (`null` ou chaîne vide). */
const champSociete = z
  .union([z.string().trim().max(200), z.null()])
  .optional()
  .transform((valeur) => (valeur === '' ? null : valeur));

const schemaCreation = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(254)
    .email('Cette adresse e-mail n’est pas valide.'),
  nomComplet: z.string().trim().min(1, 'Le nom complet est obligatoire.').max(120),
  societe: champSociete,
  role: z.enum(['CLIENT', 'ADMIN']).optional(),
});

/**
 * Modification : ni l'e-mail (identifiant de connexion) ni le statut (il exige
 * un motif, donc sa propre route) ne sont modifiables ici.
 *
 * `zod` retire les clés inconnues : un `PATCH { "email": "…" }` est vu comme un
 * corps vide et refusé pour cette raison-là — l'adresse n'est jamais changée, et
 * on n'apprend pas au passage quels champs existent.
 */
const schemaModification = z
  .object({
    nomComplet: z.string().trim().min(1).max(120).optional(),
    societe: champSociete,
    role: z.enum(['CLIENT', 'ADMIN']).optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, {
    message: 'Indiquez au moins un champ à modifier.',
  });

/**
 * Motif obligatoire sur suspension et réactivation.
 *
 * Trois caractères minimum : le champ existe pour qu'on puisse répondre, six
 * mois plus tard, à « pourquoi ce client a-t-il été coupé ? ». Un motif vide
 * ou réduit à un point rendrait le journal inutile.
 */
const schemaMotif = z.object({
  motif: z
    .string()
    .trim()
    .min(3, 'Indiquez un motif : il sera conservé dans le journal.')
    .max(500),
});

// ---------------------------------------------------------------------------
// Mise en forme des réponses
// ---------------------------------------------------------------------------

/** Le driver `pg` renvoie des `Date` ; les tests, parfois des chaînes ISO. */
function enIso(valeur: Date | string | null): string | null {
  if (valeur === null) return null;
  return valeur instanceof Date ? valeur.toISOString() : new Date(valeur).toISOString();
}

/**
 * Vue publique d'un compte.
 *
 * Les champs sont énumérés un par un, **jamais** par recopie (`...ligne`) :
 * c'est ce qui garantit qu'une colonne ajoutée un jour à la table `users` ne
 * se retrouve pas exposée sans que personne l'ait décidé. `password_hash` en
 * premier lieu — d'ailleurs absent des lignes lues ici.
 */
function vueCompte(ligne: PublicUser, nombreProjets?: number): Record<string, unknown> {
  return {
    id: ligne.id,
    email: ligne.email,
    nomComplet: ligne.full_name,
    societe: ligne.company,
    role: ligne.role,
    statut: ligne.status,
    doitChangerMotDePasse: ligne.must_change_password,
    derniereConnexion: enIso(ligne.last_login_at),
    creeLe: enIso(ligne.created_at),
    // Verrouillage temporaire anti brute-force : utile au propriétaire quand un
    // client appelle en disant « ça ne marche plus » alors que rien n'a été
    // suspendu. Ce n'est pas un statut, c'est une information de dépannage.
    verrouilleJusqua: enIso(ligne.locked_until),
    ...(nombreProjets === undefined ? {} : { nombreProjets }),
  };
}

/**
 * Vue d'une entrée du journal d'activité.
 *
 * `metadata` repasse par le filtre défensif **à la lecture**, alors qu'il a
 * déjà été appliqué à l'écriture. Ce n'est pas de la redondance gratuite :
 * les lignes écrites avant ce filtre, ou par un futur appelant distrait, ne
 * doivent pas pouvoir remonter jusqu'au dashboard.
 */
function vueActivite(ligne: ActivityLogRow): Record<string, unknown> {
  return {
    id: ligne.id,
    compteId: ligne.user_id,
    action: ligne.action,
    typeEntite: ligne.entity_type,
    entiteId: ligne.entity_id,
    adresseIp: ligne.ip_address,
    appareil: ligne.user_agent,
    contexte: assainirMetadata(ligne.metadata as Record<string, unknown> | null),
    dateHeure: enIso(ligne.created_at),
  };
}

/** Vue d'une décision d'administration. */
function vueActionAdmin(ligne: AdminActionRow): Record<string, unknown> {
  return {
    id: ligne.id,
    auteurId: ligne.admin_id,
    compteCibleId: ligne.target_user_id,
    action: ligne.action,
    motif: ligne.reason,
    contexte: assainirMetadata(ligne.metadata as Record<string, unknown> | null),
    dateHeure: enIso(ligne.created_at),
  };
}

// ---------------------------------------------------------------------------
// Garde-fous d'auto-verrouillage
// ---------------------------------------------------------------------------

/**
 * Vérifie qu'une action ne va pas priver le produit de son dernier
 * administrateur actif, et renvoie le compte visé, verrouillé.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  POURQUOI CETTE FONCTION VERROUILLE AVANT DE COMPTER
 * ═══════════════════════════════════════════════════════════════════════════
 *  Un simple « reste-t-il un autre administrateur actif ? » se laisse
 *  contourner par deux requêtes simultanées : il y a deux administrateurs, on
 *  suspend les deux en même temps, chacune des deux transactions voit encore
 *  l'autre administrateur actif, les deux passent, il n'en reste aucun. Le
 *  propriétaire est alors enfermé dehors — définitivement, du point de vue du
 *  produit, puisqu'il n'existe aucune inscription ni aucune réinitialisation
 *  en libre-service.
 *
 *  `lockActiveAdminIds` verrouille toutes les lignes d'administrateurs actifs
 *  (`SELECT … FOR UPDATE`, toujours triées par `id`, donc sans interblocage
 *  possible). La seconde transaction attend la première, puis relit l'état
 *  réellement validé : l'administrateur suspendu entre-temps ne fait plus
 *  partie de l'ensemble, et le refus tombe.
 *
 *  L'ordre d'acquisition est le même partout : ensemble des administrateurs
 *  actifs d'abord, compte visé ensuite.
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function chargerCibleVerrouillee(
  client: PoolClient,
  cibleId: string,
): Promise<{ cible: PublicUser; autresAdminsActifs: number }> {
  const adminsActifs = await lockActiveAdminIds(client);
  const cible = await findUserByIdForUpdate(cibleId, client);
  if (!cible) throw notFound(MESSAGE_COMPTE_INTROUVABLE);

  return {
    cible,
    autresAdminsActifs: adminsActifs.filter((id) => id !== cibleId).length,
  };
}

/** Le compte visé est-il le dernier administrateur encore actif ? */
function estDernierAdminActif(cible: PublicUser, autresAdminsActifs: number): boolean {
  return cible.role === 'ADMIN' && cible.status === 'ACTIF' && autresAdminsActifs === 0;
}

// ---------------------------------------------------------------------------
// GET /api/admin/users — liste des comptes
// ---------------------------------------------------------------------------

adminRouter.get('/users', validate({ query: schemaListe }), async (_req, res) => {
  const filtres = getValidated<z.infer<typeof schemaListe>>(res, 'query');

  const options = {
    status: filtres.statut ?? null,
    role: filtres.role ?? null,
    search: filtres.recherche ?? null,
  };

  // `total` porte sur l'ensemble des comptes correspondant aux filtres, pas sur
  // la page : sans cela le dashboard ne pourrait pas paginer.
  const [lignes, total] = await Promise.all([
    listUsers({ ...options, limit: filtres.limite ?? 50, offset: filtres.depuis ?? 0 }),
    countUsers(options),
  ]);

  res.status(200).json({
    comptes: lignes.map((ligne: AdminUserRow) =>
      vueCompte(ligne, Number(ligne.project_count ?? 0)),
    ),
    total,
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users — créer un compte
// ---------------------------------------------------------------------------

/** Code PostgreSQL d'une violation de contrainte d'unicité. */
const VIOLATION_UNICITE = '23505';

/**
 * Crée un compte client.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  LE MOT DE PASSE TEMPORAIRE
 * ═══════════════════════════════════════════════════════════════════════════
 *  Il est tiré ici, haché, et l'empreinte seule part en base. La valeur en
 *  clair n'existe que dans cette fonction et dans la réponse HTTP — elle n'est
 *  écrite dans aucun journal (ni `admin_actions`, ni `metadata`, ni les logs
 *  techniques : `logger` ne voit jamais cette variable), et aucune route ne
 *  permet de la réafficher. En cas de perte, la seule issue est la
 *  réinitialisation, qui en tire un nouveau.
 *
 *  C'est ce qui rend la promesse « même le propriétaire ne connaît pas le mot
 *  de passe de ses clients » vraie techniquement, et pas seulement sur le
 *  papier.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'unicité de l'adresse est vérifiée deux fois : par une lecture (message
 * clair) et par l'index unique de la base (deux créations simultanées sur la
 * même adresse — la seconde échoue en `23505`, traduite ici en `409`).
 */
adminRouter.post('/users', validate({ body: schemaCreation }), async (_req, res) => {
  const administrateur = getAuthenticatedUser(res);
  const corps = getValidated<z.infer<typeof schemaCreation>>(res, 'body');

  const motDePasseTemporaire = generateTemporaryPassword();
  const empreinte = await hashPassword(motDePasseTemporaire);

  const compte = await withTransaction(async (client) => {
    if (await findUserByEmail(corps.email, client)) throw emailDejaUtilise();

    const ligne = await createUser(
      {
        email: corps.email,
        passwordHash: empreinte,
        fullName: corps.nomComplet,
        company: corps.societe ?? null,
        role: (corps.role ?? 'CLIENT') satisfies UserRole,
        createdBy: administrateur.id,
      },
      client,
    );

    await logAdminAction(
      {
        adminId: administrateur.id,
        targetUserId: ligne.id,
        action: 'CREATE_ACCOUNT',
        // Ce qui a été décidé, jamais le secret qui l'accompagne.
        metadata: { email: ligne.email, role: ligne.role },
      },
      client,
    );

    return ligne;
  }).catch((erreur: unknown) => {
    if ((erreur as { code?: unknown }).code === VIOLATION_UNICITE) throw emailDejaUtilise();
    throw erreur;
  });

  // `must_change_password` vaut `true` par défaut en base : le client sera
  // obligé de remplacer ce mot de passe à sa première connexion.
  res.status(201).json({
    compte: vueCompte(compte, 0),
    motDePasseTemporaire,
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id — modifier un compte
// ---------------------------------------------------------------------------

adminRouter.patch(
  '/users/:id',
  validate({ params: schemaParamsCompte, body: schemaModification }),
  async (_req, res) => {
    const administrateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');
    const corps = getValidated<z.infer<typeof schemaModification>>(res, 'body');

    const compte = await withTransaction(async (client) => {
      const { cible, autresAdminsActifs } = await chargerCibleVerrouillee(client, id);

      // Retrait du rôle administrateur : les deux garde-fous du contrat.
      if (corps.role !== undefined && corps.role !== 'ADMIN' && cible.role === 'ADMIN') {
        if (cible.id === administrateur.id) {
          throw actionImpossible(
            'Vous ne pouvez pas retirer votre propre rôle administrateur. Demandez à un autre administrateur de le faire.',
          );
        }
        if (estDernierAdminActif(cible, autresAdminsActifs)) {
          throw actionImpossible(
            'Ce compte est le dernier administrateur actif : le rétrograder rendrait le dashboard inaccessible. Créez un autre administrateur d’abord.',
          );
        }
      }

      const patch: { fullName?: string; company?: string | null; role?: UserRole } = {};
      if (corps.nomComplet !== undefined) patch.fullName = corps.nomComplet;
      if (corps.societe !== undefined) patch.company = corps.societe;
      if (corps.role !== undefined) patch.role = corps.role;

      const ligne = await updateUserProfile(id, patch, client);
      if (!ligne) throw notFound(MESSAGE_COMPTE_INTROUVABLE);

      await logAdminAction(
        {
          adminId: administrateur.id,
          targetUserId: id,
          action: 'UPDATE_ACCOUNT',
          // Les NOMS des champs modifiés ; le rôle en clair car c'est une
          // décision, pas une donnée personnelle.
          metadata: {
            champs: Object.keys(corps),
            ...(corps.role === undefined
              ? {}
              : { ancienRole: cible.role, nouveauRole: ligne.role }),
          },
        },
        client,
      );

      return ligne;
    });

    res.status(200).json({ compte: vueCompte(compte) });
  },
);

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/suspendre — suspendre
// ---------------------------------------------------------------------------

/**
 * Suspend un compte : c'est **le seul levier commercial** du propriétaire.
 *
 * Effets, dans cet ordre :
 *   1. statut à `SUSPENDU` et trace dans `admin_actions`, dans une même
 *      transaction — un compte coupé sans trace serait inexplicable ;
 *   2. **toutes les sessions longues sont révoquées** avec le motif `ADMIN`,
 *      une fois la transaction validée.
 *
 *  Pourquoi la révocation vient après le `COMMIT` et non dedans : elle est
 *  irréversible côté client (l'appareil devra se reconnecter). La faire dans la
 *  transaction, c'est risquer de déconnecter un client pour une suspension qui
 *  finit annulée. Dans l'autre sens, une panne entre le `COMMIT` et la
 *  révocation laisserait des sessions ouvertes mais inoffensives : le statut
 *  est relu en base à chaque requête (D-010), le compte est déjà dehors.
 */
adminRouter.post(
  '/users/:id/suspendre',
  validate({ params: schemaParamsCompte, body: schemaMotif }),
  async (_req, res) => {
    const administrateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');
    const { motif } = getValidated<z.infer<typeof schemaMotif>>(res, 'body');

    const compte = await withTransaction(async (client) => {
      const { cible, autresAdminsActifs } = await chargerCibleVerrouillee(client, id);

      if (cible.id === administrateur.id) {
        throw actionImpossible(
          'Vous ne pouvez pas suspendre votre propre compte : plus personne ne pourrait le réactiver.',
        );
      }
      if (estDernierAdminActif(cible, autresAdminsActifs)) {
        throw actionImpossible(
          'Ce compte est le dernier administrateur actif : le suspendre rendrait le dashboard inaccessible. Créez un autre administrateur d’abord.',
        );
      }

      const ligne = await suspendUser(id, client);
      if (!ligne) throw notFound(MESSAGE_COMPTE_INTROUVABLE);

      await logAdminAction(
        {
          adminId: administrateur.id,
          targetUserId: id,
          action: 'SUSPEND',
          reason: motif,
          metadata: { email: ligne.email },
        },
        client,
      );

      return ligne;
    });

    const sessionsRevoquees = await revokeAllUserTokens(id, 'ADMIN');

    res.status(200).json({ compte: vueCompte(compte), sessionsRevoquees });
  },
);

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/reactiver — réactiver
// ---------------------------------------------------------------------------

/**
 * Réactive un compte : statut `ACTIF`, compteur d'échecs remis à zéro, verrou
 * anti brute-force levé. Aucune session n'est rouverte — le client se
 * reconnecte, ce qui est normal après une coupure.
 */
adminRouter.post(
  '/users/:id/reactiver',
  validate({ params: schemaParamsCompte, body: schemaMotif }),
  async (_req, res) => {
    const administrateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');
    const { motif } = getValidated<z.infer<typeof schemaMotif>>(res, 'body');

    const compte = await withTransaction(async (client) => {
      // Aucun garde-fou d'auto-verrouillage ici : une réactivation ne peut que
      // rendre l'accès, jamais le retirer. On verrouille malgré tout dans le
      // même ordre que les autres routes, pour que l'ordre d'acquisition des
      // verrous reste uniforme dans tout le fichier.
      await chargerCibleVerrouillee(client, id);

      const ligne = await reactivateUser(id, client);
      if (!ligne) throw notFound(MESSAGE_COMPTE_INTROUVABLE);

      await logAdminAction(
        {
          adminId: administrateur.id,
          targetUserId: id,
          action: 'REACTIVATE',
          reason: motif,
          metadata: { email: ligne.email },
        },
        client,
      );

      return ligne;
    });

    res.status(200).json({ compte: vueCompte(compte) });
  },
);

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/reinitialiser-mot-de-passe
// ---------------------------------------------------------------------------

/**
 * Tire un nouveau mot de passe temporaire, le renvoie **une seule fois**,
 * repositionne `doitChangerMotDePasse` à vrai et révoque toutes les sessions.
 *
 * La révocation est indispensable : sans elle, un appareil resté connecté
 * continuerait de travailler avec l'ancien mot de passe alors que le
 * propriétaire vient précisément de le remplacer — typiquement à la demande
 * d'un client qui pense s'être fait voler son poste.
 *
 * Le hachage (≈ 100 ms) est fait **avant** d'ouvrir la transaction : inutile de
 * retenir une connexion à la base pendant un calcul de force brute délibérément
 * lent.
 */
adminRouter.post(
  '/users/:id/reinitialiser-mot-de-passe',
  validate({ params: schemaParamsCompte }),
  async (_req, res) => {
    const administrateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');

    const motDePasseTemporaire = generateTemporaryPassword();
    const empreinte = await hashPassword(motDePasseTemporaire);

    const compte = await withTransaction(async (client) => {
      await chargerCibleVerrouillee(client, id);

      const ligne = await resetUserPassword(id, empreinte, client);
      if (!ligne) throw notFound(MESSAGE_COMPTE_INTROUVABLE);

      await logAdminAction(
        {
          adminId: administrateur.id,
          targetUserId: id,
          action: 'RESET_PASSWORD',
          // Aucune trace du mot de passe, pas même sa longueur.
          metadata: { email: ligne.email },
        },
        client,
      );

      return ligne;
    });

    const sessionsRevoquees = await revokeAllUserTokens(id, 'ADMIN');

    res.status(200).json({
      compte: vueCompte(compte),
      motDePasseTemporaire,
      sessionsRevoquees,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id/activite — activité d'un compte
// ---------------------------------------------------------------------------

/**
 * Fiche d'activité d'un compte : ce que le compte a fait (`activity_logs`) et
 * ce qui a été décidé à son sujet (`admin_actions`).
 *
 * Le compte lui-même accompagne la réponse : c'est ce qu'affiche l'écran
 * « fiche d'un compte » du dashboard, et cela lui évite un second appel.
 *
 * ⚠ Aucun contenu de projet n'apparaît ici, jamais — tout au plus le nom d'une
 *   action et l'identifiant d'une entité. Le dashboard gère des comptes.
 *
 * Note d'implémentation : `listActivityForUser` (Vague 1) n'expose pas de
 * décalage ; le paramètre `depuis` est donc appliqué après lecture, sur une
 * fenêtre volontairement bornée. C'est suffisant pour un journal que l'on
 * consulte du plus récent au plus ancien, et cela évite de modifier un dépôt
 * partagé en pleine vague.
 */
adminRouter.get(
  '/users/:id/activite',
  validate({ params: schemaParamsCompte, query: schemaJournal }),
  async (_req, res) => {
    const { id } = getValidated<{ id: string }>(res, 'params');
    const filtres = getValidated<z.infer<typeof schemaJournal>>(res, 'query');

    const limite = filtres.limite ?? 50;
    const depuis = filtres.depuis ?? 0;

    // Un compte inexistant renvoie 404 : sans cette lecture, il serait
    // indistinguable d'un compte sans aucune activité.
    const compte = await getUserForAdmin(id);
    if (!compte) throw notFound(MESSAGE_COMPTE_INTROUVABLE);

    const [activites, actionsAdmin, totalActions] = await Promise.all([
      listActivityForUser(id, { limit: Math.min(limite + depuis, 500) }),
      listAdminActions({ targetUserId: id, limit: limite, offset: depuis }),
      countAdminActions({ targetUserId: id }),
    ]);

    res.status(200).json({
      compte: vueCompte(compte, Number(compte.project_count ?? 0)),
      activites: activites.slice(depuis).map(vueActivite),
      actionsAdmin: actionsAdmin.map(vueActionAdmin),
      totalActionsAdmin: totalActions,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/activite — activité récente, tous comptes
// ---------------------------------------------------------------------------

/**
 * Page d'accueil du dashboard : dernières connexions, échecs, créations, et
 * quelques chiffres.
 *
 * Les compteurs sont des `count(*)` filtrés — le propriétaire voit combien de
 * comptes sont actifs ou suspendus, ce qui est sa donnée à lui.
 */
adminRouter.get('/activite', validate({ query: schemaJournal }), async (_req, res) => {
  const filtres = getValidated<z.infer<typeof schemaJournal>>(res, 'query');
  const limite = filtres.limite ?? 50;
  const depuis = filtres.depuis ?? 0;

  const [activites, actionsAdmin, total, actifs, suspendus] = await Promise.all([
    listRecentActivity({ limit: Math.min(limite + depuis, 500) }),
    listAdminActions({ limit: limite, offset: depuis }),
    countUsers(),
    countUsers({ status: 'ACTIF' }),
    countUsers({ status: 'SUSPENDU' }),
  ]);

  res.status(200).json({
    activites: activites.slice(depuis).map(vueActivite),
    actionsAdmin: actionsAdmin.map(vueActionAdmin),
    statistiques: { comptes: total, comptesActifs: actifs, comptesSuspendus: suspendus },
  });
});
