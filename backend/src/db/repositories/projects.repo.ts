/**
 * Dépôt « projets » — table `projects`.
 *
 * Les résultats de calcul (`project_data`) ont leur propre dépôt :
 * `project-data.repo.ts`. La règle d'isolation ci-dessous s'applique aux deux
 * fichiers, sans exception.
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

/** Les trois statuts, sous forme de tableau figé (validation `zod` des routes). */
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'BROUILLON',
  'EN_COURS',
  'TERMINE',
] as const;

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

/**
 * Une ligne de `projects` accompagnée du nombre de calculs archivés.
 *
 * `calcul_count` est renvoyé en texte : `count(*)` est un `bigint`, que le
 * driver `pg` remonte déjà en chaîne. On l'assume explicitement plutôt que de
 * laisser croire à un `number`.
 */
export type ProjectWithCalculCountRow = ProjectRow & { calcul_count: string };

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

/** Filtres de la liste « mes projets » (contrat d'API Vague 2, § 2). */
export type ListProjectsOptions = {
  status?: ProjectStatus | null;
  /** Texte libre, recherché dans le nom du projet et le nom du client. */
  search?: string | null;
  limit?: number;
  offset?: number;
};

const PROJECT_COLUMNS = `
  id, owner_id, name, client_name, location, description,
  status, created_at, updated_at, deleted_at
`;

/** Mêmes colonnes, préfixées, pour les requêtes qui aliasent la table. */
const PROJECT_COLUMNS_PREFIXED = `
  p.id, p.owner_id, p.name, p.client_name, p.location, p.description,
  p.status, p.created_at, p.updated_at, p.deleted_at
`;

const LIMITE_PAR_DEFAUT = 50;
const LIMITE_MAX = 200;

// ---------------------------------------------------------------------------
// Recherche texte
// ---------------------------------------------------------------------------

/**
 * Prépare un motif `ILIKE` à partir d'un texte saisi par l'utilisateur.
 *
 * Le texte part en paramètre `$n` : il n'y a donc aucun risque d'injection SQL.
 * L'échappement ci-dessous sert à autre chose — empêcher qu'un `%` ou un `_`
 * tapé par l'utilisateur ne devienne un joker et ne ramène toute la liste.
 * Une recherche sur « 100 % » doit chercher « 100 % », pas « n'importe quoi ».
 */
function motifRecherche(texte: string): string {
  const échappé = texte.replace(/[\\%_]/g, (caractère) => `\\${caractère}`);
  return `%${échappé}%`;
}

/** Borne la pagination, quelles que soient les valeurs reçues. */
function bornerPagination(options: { limit?: number; offset?: number }): {
  limit: number;
  offset: number;
} {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? LIMITE_PAR_DEFAUT), 1), LIMITE_MAX);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  return { limit, offset };
}

// ---------------------------------------------------------------------------
// Projets — lectures
// ---------------------------------------------------------------------------

/**
 * Liste les projets non supprimés d'un propriétaire, avec le nombre de calculs
 * archivés sur chacun.
 *
 * Le comptage passe par une sous-requête corrélée plutôt que par un
 * `LEFT JOIN … GROUP BY` : la liste reste correcte même pour un projet sans
 * aucun calcul, et l'index `project_data_project_module_idx` la sert
 * directement.
 */
export async function listProjects(
  ownerId: string,
  options: ListProjectsOptions = {},
  client?: Executor,
): Promise<ProjectWithCalculCountRow[]> {
  const { limit, offset } = bornerPagination(options);
  const recherche = options.search?.trim() ? motifRecherche(options.search.trim()) : null;

  const { rows } = await run<ProjectWithCalculCountRow>(
    client,
    `SELECT ${PROJECT_COLUMNS_PREFIXED},
            (SELECT count(*) FROM project_data d WHERE d.project_id = p.id)::text
              AS calcul_count
       FROM projects p
      WHERE p.owner_id = $1
        AND p.deleted_at IS NULL
        AND ($2::project_status IS NULL OR p.status = $2)
        AND ($3::text IS NULL
             OR p.name ILIKE $3 ESCAPE '\\'
             OR coalesce(p.client_name, '') ILIKE $3 ESCAPE '\\')
      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT $4 OFFSET $5`,
    [ownerId, options.status ?? null, recherche, limit, offset],
  );
  return rows;
}

/**
 * Nombre total de projets correspondant aux mêmes filtres que `listProjects`.
 * Sert le champ `total` de la réponse : la pagination doit compter l'ensemble,
 * pas la page.
 */
export async function countProjects(
  ownerId: string,
  options: Pick<ListProjectsOptions, 'status' | 'search'> = {},
  client?: Executor,
): Promise<number> {
  const recherche = options.search?.trim() ? motifRecherche(options.search.trim()) : null;

  const { rows } = await run<{ total: string }>(
    client,
    `SELECT count(*)::text AS total
       FROM projects p
      WHERE p.owner_id = $1
        AND p.deleted_at IS NULL
        AND ($2::project_status IS NULL OR p.status = $2)
        AND ($3::text IS NULL
             OR p.name ILIKE $3 ESCAPE '\\'
             OR coalesce(p.client_name, '') ILIKE $3 ESCAPE '\\')`,
    [ownerId, options.status ?? null, recherche],
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

/**
 * Crée un projet appartenant à `ownerId`.
 *
 * `ownerId` vient de `res.locals.user`, jamais du corps de la requête : c'est
 * la raison pour laquelle il est un paramètre distinct de `input`, et non un
 * champ de celui-ci. Un `ownerId` envoyé par un client ne peut donc pas se
 * glisser ici par mégarde.
 */
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
 *
 * Le `deleted_at IS NULL` final rend l'opération idempotente et fait qu'une
 * seconde suppression renvoie `false` — donc `404` côté route, ce qui est
 * exact : du point de vue du client, le projet n'existe déjà plus.
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

/**
 * Le projet existe-t-il, vivant, et appartient-il bien à `ownerId` ?
 *
 * Utilisé avant un calcul archivé : inutile de rapatrier toute la ligne pour
 * répondre à une question booléenne. Renvoie `false` aussi bien pour un projet
 * inexistant que pour celui d'un autre client — c'est volontaire, l'appelant
 * ne doit pas pouvoir distinguer les deux cas.
 */
export async function projectBelongsToOwner(
  id: string,
  ownerId: string,
  client?: Executor,
): Promise<boolean> {
  const { rows } = await run<{ existe: boolean }>(
    client,
    `SELECT true AS existe
       FROM projects
      WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [id, ownerId],
  );
  return rows.length > 0;
}
