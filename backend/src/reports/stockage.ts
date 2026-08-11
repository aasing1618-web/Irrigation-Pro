/**
 * Stockage des rapports produits sur Supabase Storage.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  POURQUOI ON ÉCRIT LE PDF SUR SUPABASE PLUTÔT QUE DE LE RÉGÉNÉRER
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Le document remis est **figé** (un rapport RAP-xxx restera toujours
 *    celui que l'ingénieur a signé, même si le projet évolue).
 *  - L'usage de Supabase Storage supprime le besoin d'un disque persistant,
 *    nous permettant d'héberger gratuitement l'API Node.js.
 *
 *  Le manifeste `.json` écrit à côté du PDF conserve les détails des calculs,
 *  le nom de fichier lisible, etc.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

import { config } from '../config.js';
import { logger } from '../logger.js';
import type { ManifesteRapport } from './types.js';

const BUCKET_NAME = 'rapports';

// On utilise l'URL et la clé Supabase pour créer le client
// Ces variables sont obligatoires, mais en mode test, `config.ts` fournit des valeurs par défaut
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

/** Un UUID, et rien d'autre — le seul motif autorisé dans un chemin. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chemin **relatif** rangé dans `reports.file_path` (et utilisé comme clé Storage).
 */
export function cheminRelatifRapport(ownerId: string, reportId: string): string {
  if (!UUID.test(ownerId) || !UUID.test(reportId)) {
    throw new Error('Identifiants de rapport invalides : chemin de stockage refusé.');
  }
  return `${ownerId.toLowerCase()}/${reportId.toLowerCase()}.pdf`;
}

/** Le manifeste vit à côté du PDF, sous le même nom. */
function cheminManifeste(relatifPdf: string): string {
  return relatifPdf.replace(/\.pdf$/, '.json');
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

/**
 * Écrit le PDF et son manifeste, et renvoie le chemin relatif à ranger en base.
 */
export async function ecrireRapport(
  ownerId: string,
  reportId: string,
  pdf: Buffer,
  manifeste: ManifesteRapport,
): Promise<string> {
  const relatif = cheminRelatifRapport(ownerId, reportId);
  const pathJson = cheminManifeste(relatif);

  const { error: errPdf } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(relatif, pdf, { contentType: 'application/pdf', upsert: true });

  if (errPdf) throw new Error(`Échec de l'upload du PDF: ${errPdf.message}`);

  const { error: errJson } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(pathJson, JSON.stringify(manifeste, null, 2), { contentType: 'application/json', upsert: true });

  if (errJson) {
    // Si le manifeste échoue, on tente de nettoyer le PDF (best effort)
    await effacerRapport(relatif);
    throw new Error(`Échec de l'upload du manifeste: ${errJson.message}`);
  }

  return relatif;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Relit le PDF depuis Supabase. `null` si le fichier a disparu. */
export async function lireRapport(cheminRelatif: string | null): Promise<Buffer | null> {
  if (!cheminRelatif) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(cheminRelatif);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** Relit le manifeste depuis Supabase. `null` s'il est absent ou illisible. */
export async function lireManifeste(
  cheminRelatif: string | null,
): Promise<ManifesteRapport | null> {
  if (!cheminRelatif) return null;
  const pathJson = cheminManifeste(cheminRelatif);
  
  try {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(pathJson);
    if (error || !data) return null;
    
    const text = await data.text();
    const objet: unknown = JSON.parse(text);
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
 * Ne lève jamais d'exception.
 */
export async function effacerRapport(cheminRelatif: string | null): Promise<void> {
  if (!cheminRelatif) return;
  const pathJson = cheminManifeste(cheminRelatif);
  try {
    await supabase.storage.from(BUCKET_NAME).remove([cheminRelatif, pathJson]);
  } catch (err) {
    logger.error({ err }, 'Suppression du fichier de rapport impossible sur Supabase');
  }
}
