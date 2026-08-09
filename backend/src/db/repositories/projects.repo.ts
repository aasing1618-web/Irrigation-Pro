/**
 * Dépôt « projets » — table `projects` et sa table fille `project_data`.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  RÈGLE D'ISOLATION — NON NÉGOCIABLE
 * ═══════════════════════════════════════════════════════════════════════
 *  Toute fonction qui LIT ou MODIFIE un projet, une donnée de projet ou un
 *  rapport prend `ownerId` en paramètre OBLIGATOIRE, et ce `ownerId` figure
 *  dans le `WHERE` de la requête SQL.
 *
 *  Autrement dit : il n'existe pas, et il ne doit jamais exister, de
 *  fonction `getProjectById(id)` sans propriétaire. Si un client tente
 *  d'ouvrir le projet d'un autre client, la requête ne ramène simplement
 *  aucune ligne — le cloisonnement est assuré par la base, pas par un
 *  `if` dans l'interface ni même dans une route.
 *
 *  Pour les données de projet et les rapports, dont la table ne porte pas
 *  toujours `owner_id`, le filtre passe par une jointure ou un `EXISTS` sur
 *  `projects.owner_id` : le résultat est le même.
 *
 *  Si vous ajoutez une fonction ici, la question à se poser est :
 *  « un client B pourrait-il, en devinant un identifiant, obtenir une donnée
 *  du client A ? » — si la réponse n'est pas un non catégorique, la fonction
 *  est incorrecte.
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { Executor } from '../executor.js';
import { run } from '../executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectStatus = 'BROUILLON' | 'EN_COURS' | 'TERMINE';

/** Une ligne de `projects` (déclarée en `type` : contrainte du driver `pg`). */
export type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  client_name: string | null;
  location: string | null;
  description: string | null;
  status: ProjectStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

/** Une ligne de `project_data` : le résultat d'un module de calcul. */
export type ProjectDataRow = {
  id: string;
  project_id: string;
  module: string;
  inputs: unknown;
  results: unknown;
  engine_version: string;
  computed_at: Date;
};

export type CreateProjectInput = {
  name: string;
  clientName?: string | null;
  location?: string | null;
  description?: string | null;
  status?: ProjectStatus;
};

export type UpdateProjectInput = {
  name?: string;
  clientName?: string | null;
  location?: string | null;
  description?: string | null;
  status?: ProjectStatus;
};

export type SaveProjectDataInput = {
  module: string;
  inputs: unknown;
  results: unknown;
  engineVersion: string;
};

const PROJECT_COLUMNS = `
  id, owner_id, name, client_name, location, description,
  status, created_at, updated_at, deleted_at
`;

const PROJECT_DATA_COLUMNS = `
  id, project_id, module, inputs, results, engine_version, computed_at
`;

/** Mêmes colonnes, préfixées, pour les requêtes avec jointure sur `projects`. */
const PROJECT_DATA_COLUMNS_PREFIXED = `
  d.id, d.project_id, d.module, d.inputs, d.results, d.engine_version, d.computed_at
`;

// ---------------------------------------------------------------------------
// Projets — lectures
// ---------------------------------------------------------------------------

/** Liste les projets non supprimés d'un propriétaire. */
export async function listProjects(
  ownerId: string,
  options: { limit?: number; offset?: number } = {},
  client?: Executor,
): Promise<ProjectRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const { rows } = await run<ProjectRow>(
    client,
    `SELECT ${PROJECT_COLUMNS}
       FROM projects
      WHERE owner_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3`,
    [ownerId, limit, offset],
  );
  return rows;
}

/** Nombre de projets non supprimés d'un propriétaire. */
export async function countProjects(ownerId: string, client?: Executor): Promise<number> {
  const { rows } = await run<{ total: string }>(
    client,
    `SELECT count(*)::text AS total
       FROM projects
      WHERE owner_id = $1 AND deleted_at IS NULL`,
    [ownerId],
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Ouvre un projet. `ownerId` est obligatoire : un projet appartenant à un
 * autre compte renvoie `null`, exactement comme un projet inexistant
 * (on ne révèle pas son existence).
 */
export async function getProject(
  id: string,
  ownerId: string,
  client?: Executor,
): Promise<ProjectRow | null> {
  const { rows } = await run<ProjectRow>(
    client,
    `SELECT ${PROJECT_COLUMNS}
       FROM projects
      WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [id, ownerId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Projets — écritures
// ---------------------------------------------------------------------------

/** Crée un projet appartenant à `ownerId`. */
export async function createProject(
  ownerId: string,
  input: CreateProjectInput,
  client?: Executor,
): Promise<ProjectRow> {
  const { rows } = await run<ProjectRow>(
    client,
    `INSERT INTO projects (owner_id, name, client_name, location, description, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${PROJECT_COLUMNS}`,
    [
      ownerId,
      input.name.trim(),
      input.clientName ?? null,
      input.location ?? null,
      input.description ?? null,
      input.status ?? 'BROUILLON',
    ],
  );
  const created = rows[0];
  if (!created) throw new Error('Création du projet impossible : aucune ligne renvoyée.');
  return created;
}

/**
 * Correspondance champ TypeScript → colonne SQL pour la mise à jour partielle.
 *
 * Les noms de colonnes viennent de cette constante figée, écrite à la main :
 * jamais d'une entrée utilisateur. Les VALEURS, elles, restent transmises en
 * paramètres `$n`. Aucune concaténation de donnée dans le SQL.
 */
const UPDATABLE_COLUMNS: ReadonlyArray<readonly [keyof UpdateProjectInput, string]> = [
  ['name', 'name'],
  ['clientName', 'client_name'],
  ['location', 'location'],
  ['description', 'description'],
  ['status', 'status'],
];

/** Modifie un projet. Renvoie `null` si le projet n'appartient pas à `ownerId`. */
export async function updateProject(
  id: string,
  ownerId: string,
  patch: UpdateProjectInput,
  client?: Executor,
): Promise<ProjectRow | null> {
  const assignments: string[] = [];
  const params: unknown[] = [id, ownerId];

  for (const [field, column] of UPDATABLE_COLUMNS) {
    const value = patch[field];
    if (value === undefined) continue;
    params.push(field === 'name' && typeof value === 'string' ? value.trim() : value);
    assignments.push(`${column} = $${params.length}`);
  }

  // Rien à modifier : on renvoie l'état courant sans toucher à `updated_at`.
  if (assignments.length === 0) return getProject(id, ownerId, client);

  const { rows } = await run<ProjectRow>(
    client,
    `UPDATE projects
        SET ${assignments.join(', ')}
      WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
      RETURNING ${PROJECT_COLUMNS}`,
    params,
  );
  return rows[0] ?? null;
}

/**
 * Suppression logique : le projet disparaît de l'application mais la ligne
 * est conservée. Renvoie `false` si le projet n'appartient pas à `ownerId`.
 */
export async function softDeleteProject(
  id: string,
  ownerId: string,
  client?: Executor,
): Promise<boolean> {
  const result = await run(
    client,
    `UPDATE projects
        SET deleted_at = now()
      WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [id, ownerId],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Données de projet (résultats de calcul)
// ---------------------------------------------------------------------------

/**
 * Enregistre le résultat d'un module de calcul.
 *
 * L'insertion passe par un `INSERT … SELECT` filtré sur `projects.owner_id` :
 * si le projet n'appartient pas à `ownerId`, aucune ligne n'est insérée et la
 * fonction renvoie `null`. La vérification est donc faite par la base, dans la
 * même requête — impossible de l'oublier côté appelant.
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

/** Historique des calculs d'un projet, du plus récent au plus ancien. */
export async function listProjectData(
  projectId: string,
  ownerId: string,
  options: { module?: string; limit?: number } = {},
  client?: Executor,
): Promise<ProjectDataRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const { rows } = await run<ProjectDataRow>(
    client,
    `SELECT ${PROJECT_DATA_COLUMNS_PREFIXED}
       FROM project_data d
       JOIN projects p ON p.id = d.project_id
      WHERE d.project_id = $1
        AND p.owner_id = $2
        AND p.deleted_at IS NULL
        AND ($3::text IS NULL OR d.module = $3)
      ORDER BY d.computed_at DESC
      LIMIT $4`,
    [projectId, ownerId, options.module ?? null, limit],
  );
  return rows;
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
