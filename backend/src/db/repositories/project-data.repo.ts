/**
 * Dépôt « données de projet » — table `project_data`.
 *
 * Une ligne = un calcul archivé : le module employé, les entrées saisies, les
 * résultats produits, et la version du moteur qui les a produits. C'est ce qui
 * permet, deux ans plus tard, de comprendre un rapport déjà remis à un client
 * final : les formules auront évolué, `engine_version` dit avec lesquelles ce
 * résultat-là a été obtenu.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ISOLATION — `project_data` NE PORTE PAS `owner_id`
 * ═══════════════════════════════════════════════════════════════════════
 *  La table ne connaît que `project_id`. L'appartenance se vérifie donc
 *  **par jointure sur `projects.owner_id`**, dans la requête elle-même —
 *  jamais en supposant que l'appelant a déjà contrôlé quelque chose.
 *
 *  Concrètement, toutes les fonctions de ce fichier prennent `ownerId` en
 *  paramètre obligatoire, et aucune ne peut être appelée sans lui. Si le
 *  projet appartient à quelqu'un d'autre, ou s'il a été supprimé
 *  logiquement, la requête ne ramène ou n'affecte aucune ligne : la route
 *  répond alors `404`, comme pour une ressource inexistante.
 *
 *  Ce choix est délibérément « ceinture et bretelles » : la route vérifie
 *  déjà le projet avant d'appeler le dépôt, et le dépôt le revérifie. Une
 *  future route distraite qui oublierait la première vérification resterait
 *  malgré tout cloisonnée.
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { Executor } from '../executor.js';
import { run } from '../executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Une ligne de `project_data` : le résultat archivé d'un module de calcul. */
export type ProjectDataRow = {
  id: string;
  project_id: string;
  module: string;
  inputs: unknown;
  results: unknown;
  engine_version: string;
  computed_at: Date;
};

export type SaveProjectDataInput = {
  module: string;
  inputs: unknown;
  results: unknown;
  engineVersion: string;
};

export type ListProjectDataOptions = {
  /** Filtre facultatif sur le code de module (`BESOINS_EAU`, `CANAL_MANNING`…). */
  module?: string | null;
  limit?: number;
  offset?: number;
};

const PROJECT_DATA_COLUMNS = `
  id, project_id, module, inputs, results, engine_version, computed_at
`;

/** Mêmes colonnes, préfixées, pour les requêtes avec jointure sur `projects`. */
const PROJECT_DATA_COLUMNS_PREFIXED = `
  d.id, d.project_id, d.module, d.inputs, d.results, d.engine_version, d.computed_at
`;

const LIMITE_PAR_DEFAUT = 100;
const LIMITE_MAX = 500;

function bornerPagination(options: { limit?: number; offset?: number }): {
  limit: number;
  offset: number;
} {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? LIMITE_PAR_DEFAUT), 1), LIMITE_MAX);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  return { limit, offset };
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

/**
 * Archive le résultat d'un module de calcul.
 *
 * L'insertion passe par un `INSERT … SELECT` filtré sur `projects.owner_id` :
 * si le projet n'appartient pas à `ownerId` — ou s'il a été supprimé entre la
 * vérification de la route et l'écriture —, aucune ligne n'est insérée et la
 * fonction renvoie `null`. La vérification est donc faite par la base, dans la
 * même requête : impossible de l'oublier côté appelant, et impossible de
 * gagner la course en supprimant le projet pendant le calcul.
 */
export async function saveProjectData(
  projectId: string,
  ownerId: string,
  input: SaveProjectDataInput,
  client?: Executor,
): Promise<ProjectDataRow | null> {
  const { rows } = await run<ProjectDataRow>(
    client,
    `INSERT INTO project_data (project_id, module, inputs, results, engine_version)
     SELECT p.id, $3, $4::jsonb, $5::jsonb, $6
       FROM projects p
      WHERE p.id = $1 AND p.owner_id = $2 AND p.deleted_at IS NULL
     RETURNING ${PROJECT_DATA_COLUMNS}`,
    [
      projectId,
      ownerId,
      input.module,
      JSON.stringify(input.inputs ?? {}),
      JSON.stringify(input.results ?? {}),
      input.engineVersion,
    ],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

/**
 * Historique des calculs d'un projet, du plus récent au plus ancien
 * (contrat d'API Vague 2, § 3).
 */
export async function listProjectData(
  projectId: string,
  ownerId: string,
  options: ListProjectDataOptions = {},
  client?: Executor,
): Promise<ProjectDataRow[]> {
  const { limit, offset } = bornerPagination(options);
  const { rows } = await run<ProjectDataRow>(
    client,
    `SELECT ${PROJECT_DATA_COLUMNS_PREFIXED}
       FROM project_data d
       JOIN projects p ON p.id = d.project_id
      WHERE d.project_id = $1
        AND p.owner_id = $2
        AND p.deleted_at IS NULL
        AND ($3::text IS NULL OR d.module = $3)
      ORDER BY d.computed_at DESC, d.id DESC
      LIMIT $4 OFFSET $5`,
    [projectId, ownerId, options.module ?? null, limit, offset],
  );
  return rows;
}

/** Nombre de calculs archivés sur un projet (`null` impossible : 0 si aucun). */
export async function countProjectData(
  projectId: string,
  ownerId: string,
  options: Pick<ListProjectDataOptions, 'module'> = {},
  client?: Executor,
): Promise<number> {
  const { rows } = await run<{ total: string }>(
    client,
    `SELECT count(*)::text AS total
       FROM project_data d
       JOIN projects p ON p.id = d.project_id
      WHERE d.project_id = $1
        AND p.owner_id = $2
        AND p.deleted_at IS NULL
        AND ($3::text IS NULL OR d.module = $3)`,
    [projectId, ownerId, options.module ?? null],
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Lit un calcul archivé précis.
 *
 * Les **deux** appartenances sont vérifiées dans le `WHERE` : le calcul
 * appartient au projet, et le projet appartient au compte connecté. Un calcul
 * réel dont on aurait deviné l'identifiant, mais rattaché au projet d'un autre
 * client, renvoie `null`.
 */
export async function getProjectData(
  id: string,
  projectId: string,
  ownerId: string,
  client?: Executor,
): Promise<ProjectDataRow | null> {
  const { rows } = await run<ProjectDataRow>(
    client,
    `SELECT ${PROJECT_DATA_COLUMNS_PREFIXED}
       FROM project_data d
       JOIN projects p ON p.id = d.project_id
      WHERE d.id = $1
        AND d.project_id = $2
        AND p.owner_id = $3
        AND p.deleted_at IS NULL`,
    [id, projectId, ownerId],
  );
  return rows[0] ?? null;
}

/** Dernier résultat connu d'un module donné pour un projet. */
export async function getLatestProjectData(
  projectId: string,
  ownerId: string,
  module: string,
  client?: Executor,
): Promise<ProjectDataRow | null> {
  const rows = await listProjectData(projectId, ownerId, { module, limit: 1 }, client);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

/**
 * Retire un calcul archivé.
 *
 * Suppression réelle, et non logique, contrairement aux projets : un calcul
 * n'est pas un document remis à un tiers, c'est une ligne d'historique de
 * travail. Le projet, lui, reste conservé même supprimé.
 *
 * Renvoie `false` si le calcul n'existe pas, s'il appartient à un autre projet,
 * ou si le projet n'est pas celui du compte connecté — trois cas volontairement
 * indiscernables, tous traduits en `404` par la route.
 */
export async function deleteProjectData(
  id: string,
  projectId: string,
  ownerId: string,
  client?: Executor,
): Promise<boolean> {
  const result = await run(
    client,
    `DELETE FROM project_data d
      USING projects p
      WHERE d.id = $1
        AND d.project_id = $2
        AND p.id = d.project_id
        AND p.owner_id = $3
        AND p.deleted_at IS NULL`,
    [id, projectId, ownerId],
  );
  return (result.rowCount ?? 0) > 0;
}
