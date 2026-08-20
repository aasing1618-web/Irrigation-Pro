/**
 * Stockage des rapports produits.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  POURQUOI ON ÉCRIT LE PDF PLUTÔT QUE DE LE RÉGÉNÉRER
 * ═══════════════════════════════════════════════════════════════════════════
 *  Les deux options se défendaient. Celle-ci a été retenue pour une raison
 *  factuelle, pas esthétique : **la table `reports` ne mémorise pas quels
 *  calculs composaient le rapport.** Elle porte `project_id`, `reference`,
 *  `file_path`, `generated_at` — et rien d'autre. Régénérer à la demande
 *  imposerait donc de reprendre « le dernier calcul de chaque module »,
 *  c'est-à-dire de produire, sous une référence déjà imprimée et déjà transmise
 *  à un client final, un document **différent** de celui qui a été remis. C'est
 *  précisément ce qu'une référence sert à empêcher.
 *
 *  Le manifeste `.json` écrit à côté du PDF conserve ce que la table ne sait
 *  pas dire : les calculs retenus, leur nombre, la version du moteur, le nom de
 *  fichier lisible.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  DEUX RANGEMENTS DERRIÈRE LA MÊME PORTE
 * ═══════════════════════════════════════════════════════════════════════════
 *  - **Supabase Storage** — c'est le rangement de production, décidé par le
 *    propriétaire le 2026-08-11. Il supprime le besoin d'un disque persistant,
 *    donc l'hébergement du serveur redevient gratuit. Le nom du bucket vient de
 *    `SUPABASE_BUCKET` et **il est sensible à la casse**.
 *  - **Disque local** — pour les tests et le développement.
 *
 *  ⚠️ **Ce n'est pas un confort, c'est un garde-fou.** Sans lui, lancer la
 *  suite de tests avec les identifiants de production écrirait les PDF de test
 *  **dans le bucket des vrais clients**, au milieu de leurs rapports. La même
 *  chose vaut pour un `npm run dev` sur le poste d'un développeur. D-011
 *  prévoit un projet Supabase séparé pour les tests ; tant qu'il n'existe pas,
 *  seul ce commutateur empêche l'accident.
 *
 *  Le choix est donc **sûr par défaut** : on ne parle à Supabase que si
 *  `NODE_ENV=production`, ou si quelqu'un le demande explicitement par
 *  `REPORTS_STORAGE=supabase`. Partout ailleurs, disque.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SÉCURITÉ DES CHEMINS
 * ═══════════════════════════════════════════════════════════════════════════
 *  Un chemin construit à partir de texte saisi par l'utilisateur est une
 *  traversée de répertoire en puissance. Ici, **aucun** élément du chemin ne
 *  vient de l'utilisateur : le dossier est l'identifiant du compte, le fichier
 *  celui du rapport, tous deux des UUID produits par PostgreSQL. Le nom lisible
 *  (« Rapport RAP-2026-0042 — Périmètre de Ndiaye.pdf ») ne sert qu'à l'en-tête
 *  HTTP, jamais au rangement.
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

import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '../logger.js';
import type { ManifesteRapport } from './types.js';

/**
 * Bucket Supabase où vivent les rapports.
 *
 * Le nom vient de la configuration (`SUPABASE_BUCKET`) et **il est sensible à
 * la casse** : « Rapport » et « rapports » désignent deux buckets différents.
 * C'est le genre d'écart qui ne se voit qu'à la première écriture en
 * production, sous la forme d'un « Bucket not found » — d'où le message
 * d'erreur explicite plus bas.
 */
let bucketMemo: string | null = null;

/* -------------------------------------------------------------------------- */
/* Le chemin, commun aux deux rangements                                      */
/* -------------------------------------------------------------------------- */

/** Un UUID, et rien d'autre — le seul motif autorisé dans un chemin. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chemin **relatif** rangé dans `reports.file_path`.
 *
 * On stocke un chemin relatif, jamais absolu : déplacer le stockage ou changer
 * de rangement ne doit pas invalider toutes les lignes de la table. C'est
 * précisément ce qui permet la bascule disque → Supabase sans migration.
 */
export function cheminRelatifRapport(ownerId: string, reportId: string): string {
  if (!UUID.test(ownerId) || !UUID.test(reportId)) {
    throw new Error('Identifiants de rapport invalides : chemin de stockage refusé.');
  }
  return `${ownerId.toLowerCase()}/${reportId.toLowerCase()}.pdf`;
}

/** Le manifeste vit à côté du PDF, sous le même nom. */
function versManifeste(cheminPdf: string): string {
  return `${cheminPdf.slice(0, -path.extname(cheminPdf).length)}.json`;
}

/* -------------------------------------------------------------------------- */
/* Le contrat                                                                 */
/* -------------------------------------------------------------------------- */

interface Rangement {
  readonly nom: 'disque' | 'supabase';
  ecrire(relatif: string, pdf: Buffer, manifeste: ManifesteRapport): Promise<void>;
  lirePdf(relatif: string): Promise<Buffer | null>;
  lireJson(relatif: string): Promise<string | null>;
  effacer(relatif: string): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Rangement 1 — le disque                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Racine du stockage sur disque.
 *
 * `src/reports/` en développement comme `dist/reports/` en production remontent
 * tous deux de deux niveaux vers `backend/`, d'où un emplacement identique dans
 * les deux cas. `REPORTS_STORAGE_DIR` permet de le déplacer sans toucher au
 * code — c'est ce que font les tests, qui pointent sur un dossier jetable.
 */
export const RACINE_STOCKAGE: string =
  process.env['REPORTS_STORAGE_DIR']?.trim() ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage', 'rapports');

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

const rangementDisque: Rangement = {
  nom: 'disque',

  async ecrire(relatif, pdf, manifeste) {
    const absolu = resoudreChemin(relatif);
    if (!absolu) throw new Error('Chemin de stockage refusé.');

    await mkdir(path.dirname(absolu), { recursive: true });
    await writeFile(absolu, pdf);
    await writeFile(versManifeste(absolu), JSON.stringify(manifeste, null, 2), 'utf8');
  },

  async lirePdf(relatif) {
    const absolu = resoudreChemin(relatif);
    if (!absolu) return null;
    try {
      return await readFile(absolu);
    } catch {
      return null;
    }
  },

  async lireJson(relatif) {
    const absolu = resoudreChemin(relatif);
    if (!absolu) return null;
    try {
      return await readFile(versManifeste(absolu), 'utf8');
    } catch {
      return null;
    }
  },

  async effacer(relatif) {
    const absolu = resoudreChemin(relatif);
    if (!absolu) return;
    await rm(absolu, { force: true });
    await rm(versManifeste(absolu), { force: true });
  },
};

/* -------------------------------------------------------------------------- */
/* Rangement 2 — Supabase Storage                                             */
/* -------------------------------------------------------------------------- */

/**
 * Le client est construit **à la première utilisation**, jamais au chargement
 * du module. Ainsi, un environnement qui n'utilise pas Supabase n'a pas besoin
 * d'identifiants valides pour seulement importer ce fichier.
 */
let clientSupabase: SupabaseClient | null = null;

async function supabase(): Promise<SupabaseClient> {
  if (clientSupabase) return clientSupabase;

  const [{ createClient }, { config }] = await Promise.all([
    import('@supabase/supabase-js'),
    import('../config.js'),
  ]);

  bucketMemo = config.supabaseBucket;
  clientSupabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return clientSupabase;
}

/** Nom du bucket, une fois la configuration chargée. */
function bucket(): string {
  return bucketMemo ?? 'rapports';
}

/**
 * Rend lisible l'échec le plus probable et le plus déroutant : un bucket qui
 * n'existe pas sous ce nom-là. Supabase répond « Bucket not found », ce qui ne
 * dit pas quel nom a été cherché — or l'écart est presque toujours une
 * majuscule ou un pluriel.
 */
function expliquer(contexte: string, message: string): string {
  if (/bucket not found/i.test(message)) {
    return (
      `${contexte} : aucun bucket nommé « ${bucket()} » sur ce projet Supabase. ` +
      'Le nom est sensible à la casse — vérifiez SUPABASE_BUCKET.'
    );
  }
  return `${contexte} : ${message}`;
}

const rangementSupabase: Rangement = {
  nom: 'supabase',

  async ecrire(relatif, pdf, manifeste) {
    const client = await supabase();

    const { error: erreurPdf } = await client.storage
      .from(bucket())
      .upload(relatif, pdf, { contentType: 'application/pdf', upsert: true });
    if (erreurPdf) throw new Error(expliquer('Écriture du PDF impossible', erreurPdf.message));

    const { error: erreurJson } = await client.storage
      .from(bucket())
      .upload(versManifeste(relatif), JSON.stringify(manifeste, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (erreurJson) {
      // Le PDF est déjà en place mais son manifeste manque : on retire le PDF
      // plutôt que de laisser un rapport dont on ne saura plus dire de quels
      // calculs il est fait.
      await this.effacer(relatif);
      throw new Error(`Écriture du manifeste impossible : ${erreurJson.message}`);
    }
  },

  async lirePdf(relatif) {
    try {
      const client = await supabase();
      const { data, error } = await client.storage.from(bucket()).download(relatif);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    } catch {
      return null;
    }
  },

  async lireJson(relatif) {
    try {
      const client = await supabase();
      const { data, error } = await client.storage.from(bucket()).download(versManifeste(relatif));
      if (error || !data) return null;
      return await data.text();
    } catch {
      return null;
    }
  },

  async effacer(relatif) {
    const client = await supabase();
    await client.storage.from(bucket()).remove([relatif, versManifeste(relatif)]);
  },
};

/* -------------------------------------------------------------------------- */
/* Le commutateur                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Sûr par défaut : on ne parle au vrai Supabase que si on est réellement en
 * production, ou si quelqu'un le demande en toutes lettres.
 */
function choisirRangement(): Rangement {
  const demande = process.env['REPORTS_STORAGE']?.trim().toLowerCase();
  if (demande === 'supabase') return rangementSupabase;
  if (demande === 'disque') return rangementDisque;
  return process.env['NODE_ENV'] === 'production' ? rangementSupabase : rangementDisque;
}

const rangement: Rangement = choisirRangement();

/** Où vont réellement les rapports. Utile aux diagnostics, jamais à la logique. */
export const RANGEMENT_ACTIF: 'disque' | 'supabase' = rangement.nom;

/* -------------------------------------------------------------------------- */
/* L'interface publique — inchangée depuis la Vague 3                         */
/* -------------------------------------------------------------------------- */

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
  await rangement.ecrire(relatif, pdf, manifeste);
  return relatif;
}

/** Relit le PDF. `null` si le fichier a disparu. */
export async function lireRapport(cheminRelatif: string | null): Promise<Buffer | null> {
  if (!cheminRelatif) return null;
  return rangement.lirePdf(cheminRelatif);
}

/** Relit le manifeste. `null` s'il est absent ou illisible. */
export async function lireManifeste(
  cheminRelatif: string | null,
): Promise<ManifesteRapport | null> {
  if (!cheminRelatif) return null;

  const brut = await rangement.lireJson(cheminRelatif);
  if (brut === null) return null;

  try {
    const objet: unknown = JSON.parse(brut);
    if (objet === null || typeof objet !== 'object') return null;
    return objet as ManifesteRapport;
  } catch {
    // Un manifeste illisible ne doit pas empêcher de télécharger le PDF, qui
    // est le document qui compte.
    return null;
  }
}

/**
 * Efface le PDF et son manifeste.
 *
 * **Ne lève jamais.** La suppression d'un rapport en base ne doit pas échouer
 * parce que le fichier avait déjà disparu : la ligne fait foi, le fichier suit.
 */
export async function effacerRapport(cheminRelatif: string | null): Promise<void> {
  if (!cheminRelatif) return;
  try {
    await rangement.effacer(cheminRelatif);
  } catch (err) {
    logger.error({ err, rangement: rangement.nom }, 'Suppression du fichier de rapport impossible');
  }
}
