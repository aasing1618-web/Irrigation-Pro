/**
 * Stockage des rapports produits.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  POURQUOI ON ÉCRIT LE PDF SUR DISQUE PLUTÔT QUE DE LE RÉGÉNÉRER
 * ═══════════════════════════════════════════════════════════════════════════
 *  Les deux options se défendaient. Celle-ci a été retenue pour une raison
 *  factuelle, pas esthétique : **la table `reports` ne mémorise pas quels
 *  calculs composaient le rapport.** Elle porte `project_id`, `reference`,
 *  `file_path`, `generated_at` — et rien d'autre. Régénérer à la demande
 *  imposerait donc de reprendre « le dernier calcul de chaque module », c'est-
 *  à-dire de produire, sous une référence déjà imprimée et déjà transmise à un
 *  client final, un document **différent** de celui qui a été remis. C'est
 *  précisément ce qu'une référence sert à empêcher.
 *
 *  Trois conséquences, toutes voulues :
 *   - le document remis est **figé** : le rapport RAP-2026-0042 restera toujours
 *     celui que l'ingénieur a signé, même si le projet évolue ensuite ;
 *   - le moteur n'est pas rejoué à chaque téléchargement ;
 *   - `GET /reports` peut annoncer un `nombreCalculs` exact, information qui
 *     n'existe nulle part ailleurs.
 *
 *  Le prix à payer est assumé et doit être connu du propriétaire : **le dossier
 *  `backend/storage/` fait partie des données à sauvegarder.** S'il disparaît,
 *  les lignes `reports` subsistent mais les fichiers non ; l'API le dit alors
 *  franchement (« fichier plus disponible, générez un nouveau rapport ») au
 *  lieu de fabriquer en douce un document qui ne serait pas celui d'origine.
 *
 *  Le manifeste `.json` écrit à côté du PDF conserve ce que la table ne sait
 *  pas dire : les calculs retenus, leur nombre, la version du moteur, le nom de
 *  fichier lisible.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SÉCURITÉ DES CHEMINS
 * ═══════════════════════════════════════════════════════════════════════════
 *  Un chemin de fichier construit à partir de texte saisi par l'utilisateur est
 *  une traversée de répertoire en puissance. Ici, **aucun** élément du chemin ne
 *  vient de l'utilisateur : le dossier est l'identifiant du compte, le fichier
 *  est l'identifiant du rapport, tous deux des UUID produits par PostgreSQL.
 *  Le nom lisible (« Rapport RAP-2026-0042 — Périmètre de Ndiaye.pdf ») ne sert
 *  qu'à l'en-tête HTTP, jamais au système de fichiers.
 *
 *  Par surcroît, `resoudreChemin` refuse tout chemin qui, une fois résolu, sort
 *  du dossier de stockage — même s'il provenait de la base. Une ligne corrompue
 *  ou modifiée à la main ne peut pas transformer le téléchargement en lecture
 *  de fichier arbitraire.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from '../logger.js';
import type { ManifesteRapport } from './types.js';

/**
 * Racine du stockage.
 *
 * `src/reports/` en développement comme `dist/reports/` en production
 * remontent tous deux de deux niveaux vers `backend/`, d'où un emplacement
 * identique dans les deux cas. `REPORTS_STORAGE_DIR` permet de le déplacer
 * (volume monté, disque séparé) sans toucher au code.
 */
export const RACINE_STOCKAGE: string =
  process.env['REPORTS_STORAGE_DIR']?.trim() ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage', 'rapports');

/** Un UUID, et rien d'autre — le seul motif autorisé dans un chemin. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chemin **relatif** rangé dans `reports.file_path`.
 *
 * On stocke un chemin relatif, jamais absolu : déplacer le dossier de stockage
 * ou migrer de machine ne doit pas invalider toutes les lignes de la table.
 */
export function cheminRelatifRapport(ownerId: string, reportId: string): string {
  if (!UUID.test(ownerId) || !UUID.test(reportId)) {
    throw new Error('Identifiants de rapport invalides : chemin de stockage refusé.');
  }
  return `${ownerId.toLowerCase()}/${reportId.toLowerCase()}.pdf`;
}

/**
 * Chemin absolu correspondant, **garanti à l'intérieur du stockage**.
 * Renvoie `null` si le chemin fourni tente d'en sortir.
 */
export function resoudreChemin(cheminRelatif: string): string | null {
  if (cheminRelatif.includes('\0')) return null;
  const absolu = path.resolve(RACINE_STOCKAGE, cheminRelatif);
  const racine = path.resolve(RACINE_STOCKAGE);
  if (absolu !== racine && !absolu.startsWith(racine + path.sep)) return null;
  return absolu;
}

/** Le manifeste vit à côté du PDF, sous le même nom. */
function cheminManifeste(absoluPdf: string): string {
  return `${absoluPdf.slice(0, -path.extname(absoluPdf).length)}.json`;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

/**
 * Écrit le PDF et son manifeste, et renvoie le chemin relatif à ranger en base.
 *
 * L'écriture se fait **avant** que `file_path` ne soit renseigné : si elle
 * échoue, la colonne reste `null` et la route sait qu'aucun fichier n'a été
 * produit. L'inverse — enregistrer le chemin puis échouer à écrire — laisserait
 * une ligne qui promet un fichier inexistant.
 */
export async function ecrireRapport(
  ownerId: string,
  reportId: string,
  pdf: Buffer,
  manifeste: ManifesteRapport,
): Promise<string> {
  const relatif = cheminRelatifRapport(ownerId, reportId);
  const absolu = resoudreChemin(relatif);
  if (!absolu) throw new Error('Chemin de stockage refusé.');

  await mkdir(path.dirname(absolu), { recursive: true });
  await writeFile(absolu, pdf);
  await writeFile(cheminManifeste(absolu), JSON.stringify(manifeste, null, 2), 'utf8');

  return relatif;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Relit le PDF. `null` si le fichier a disparu (dossier non sauvegardé…). */
export async function lireRapport(cheminRelatif: string | null): Promise<Buffer | null> {
  if (!cheminRelatif) return null;
  const absolu = resoudreChemin(cheminRelatif);
  if (!absolu) {
    logger.warn('Chemin de rapport hors du dossier de stockage — lecture refusée');
    return null;
  }
  try {
    return await readFile(absolu);
  } catch {
    return null;
  }
}

/** Relit le manifeste. `null` s'il est absent ou illisible. */
export async function lireManifeste(
  cheminRelatif: string | null,
): Promise<ManifesteRapport | null> {
  if (!cheminRelatif) return null;
  const absolu = resoudreChemin(cheminRelatif);
  if (!absolu) return null;
  try {
    const brut = await readFile(cheminManifeste(absolu), 'utf8');
    const objet: unknown = JSON.parse(brut);
    if (objet === null || typeof objet !== 'object') return null;
    return objet as ManifesteRapport;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

/**
 * Efface le PDF et son manifeste.
 *
 * Ne lève jamais : la ligne en base a déjà été supprimée quand on arrive ici, et
 * un fichier résiduel est un désagrément, pas une faute fonctionnelle. L'échec
 * est journalisé pour qu'un ménage reste possible.
 */
export async function effacerRapport(cheminRelatif: string | null): Promise<void> {
  if (!cheminRelatif) return;
  const absolu = resoudreChemin(cheminRelatif);
  if (!absolu) return;
  try {
    await rm(absolu, { force: true });
    await rm(cheminManifeste(absolu), { force: true });
  } catch (err) {
    logger.error({ err }, 'Suppression du fichier de rapport impossible');
  }
}
