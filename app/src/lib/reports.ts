/**
 * Les rapports PDF, vus par l'application.
 *
 * Traduction du contrat `docs/API-VAGUE-3.md`, § 1. Le document lui-même est
 * **entièrement produit par le serveur** : ni sa mise en page, ni son contenu,
 * ni sa référence ne sont décidés ici. L'application demande, liste, télécharge
 * et supprime — rien d'autre. C'est la même règle que pour les calculs
 * (décision D-007) : ce qui fait la valeur du produit ne descend pas sur un
 * poste Windows où l'on peut le lire.
 *
 * Lecture défensive comme partout ailleurs : un champ manquant ne doit pas
 * vider l'écran d'un ingénieur en pleine journée de travail.
 */

import { apiFileRequest, apiRequest } from './api';
import type { ArchivedCalcul } from './projects';

/* --- Types ---------------------------------------------------------------- */

/** Un rapport déjà produit, tel que `GET /projects/:id/reports` le décrit. */
export interface ProjectReport {
  id: string;
  /**
   * Référence lisible, de la forme `RAP-2026-0042`. **Elle est imprimée sur le
   * document remis au client final** : c'est par elle qu'on retrouve un rapport
   * dont on ne sait plus rien d'autre. Elle est attribuée par le serveur.
   */
  reference: string;
  genereLe: string;
  nombreCalculs: number;
  /**
   * Faux quand le fichier n'est plus sur le serveur. L'application grise alors
   * le téléchargement plutôt que de proposer une action vouée à l'échec.
   */
  fichierDisponible: boolean;
}

/** Ce que renvoie la génération : de quoi afficher la référence obtenue. */
export interface GeneratedReport {
  id: string;
  reference: string;
  genereLe: string;
}

/** Ce que l'utilisateur décide dans la fenêtre de préparation. */
export interface ReportRequest {
  /**
   * Calculs à reprendre. Omis, le serveur retient **le dernier calcul de chaque
   * module** du projet (contrat, § 1).
   */
  calculIds?: string[];
  notes?: string;
}

/** Plafond imposé par le serveur ; rappelé ici pour l'annoncer avant l'envoi. */
export const MAX_CALCULS_PAR_RAPPORT = 40;

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

/**
 * Un rapport lu depuis le serveur.
 *
 * `fichierDisponible` n'est considéré comme faux que si le serveur le dit
 * explicitement : en cas de champ absent, mieux vaut proposer un
 * téléchargement qui échouera avec un message clair que griser sans raison
 * tous les rapports d'un client.
 */
export function readReport(raw: unknown): ProjectReport {
  const record = asRecord(raw);
  return {
    id: asText(record.id),
    reference: asText(record.reference),
    genereLe: asText(record.genereLe),
    nombreCalculs: asCount(record.nombreCalculs),
    fichierDisponible: record.fichierDisponible !== false,
  };
}

function readGenerated(raw: unknown): GeneratedReport {
  const record = asRecord(raw);
  return {
    id: asText(record.id),
    reference: asText(record.reference),
    genereLe: asText(record.genereLe),
  };
}

/* --- Sélection par défaut --------------------------------------------------- */

/**
 * Le dernier calcul de chaque module — exactement ce que le serveur retient
 * quand `calculIds` est omis.
 *
 * La fenêtre de préparation part de cette sélection : l'utilisateur retrouve
 * cochée la composition qu'il aurait obtenue sans rien choisir, et voit d'un
 * coup d'œil ce qu'il ajoute ou retire. Le tri est refait ici plutôt que de
 * faire confiance à l'ordre reçu : une sélection par défaut fausse produirait
 * un document faux, remis à un client.
 */
export function derniersCalculsParModule(calculs: ArchivedCalcul[]): string[] {
  const plusRecentParModule = new Map<string, ArchivedCalcul>();

  for (const calcul of calculs) {
    const actuel = plusRecentParModule.get(calcul.module);
    if (!actuel || dateDe(calcul) > dateDe(actuel)) {
      plusRecentParModule.set(calcul.module, calcul);
    }
  }

  // Renvoyés dans l'ordre de la liste affichée, pas dans celui de la Map.
  const retenus = new Set([...plusRecentParModule.values()].map((calcul) => calcul.id));
  return calculs.filter((calcul) => retenus.has(calcul.id)).map((calcul) => calcul.id);
}

function dateDe(calcul: ArchivedCalcul): number {
  const valeur = new Date(calcul.calculeLe).getTime();
  return Number.isNaN(valeur) ? 0 : valeur;
}

/* --- Nom du fichier enregistré --------------------------------------------- */

/**
 * Caractères que Windows refuse dans un nom de fichier, plus les caractères de
 * contrôle. Le nom du projet est saisi par l'utilisateur : il peut contenir
 * n'importe quoi, y compris une barre oblique qui ferait échouer
 * l'enregistrement sans explication.
 */
const CARACTERES_INTERDITS = /[<>:"/\\|?*\u0000-\u001f]+/g;

/**
 * Nom proposé à l'enregistrement.
 *
 * Il est composé ici, et non lu dans l'en-tête `Content-Disposition` que le
 * serveur envoie pourtant : cet en-tête n'est pas exposé au JavaScript par la
 * politique CORS (`Access-Control-Expose-Headers: X-Request-Id`), il resterait
 * donc invisible. La référence en tête du nom suffit à retrouver le document
 * dans un dossier de téléchargements.
 */
export function reportFileName(reference: string, nomProjet: string): string {
  const base = [reference, nomProjet].filter(Boolean).join(' - ');
  const propre = base.replace(CARACTERES_INTERDITS, ' ').replace(/\s+/g, ' ').trim();
  return `${propre || 'Rapport'}.pdf`;
}

/* --- Appels ---------------------------------------------------------------- */

export async function fetchProjectReports(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectReport[]> {
  const payload = await apiRequest<unknown>(
    `/api/projects/${encodeURIComponent(projectId)}/reports`,
    { signal },
  );
  const raw = asRecord(payload).rapports ?? payload;
  return Array.isArray(raw) ? raw.map(readReport).filter((rapport) => rapport.id !== '') : [];
}

/**
 * Demande la production d'un rapport.
 *
 * Les notes vides ne sont pas envoyées : le serveur n'a pas à distinguer « pas
 * de remarque » d'une chaîne vide. La liste de calculs, elle, est toujours
 * transmise dès que l'utilisateur a fait un choix — y compris quand ce choix
 * coïncide avec le comportement par défaut : ce qui a été coché est ce qui doit
 * figurer dans le document, sans dépendre d'une convention implicite.
 */
export async function generateReport(
  projectId: string,
  demande: ReportRequest,
): Promise<GeneratedReport> {
  const body: Record<string, unknown> = {};
  if (demande.calculIds && demande.calculIds.length > 0) {
    body.calculIds = demande.calculIds;
  }
  const notes = demande.notes?.trim();
  if (notes) body.notes = notes;

  const payload = await apiRequest<unknown>(
    `/api/projects/${encodeURIComponent(projectId)}/reports`,
    { method: 'POST', body },
  );
  return readGenerated(asRecord(payload).rapport ?? payload);
}

/** Le PDF lui-même, rapatrié avec le jeton d'accès. */
export function fetchReportFile(reportId: string, signal?: AbortSignal): Promise<Blob> {
  return apiFileRequest(`/api/reports/${encodeURIComponent(reportId)}/fichier`, { signal });
}

export async function deleteReport(reportId: string): Promise<void> {
  await apiRequest<void>(`/api/reports/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  });
}
