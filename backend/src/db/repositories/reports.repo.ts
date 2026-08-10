/**
 * Dépôt « rapports » — table `reports`.
 *
 * Une ligne = un document PDF remis (ou remettable) à un client final. Elle
 * porte la **référence imprimée** sur le document (`RAP-2026-0042`) et le
 * chemin du fichier produit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ISOLATION — CEINTURE ET BRETELLES
 * ═══════════════════════════════════════════════════════════════════════════
 *  `reports` porte `owner_id`, redondant avec `projects.owner_id` (voir le
 *  commentaire de la migration 001). Cette redondance est un filet, pas une
 *  dispense : toutes les lectures ci-dessous **joignent quand même `projects`**
 *  et exigent que les deux `owner_id` concordent. Une incohérence entre les
 *  deux colonnes — bug futur, écriture manuelle, restauration partielle — ne
 *  peut donc pas ouvrir l'accès au document d'un autre bureau d'études.
 *
 *  Aucune fonction ne peut être appelée sans `ownerId` : la signature l'impose,
 *  et le `WHERE` l'applique. Un rapport d'autrui ne remonte pas ; la route
 *  répond `404`, jamais `403`.
 *
 *  Un rapport reste lisible même si son projet a été **supprimé logiquement** :
 *  c'est la raison d'être de la suppression logique des projets (Vague 2), un
 *  document déjà remis à un client final doit rester consultable. Le filtre
 *  `deleted_at IS NULL` ne s'applique donc qu'à la **création**.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ATTRIBUTION DE LA RÉFÉRENCE — POURQUOI UN RÉESSAI, ET PAS UN `SELECT` PUIS
 *  UN `INSERT`
 * ═══════════════════════════════════════════════════════════════════════════
 *  `reference` est `UNIQUE`. Deux rapports demandés à la même seconde ne
 *  doivent pas viser le même numéro. Trois options existaient :
 *
 *   1. une séquence PostgreSQL dédiée — la plus propre, mais elle exige une
 *      migration, hors du périmètre de ce travail, et elle laisse des trous
 *      dans la numérotation à chaque transaction annulée ;
 *   2. un verrou consultatif (`pg_advisory_xact_lock`) — sérialise toutes les
 *      générations du serveur pour un événement rare ;
 *   3. **calculer le numéro dans l'`INSERT` lui-même, et réessayer sur
 *      violation d'unicité** — c'est ce qui est fait ici.
 *
 *  Le numéro suivant est déterminé par une sous-requête *à l'intérieur* de
 *  l'`INSERT … SELECT` : la fenêtre de course se réduit à la durée d'une seule
 *  instruction. En `READ COMMITTED`, deux insertions simultanées peuvent tout
 *  de même lire le même maximum ; la seconde reçoit alors une erreur `23505`,
 *  et l'on rejoue l'instruction — qui voit cette fois la ligne validée par la
 *  première. La convergence est garantie et le nombre de tentatives borné.
 *
 *  La numérotation est **annuelle et globale** (`RAP-<année>-<rang>`), pas par
 *  client : la référence doit être unique en base, et un numéro par compte
 *  laisserait deviner l'activité des autres bureaux d'études si les compteurs
 *  étaient partagés. Ici, un client ne voit jamais que ses propres références,
 *  et le trou entre deux de ses numéros ne lui apprend rien d'exploitable.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Executor } from '../executor.js';
import { run } from '../executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Une ligne de `reports`. */
export type ReportRow = {
  id: string;
  project_id: string;
  owner_id: string;
  reference: string;
  /** Chemin **relatif** du PDF dans le dossier de stockage. `null` tant qu'il
   *  n'a pas été écrit. */
  file_path: string | null;
  generated_at: Date;
};

/** Un rapport accompagné des informations du projet nécessaires au document. */
export type ReportWithProjectRow = ReportRow & {
  project_name: string;
  project_deleted_at: Date | null;
};

export type ListReportsOptions = {
  limit?: number;
  offset?: number;
};

const REPORT_COLUMNS = `
  r.id, r.project_id, r.owner_id, r.reference, r.file_path, r.generated_at
`;

const LIMITE_PAR_DEFAUT = 100;
const LIMITE_MAX = 500;

/** Nombre de tentatives d'attribution d'une référence. Voir l'en-tête. */
const TENTATIVES_REFERENCE = 8;

function bornerPagination(options: ListReportsOptions): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? LIMITE_PAR_DEFAUT), 1), LIMITE_MAX);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  return { limit, offset };
}

/** Reconnaît une violation de contrainte d'unicité PostgreSQL. */
function estViolationUnicite(erreur: unknown): boolean {
  return (
    typeof erreur === 'object' &&
    erreur !== null &&
    (erreur as { code?: unknown }).code === '23505'
  );
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

/**
 * Crée un rapport et lui attribue sa référence, en une seule instruction.
 *
 * L'appartenance du projet est vérifiée **par la base** : l'`INSERT … SELECT`
 * ne produit une ligne que si `projects` contient un projet de cet identifiant,
 * appartenant à ce compte et non supprimé. Aucune ligne → `null` → `404`. La
 * vérification ne peut donc pas être oubliée par l'appelant, ni contournée en
 * supprimant le projet entre le contrôle de la route et l'écriture.
 *
 * `owner_id` est recopié depuis `projects.owner_id`, jamais depuis le paramètre
 * : la colonne redondante ne peut pas diverger de la source de vérité.
 *
 * `file_path` reste `null` : le fichier n'existe pas encore. La route
 * l'enregistre ensuite avec `setReportFilePath`, une fois le PDF écrit.
 */
export async function createReport(
  projectId: string,
  ownerId: string,
  annee: number = new Date().getFullYear(),
  client?: Executor,
): Promise<ReportRow | null> {
  // `annee` est produite par le serveur, jamais par le client ; on la borne tout
  // de même pour que la référence garde exactement quatre chiffres.
  const anneeTexte = String(Math.min(Math.max(Math.trunc(annee), 1000), 9999));

  let derniereErreur: unknown = null;

  for (let tentative = 0; tentative < TENTATIVES_REFERENCE; tentative += 1) {
    try {
      const { rows } = await run<ReportRow>(
        client,
        `INSERT INTO reports (project_id, owner_id, reference)
         SELECT p.id,
                p.owner_id,
                'RAP-' || $3::text || '-' || lpad(
                  (COALESCE(
                     (SELECT max((substring(r.reference from '^RAP-[0-9]{4}-([0-9]+)$'))::int)
                        FROM reports r
                       WHERE substring(r.reference from 5 for 4) = $3::text),
                     0) + 1)::text,
                  4, '0')
           FROM projects p
          WHERE p.id = $1
            AND p.owner_id = $2
            AND p.deleted_at IS NULL
         RETURNING id, project_id, owner_id, reference, file_path, generated_at`,
        [projectId, ownerId, anneeTexte],
      );
      return rows[0] ?? null;
    } catch (erreur) {
      // Course perdue sur la référence : l'instruction est rejouée et relira un
      // maximum désormais à jour. Toute autre erreur remonte telle quelle.
      if (!estViolationUnicite(erreur)) throw erreur;
      derniereErreur = erreur;
    }
  }

  throw derniereErreur ?? new Error('Attribution de la référence de rapport impossible.');
}

/**
 * Enregistre l'emplacement du PDF une fois celui-ci écrit sur disque.
 *
 * `ownerId` figure dans le `WHERE` bien que `id` soit déjà une clé primaire :
 * une route qui se tromperait d'identifiant ne pourrait pas réécrire le chemin
 * du rapport d'un autre client.
 */
export async function setReportFilePath(
  id: string,
  ownerId: string,
  filePath: string | null,
  client?: Executor,
): Promise<boolean> {
  const resultat = await run(
    client,
    `UPDATE reports SET file_path = $3 WHERE id = $1 AND owner_id = $2`,
    [id, ownerId, filePath],
  );
  return (resultat.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

/** Rapports d'un projet, du plus récent au plus ancien. */
export async function listReports(
  projectId: string,
  ownerId: string,
  options: ListReportsOptions = {},
  client?: Executor,
): Promise<ReportRow[]> {
  const { limit, offset } = bornerPagination(options);
  const { rows } = await run<ReportRow>(
    client,
    `SELECT ${REPORT_COLUMNS}
       FROM reports r
       JOIN projects p ON p.id = r.project_id AND p.owner_id = r.owner_id
      WHERE r.project_id = $1
        AND r.owner_id = $2
      ORDER BY r.generated_at DESC, r.id DESC
      LIMIT $3 OFFSET $4`,
    [projectId, ownerId, limit, offset],
  );
  return rows;
}

/**
 * Lit un rapport par son identifiant, **pour ce compte uniquement**.
 *
 * Le nom du projet est ramené par la même requête : il sert à composer le nom
 * du fichier proposé au téléchargement. Le rapport d'un autre client, ou un
 * identifiant inventé, donnent le même résultat : `null`.
 */
export async function getReport(
  id: string,
  ownerId: string,
  client?: Executor,
): Promise<ReportWithProjectRow | null> {
  const { rows } = await run<ReportWithProjectRow>(
    client,
    `SELECT ${REPORT_COLUMNS},
            p.name       AS project_name,
            p.deleted_at AS project_deleted_at
       FROM reports r
       JOIN projects p ON p.id = r.project_id AND p.owner_id = r.owner_id
      WHERE r.id = $1
        AND r.owner_id = $2`,
    [id, ownerId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

/**
 * Supprime un rapport et renvoie la ligne effacée.
 *
 * Suppression réelle : contrairement à un projet, un rapport se régénère. La
 * ligne est renvoyée pour que la route puisse effacer le fichier correspondant
 * — sans elle, le dossier de stockage accumulerait des orphelins.
 *
 * `owner_id` est dans le `WHERE`, et la sous-requête sur `projects` revérifie
 * la concordance : supprimer le rapport d'autrui est impossible, et
 * indiscernable d'un identifiant inexistant.
 */
export async function deleteReport(
  id: string,
  ownerId: string,
  client?: Executor,
): Promise<ReportRow | null> {
  const { rows } = await run<ReportRow>(
    client,
    `DELETE FROM reports r
      WHERE r.id = $1
        AND r.owner_id = $2
        AND EXISTS (
              SELECT 1 FROM projects p
               WHERE p.id = r.project_id AND p.owner_id = r.owner_id
            )
     RETURNING r.id, r.project_id, r.owner_id, r.reference, r.file_path, r.generated_at`,
    [id, ownerId],
  );
  return rows[0] ?? null;
}
