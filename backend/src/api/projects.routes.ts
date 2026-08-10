/**
 * Routes des projets — **Vague 2**.
 *
 * Implémentation littérale de `docs/API-VAGUE-2.md` § 2 et § 3 :
 *
 *   GET    /api/projects                        liste filtrée et paginée
 *   POST   /api/projects                        création
 *   GET    /api/projects/:id                    fiche + historique des calculs
 *   PATCH  /api/projects/:id                    modification partielle
 *   DELETE /api/projects/:id                    suppression logique
 *   POST   /api/projects/:id/calculs            calculer et archiver
 *   GET    /api/projects/:id/calculs            historique des calculs
 *   DELETE /api/projects/:id/calculs/:calculId  retirer un calcul archivé
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  LES DEUX RÈGLES QUI GOUVERNENT CE FICHIER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  1. **`ownerId` vient toujours de `res.locals.user`.** Jamais du corps, jamais
 *     de la chaîne de requête. Un `ownerId` envoyé par un client est écarté
 *     silencieusement par `zod` (les clés inconnues sont retirées du corps
 *     validé) : il n'atteint même pas le dépôt. On ne renvoie pas d'erreur pour
 *     autant — une erreur apprendrait qu'un tel champ existe.
 *
 *  2. **Ce qui n'appartient pas au compte connecté n'existe pas : `404`,
 *     jamais `403`.** Un `403` confirmerait l'existence du projet, donc
 *     apprendrait à un client combien de projets ont ses concurrents. Cette
 *     règle vaut pour TOUTES les routes ci-dessous, y compris `DELETE` et les
 *     sous-ressources — un `DELETE` renvoyant `403` serait un oracle
 *     d'existence aussi efficace qu'un `GET`.
 *
 *  Les deux règles sont tenues à deux niveaux : la route ne peut pas appeler un
 *  dépôt sans `ownerId` (les signatures l'exigent), et le dépôt met `ownerId`
 *  dans le `WHERE`. Aucune des deux barrières ne suffit seule ; ensemble, elles
 *  rendent l'oubli difficile.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, type Request } from 'express';
import { z } from 'zod';

import { logActivity } from '../db/repositories/activity-logs.repo.js';
import {
  countProjectData,
  deleteProjectData,
  listProjectData,
  saveProjectData,
  type ProjectDataRow,
} from '../db/repositories/project-data.repo.js';
import {
  countProjects,
  createProject,
  getProject,
  listProjects,
  projectBelongsToOwner,
  softDeleteProject,
  updateProject,
  type ProjectRow,
  type ProjectStatus,
  type ProjectWithCalculCountRow,
} from '../db/repositories/projects.repo.js';
import { conflict, notFound } from '../errors.js';
import { getAuthenticatedUser, requireAuth } from '../middleware/require-auth.js';
import { getValidated, validate } from '../middleware/validate.js';
import { executerCalcul, moduleExiste } from './calculs.routes.js';

export const projectsRouter: Router = Router();

/** Aucune route de projet n'est publique. */
projectsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Un seul message pour « ce projet n'existe pas » et « ce projet est celui d'un
 * autre ». C'est la traduction, côté texte, de la règle du 404 : deux messages
 * distincts rétabliraient la fuite que le code de statut vient d'éviter.
 */
const MESSAGE_PROJET_INTROUVABLE = 'Ce projet est introuvable.';
const MESSAGE_CALCUL_INTROUVABLE = 'Ce calcul est introuvable.';

// ---------------------------------------------------------------------------
// Schémas de validation
// ---------------------------------------------------------------------------

/**
 * Un `:id` mal formé est une entrée invalide (`400`), pas une erreur SQL.
 * Sans cette validation, `WHERE id = 'abc'` ferait échouer PostgreSQL sur un
 * cast `uuid` et remonterait en `500` — un défaut, et un signal exploitable.
 */
const schemaParamsProjet = z.object({ id: z.string().uuid() });

const schemaParamsCalcul = z.object({
  id: z.string().uuid(),
  calculId: z.string().uuid(),
});

/** Champ texte facultatif : 500 caractères, chaîne vide traitée comme « vide ». */
const champTexteFacultatif = z
  .union([z.string().trim().max(500), z.null()])
  .optional()
  .transform((valeur) => (valeur === '' ? null : valeur));

const schemaCreation = z.object({
  nom: z.string().trim().min(1, 'Le nom du projet est obligatoire.').max(200),
  nomClient: champTexteFacultatif,
  localisation: champTexteFacultatif,
  description: champTexteFacultatif,
});

/**
 * Modification partielle : tous les champs sont facultatifs, mais il en faut au
 * moins un. Les clés inconnues — `ownerId` en tête — ont déjà été retirées par
 * `zod` quand le `refine` s'exécute : un `PATCH { "ownerId": "…" }` est donc vu
 * comme un corps vide, et refusé pour cette raison-là, sans jamais changer de
 * propriétaire.
 */
const schemaModification = z
  .object({
    nom: z.string().trim().min(1).max(200).optional(),
    nomClient: champTexteFacultatif,
    localisation: champTexteFacultatif,
    description: champTexteFacultatif,
    statut: z.enum(['BROUILLON', 'EN_COURS', 'TERMINE']).optional(),
  })
  .refine((corps) => Object.keys(corps).length > 0, {
    message: 'Indiquez au moins un champ à modifier.',
  });

const schemaListe = z.object({
  statut: z.enum(['BROUILLON', 'EN_COURS', 'TERMINE']).optional(),
  recherche: z.string().trim().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
  depuis: z.coerce.number().int().min(0).optional(),
});

const schemaCalculArchive = z.object({
  module: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Code de module invalide.'),
  entrees: z.record(z.string(), z.unknown()).default({}),
});

const schemaHistorique = z.object({
  module: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Code de module invalide.')
    .optional(),
  limite: z.coerce.number().int().min(1).max(500).optional(),
  depuis: z.coerce.number().int().min(0).optional(),
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
 * Vue publique d'un projet.
 *
 * `owner_id` et `deleted_at` ne sont volontairement pas exposés : le premier
 * est toujours le compte connecté (donc sans intérêt), le second est un détail
 * d'implémentation de la suppression logique.
 */
function vueProjet(ligne: ProjectRow, nombreCalculs?: number): Record<string, unknown> {
  return {
    id: ligne.id,
    nom: ligne.name,
    nomClient: ligne.client_name,
    localisation: ligne.location,
    description: ligne.description,
    statut: ligne.status,
    creeLe: enIso(ligne.created_at),
    modifieLe: enIso(ligne.updated_at),
    ...(nombreCalculs === undefined ? {} : { nombreCalculs }),
  };
}

/** Vue publique d'un calcul archivé. */
function vueCalcul(ligne: ProjectDataRow): Record<string, unknown> {
  return {
    id: ligne.id,
    module: ligne.module,
    entrees: ligne.inputs,
    resultats: ligne.results,
    engineVersion: ligne.engine_version,
    calculeLe: enIso(ligne.computed_at),
  };
}

/** Contexte d'audit : jamais le corps de la requête, jamais un jeton. */
function contexteDeRequete(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET /api/projects — lister mes projets
// ---------------------------------------------------------------------------

/**
 * Liste paginée des projets du compte connecté.
 *
 * `total` compte l'ensemble des projets correspondant aux filtres, pas la page
 * : sans cela l'application ne pourrait pas afficher de pagination. Les projets
 * supprimés logiquement ne sont jamais renvoyés, ni comptés.
 */
projectsRouter.get('/', validate({ query: schemaListe }), async (_req, res) => {
  const utilisateur = getAuthenticatedUser(res);
  const filtres = getValidated<z.infer<typeof schemaListe>>(res, 'query');

  const options = {
    status: filtres.statut ?? null,
    search: filtres.recherche ?? null,
  };

  const [lignes, total] = await Promise.all([
    listProjects(utilisateur.id, {
      ...options,
      limit: filtres.limite ?? 50,
      offset: filtres.depuis ?? 0,
    }),
    countProjects(utilisateur.id, options),
  ]);

  res.status(200).json({
    projets: lignes.map((ligne: ProjectWithCalculCountRow) =>
      vueProjet(ligne, Number(ligne.calcul_count ?? 0)),
    ),
    total,
  });
});

// ---------------------------------------------------------------------------
// POST /api/projects — créer
// ---------------------------------------------------------------------------

/**
 * Crée un projet. Le propriétaire est **toujours** le compte connecté :
 * `createProject` prend `ownerId` en premier paramètre, distinct du corps
 * validé, ce qui rend l'erreur structurellement impossible.
 */
projectsRouter.post('/', validate({ body: schemaCreation }), async (req, res) => {
  const utilisateur = getAuthenticatedUser(res);
  const corps = getValidated<z.infer<typeof schemaCreation>>(res, 'body');

  const ligne = await createProject(utilisateur.id, {
    name: corps.nom,
    clientName: corps.nomClient ?? null,
    location: corps.localisation ?? null,
    description: corps.description ?? null,
  });

  await logActivity({
    userId: utilisateur.id,
    action: 'PROJECT_CREATED',
    entityType: 'project',
    entityId: ligne.id,
    ...contexteDeRequete(req),
  });

  res.status(201).json({ projet: vueProjet(ligne, 0) });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id — ouvrir
// ---------------------------------------------------------------------------

/** Fiche d'un projet, accompagnée de son historique de calculs. */
projectsRouter.get('/:id', validate({ params: schemaParamsProjet }), async (_req, res) => {
  const utilisateur = getAuthenticatedUser(res);
  const { id } = getValidated<{ id: string }>(res, 'params');

  const ligne = await getProject(id, utilisateur.id);
  if (!ligne) throw notFound(MESSAGE_PROJET_INTROUVABLE);

  // `nombreCalculs` est compté à part plutôt que déduit de `calculs.length` :
  // l'historique est plafonné, le compteur ne doit pas l'être. Un projet à
  // 300 calculs afficherait sinon « 100 ».
  const [calculs, nombreCalculs] = await Promise.all([
    listProjectData(id, utilisateur.id),
    countProjectData(id, utilisateur.id),
  ]);

  res.status(200).json({
    projet: {
      ...vueProjet(ligne, nombreCalculs),
      calculs: calculs.map(vueCalcul),
    },
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/projects/:id — modifier
// ---------------------------------------------------------------------------

projectsRouter.patch(
  '/:id',
  validate({ params: schemaParamsProjet, body: schemaModification }),
  async (req, res) => {
    const utilisateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');
    const corps = getValidated<z.infer<typeof schemaModification>>(res, 'body');

    const patch: {
      name?: string;
      clientName?: string | null;
      location?: string | null;
      description?: string | null;
      status?: ProjectStatus;
    } = {};
    if (corps.nom !== undefined) patch.name = corps.nom;
    if (corps.nomClient !== undefined) patch.clientName = corps.nomClient;
    if (corps.localisation !== undefined) patch.location = corps.localisation;
    if (corps.description !== undefined) patch.description = corps.description;
    if (corps.statut !== undefined) patch.status = corps.statut;

    const ligne = await updateProject(id, utilisateur.id, patch);
    if (!ligne) throw notFound(MESSAGE_PROJET_INTROUVABLE);

    // Même forme de projet que dans la liste et à la création : l'application
    // peut remplacer sa ligne sans devoir recharger la liste entière.
    const nombreCalculs = await countProjectData(id, utilisateur.id);

    await logActivity({
      userId: utilisateur.id,
      action: 'PROJECT_UPDATED',
      entityType: 'project',
      entityId: ligne.id,
      ...contexteDeRequete(req),
      // Les NOMS des champs modifiés, pas leurs valeurs : un journal d'audit
      // dit ce qui a changé, il ne recopie pas le dossier du client.
      metadata: { champs: Object.keys(corps) },
    });

    res.status(200).json({ projet: vueProjet(ligne, nombreCalculs) });
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/projects/:id — supprimer (suppression logique)
// ---------------------------------------------------------------------------

/**
 * Suppression **logique** : `deleted_at` est renseigné, la ligne reste en base.
 * Motif retenu par le contrat : les rapports déjà remis à un client final
 * doivent rester traçables.
 *
 * Un projet déjà supprimé renvoie `404` : du point de vue de l'application, il
 * n'existe plus. Celui d'un autre client renvoie exactement la même chose.
 */
projectsRouter.delete('/:id', validate({ params: schemaParamsProjet }), async (req, res) => {
  const utilisateur = getAuthenticatedUser(res);
  const { id } = getValidated<{ id: string }>(res, 'params');

  const supprime = await softDeleteProject(id, utilisateur.id);
  if (!supprime) throw notFound(MESSAGE_PROJET_INTROUVABLE);

  await logActivity({
    userId: utilisateur.id,
    action: 'PROJECT_DELETED',
    entityType: 'project',
    entityId: id,
    ...contexteDeRequete(req),
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/calculs — calculer et archiver
// ---------------------------------------------------------------------------

/**
 * Lance un calcul et l'archive dans `project_data`.
 *
 * Ordre imposé par le contrat : on vérifie **d'abord** que le projet appartient
 * au compte connecté, on calcule ensuite, on enregistre enfin. Faire le calcul
 * avant la vérification donnerait un oracle de temps de réponse, et ferait
 * travailler le serveur pour une requête qui finira en `404`.
 *
 * `saveProjectData` refait la vérification dans son `INSERT … SELECT` : si le
 * projet a été supprimé pendant le calcul, aucune ligne n'est écrite et la
 * réponse est `409 CONFLICT` — l'état a changé sous nos pieds, ce n'est pas la
 * même chose qu'un projet introuvable.
 */
projectsRouter.post(
  '/:id/calculs',
  validate({ params: schemaParamsProjet, body: schemaCalculArchive }),
  async (req, res) => {
    const utilisateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');
    const corps = getValidated<z.infer<typeof schemaCalculArchive>>(res, 'body');

    if (!(await projectBelongsToOwner(id, utilisateur.id))) {
      throw notFound(MESSAGE_PROJET_INTROUVABLE);
    }

    if (!moduleExiste(corps.module)) {
      throw notFound('Module de calcul inconnu.');
    }

    const calcul = await executerCalcul(corps.module, corps.entrees);

    const ligne = await saveProjectData(id, utilisateur.id, {
      module: corps.module,
      inputs: corps.entrees,
      results: calcul.resultats,
      engineVersion: calcul.engineVersion,
    });
    if (!ligne) {
      throw conflict('Ce projet a été supprimé pendant le calcul : le résultat n’a pas été enregistré.');
    }

    await logActivity({
      userId: utilisateur.id,
      action: 'CALCUL_SAVED',
      entityType: 'project',
      entityId: id,
      ...contexteDeRequete(req),
      metadata: { module: corps.module, engineVersion: calcul.engineVersion, calculId: ligne.id },
    });

    res.status(201).json({
      calcul: vueCalcul(ligne),
      avertissements: calcul.avertissements,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/projects/:id/calculs — historique
// ---------------------------------------------------------------------------

projectsRouter.get(
  '/:id/calculs',
  validate({ params: schemaParamsProjet, query: schemaHistorique }),
  async (_req, res) => {
    const utilisateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');
    const filtres = getValidated<z.infer<typeof schemaHistorique>>(res, 'query');

    // Le projet est vérifié explicitement : sans cela, un projet inexistant et
    // un projet vide renverraient tous deux une liste vide — et l'application
    // ne pourrait pas distinguer « aucun calcul » de « projet introuvable ».
    if (!(await projectBelongsToOwner(id, utilisateur.id))) {
      throw notFound(MESSAGE_PROJET_INTROUVABLE);
    }

    const lignes = await listProjectData(id, utilisateur.id, {
      module: filtres.module ?? null,
      limit: filtres.limite ?? 100,
      offset: filtres.depuis ?? 0,
    });

    res.status(200).json({ calculs: lignes.map(vueCalcul) });
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/projects/:id/calculs/:calculId — retirer un calcul archivé
// ---------------------------------------------------------------------------

/**
 * Retire un calcul de l'historique.
 *
 * Les **deux** appartenances sont vérifiées, comme l'exige le contrat : le
 * calcul appartient au projet, et le projet appartient au compte connecté.
 * `deleteProjectData` les impose toutes les deux dans une seule requête, ce qui
 * évite la fenêtre entre une vérification et une suppression.
 */
projectsRouter.delete(
  '/:id/calculs/:calculId',
  validate({ params: schemaParamsCalcul }),
  async (req, res) => {
    const utilisateur = getAuthenticatedUser(res);
    const { id, calculId } = getValidated<{ id: string; calculId: string }>(res, 'params');

    const supprime = await deleteProjectData(calculId, id, utilisateur.id);
    if (!supprime) throw notFound(MESSAGE_CALCUL_INTROUVABLE);

    await logActivity({
      userId: utilisateur.id,
      action: 'CALCUL_DELETED',
      entityType: 'project',
      entityId: id,
      ...contexteDeRequete(req),
      metadata: { calculId },
    });

    res.status(204).end();
  },
);
