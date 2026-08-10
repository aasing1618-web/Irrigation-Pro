/**
 * Les projets, vus par l'application.
 *
 * Ce module traduit le contrat d'API (docs/API-VAGUE-2.md, § 2) en types et en
 * appels. Il ne décide rien : l'isolation des données est faite par le serveur,
 * qui filtre chaque requête sur le propriétaire connecté et répond `404` pour
 * un projet qui n'est pas le vôtre. L'application ne fait que refléter cela.
 *
 * ## Pourquoi une lecture défensive
 *
 * Le serveur est écrit en parallèle de l'application. Un champ d'affichage
 * absent ou d'un type inattendu ne doit pas provoquer un écran blanc chez un
 * ingénieur en pleine journée de travail : chaque valeur est relue avec un
 * repli explicite. Seuls le code HTTP et le `code` d'erreur font foi.
 */

import { apiRequest } from './api';

/* --- Types ---------------------------------------------------------------- */

export const PROJECT_STATUSES = ['BROUILLON', 'EN_COURS', 'TERMINE'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Libellés affichés — le serveur, lui, ne connaît que les codes. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  BROUILLON: 'Brouillon',
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
};

export interface Project {
  id: string;
  nom: string;
  nomClient: string;
  localisation: string;
  description: string;
  statut: ProjectStatus;
  creeLe: string;
  modifieLe: string;
  /** Nombre de calculs archivés ; 0 si le serveur ne le fournit pas. */
  nombreCalculs: number;
}

/** Un calcul archivé dans un projet (contrat, § 3). */
export interface ArchivedCalcul {
  id: string;
  /** Code du module, tel que le catalogue le nomme. */
  module: string;
  entrees: Record<string, unknown>;
  resultats: Record<string, unknown>;
  avertissements: unknown[];
  engineVersion: string;
  calculeLe: string;
}

/** Projet ouvert : les informations, plus ses calculs archivés. */
export interface ProjectDetail extends Project {
  calculs: ArchivedCalcul[];
}

export interface ProjectListResult {
  projets: Project[];
  total: number;
}

/** Champs modifiables d'un projet, tels que le formulaire les produit. */
export interface ProjectDraft {
  nom: string;
  nomClient: string;
  localisation: string;
  description: string;
  statut: ProjectStatus;
}

export const EMPTY_PROJECT_DRAFT: ProjectDraft = {
  nom: '',
  nomClient: '',
  localisation: '',
  description: '',
  statut: 'BROUILLON',
};

/* --- Lecture défensive ----------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Un statut inconnu est ramené à « Brouillon » plutôt que d'afficher un code brut. */
export function asProjectStatus(value: unknown): ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus)
    ? (value as ProjectStatus)
    : 'BROUILLON';
}

function readProject(raw: unknown): Project {
  const record = asRecord(raw);
  return {
    id: asText(record.id),
    nom: asText(record.nom),
    nomClient: asText(record.nomClient),
    localisation: asText(record.localisation),
    description: asText(record.description),
    statut: asProjectStatus(record.statut),
    creeLe: asText(record.creeLe),
    modifieLe: asText(record.modifieLe) || asText(record.creeLe),
    nombreCalculs: asCount(record.nombreCalculs),
  };
}

export function readArchivedCalcul(raw: unknown): ArchivedCalcul {
  const record = asRecord(raw);
  return {
    id: asText(record.id),
    module: asText(record.module),
    entrees: asRecord(record.entrees),
    resultats: asRecord(record.resultats),
    avertissements: Array.isArray(record.avertissements) ? record.avertissements : [],
    engineVersion: asText(record.engineVersion),
    calculeLe: asText(record.calculeLe) || asText(record.creeLe),
  };
}

function readProjectDetail(raw: unknown): ProjectDetail {
  const record = asRecord(raw);
  return {
    ...readProject(record),
    calculs: Array.isArray(record.calculs) ? record.calculs.map(readArchivedCalcul) : [],
  };
}

/* --- Appels --------------------------------------------------------------- */

export interface ProjectQuery {
  /** Texte libre sur le nom et le nom du client — filtré par le serveur. */
  recherche?: string;
  statut?: ProjectStatus | 'TOUS';
  limite?: number;
}

/** Construit la chaîne de requête sans y glisser de paramètre vide. */
function toSearchParams(query: ProjectQuery): string {
  const params = new URLSearchParams();
  const recherche = query.recherche?.trim();
  if (recherche) params.set('recherche', recherche);
  if (query.statut && query.statut !== 'TOUS') params.set('statut', query.statut);
  if (query.limite) params.set('limite', String(query.limite));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export async function fetchProjects(
  query: ProjectQuery = {},
  signal?: AbortSignal,
): Promise<ProjectListResult> {
  const payload = await apiRequest<unknown>(`/api/projects${toSearchParams(query)}`, {
    signal,
  });
  const record = asRecord(payload);
  const projets = Array.isArray(record.projets) ? record.projets.map(readProject) : [];
  return {
    projets,
    total: typeof record.total === 'number' ? record.total : projets.length,
  };
}

export async function fetchProject(id: string, signal?: AbortSignal): Promise<ProjectDetail> {
  const payload = await apiRequest<unknown>(`/api/projects/${encodeURIComponent(id)}`, {
    signal,
  });
  return readProjectDetail(asRecord(payload).projet);
}

/**
 * Création.
 *
 * Les champs facultatifs vides ne sont pas envoyés : le serveur n'a pas à
 * distinguer « non renseigné » de « chaîne vide ». Aucun `ownerId` n'est
 * envoyé — le contrat précise qu'il serait de toute façon ignoré, et l'envoyer
 * laisserait croire que l'application a son mot à dire.
 */
export async function createProject(draft: ProjectDraft): Promise<Project> {
  const body: Record<string, unknown> = { nom: draft.nom.trim() };
  for (const key of ['nomClient', 'localisation', 'description'] as const) {
    const value = draft[key].trim();
    if (value) body[key] = value;
  }
  if (draft.statut !== 'BROUILLON') body.statut = draft.statut;

  const payload = await apiRequest<unknown>('/api/projects', { method: 'POST', body });
  return readProject(asRecord(payload).projet ?? payload);
}

/**
 * Modification.
 *
 * Tous les champs du formulaire sont envoyés, y compris ceux vidés
 * volontairement : c'est ainsi qu'on efface une localisation devenue fausse.
 */
export async function updateProject(id: string, draft: ProjectDraft): Promise<Project> {
  const body = {
    nom: draft.nom.trim(),
    nomClient: draft.nomClient.trim(),
    localisation: draft.localisation.trim(),
    description: draft.description.trim(),
    statut: draft.statut,
  };

  const payload = await apiRequest<unknown>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
  });
  return readProject(asRecord(payload).projet ?? payload);
}

/**
 * Suppression.
 *
 * Le serveur fait une suppression **logique** : la ligne est conservée pour que
 * les rapports déjà remis à un client final restent traçables. L'interface le
 * dit en une phrase simple, sans le mot « logique ».
 */
export async function deleteProject(id: string): Promise<void> {
  await apiRequest<void>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
