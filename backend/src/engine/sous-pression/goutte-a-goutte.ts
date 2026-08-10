/**
 * Module 6 (sous pression) — `6_Goutte_a_goutte`.
 *
 * Source : MOTEUR-SOUS-PRESSION.md §7.
 * Formules-cadre : `qp = Ne × qa` ; `Pw = Ne×π×(Dw/2)² / (Sp×Sr)` ;
 * `t = (Db × Sp × Sr) / qp`.
 */

import { z } from 'zod';

import { diviser, exigerFini } from '../erreurs.js';
import { surfaceMouilleeMinimale, type CodeClimat } from '../tables/sous-pression.js';
import { arrondiSuperieur } from '../nombres.js';
import { attention, envelopper, type Avertissement, type ResultatMoteur } from '../types.js';
import { analyser, nombreFini, nombrePositif } from '../validation.js';

export const CODE_MODULE_GOUTTE_A_GOUTTE = 'GOUTTE_A_GOUTTE';

/** 1 hectare = 10 000 m². */
const M2_PAR_HECTARE = 10000;

export const schemaGoutteAGoutte = z
  .object({
    /** Espacement entre plants sur la rampe Sp (m). */
    sp: nombrePositif,
    /** Espacement entre rampes Sr (m). */
    sr: nombrePositif,
    /** Nombre de goutteurs par plant Ne. */
    ne: nombreFini.int('doit être un nombre entier de goutteurs').min(1, 'au moins un goutteur par plant'),
    /** Débit d'un goutteur qa (l/h). */
    qa: nombrePositif,
    /** Diamètre du bulbe mouillé Dw (m). */
    dw: nombrePositif,
    /** Climat (table I) : détermine la surface mouillée minimale recommandée. */
    climat: z.enum(['HUMIDE', 'SEMI_ARIDE', 'ARIDE']),
    /** Débit du système (l/s), du module 4. */
    qSystemeLitresParSeconde: nombrePositif,
    /** Superficie totale (ha), du module 2. */
    at: nombrePositif,
    /** Dose brute Db (mm), du module 1. */
    db: nombrePositif,
  })
  .strict();

export type EntreesGoutteAGoutte = z.input<typeof schemaGoutteAGoutte>;

export interface ResultatsGoutteAGoutte {
  /** Débit par plant qp (l/h). */
  readonly qp: number;
  /** Pourcentage de surface mouillée Pw (%). */
  readonly pw: number;
  /** Surface mouillée minimale recommandée pour ce climat (%). */
  readonly pwMini: number;
  readonly controleSurfaceMouillee: {
    readonly conforme: boolean;
    readonly message: string;
  };
  readonly plantsParHa: number;
  /** Débit nécessaire pour irriguer un hectare (l/h/ha). */
  readonly debitParHa: number;
  readonly qSystemeLitresParHeure: number;
  /** Surface irrigable simultanément (ha). */
  readonly surfaceSimultanee: number;
  /** Nombre de secteurs d'irrigation. */
  readonly nombreDeSecteurs: number;
  /** Volume à apporter par plant et par arrosage (L). */
  readonly volumeParPlant: number;
  /** Durée d'arrosage par poste (h). */
  readonly dureeParPoste: number;
}

export function calculerGoutteAGoutte(entree: unknown): ResultatMoteur<ResultatsGoutteAGoutte> {
  const e = analyser(schemaGoutteAGoutte, entree);
  const avertissements: Avertissement[] = [];

  const surfaceParPlant = exigerFini(e.sp * e.sr, 'surface par plant');

  const qp = exigerFini(e.ne * e.qa, 'débit par plant');

  const pw = exigerFini(
    diviser(e.ne * Math.PI * Math.pow(e.dw / 2, 2) * 100, surfaceParPlant, {
      message:
        'L’espacement entre plants ou entre rampes est nul : le pourcentage de surface mouillée ne peut pas être calculé.',
      code: 'ESPACEMENT_NUL',
      champ: 'sp',
    }),
    'pourcentage de surface mouillée',
    'sp',
  );

  const pwMini = surfaceMouilleeMinimale(e.climat as CodeClimat);
  const conforme = pw >= pwMini;
  const controleSurfaceMouillee = {
    conforme,
    message: conforme
      ? 'OK — surface mouillée suffisante.'
      : 'Insuffisant : augmenter le nombre de goutteurs, leur débit, ou le diamètre du bulbe mouillé.',
  };
  if (!conforme) {
    avertissements.push(
      attention(
        'SURFACE_MOUILLEE_INSUFFISANTE',
        `La surface mouillée obtenue (${pw.toFixed(2)} %) est inférieure au minimum recommandé pour ce climat (${pwMini} %). Les racines n’exploreront pas assez de sol.`,
      ),
    );
  }

  const plantsParHa = exigerFini(
    diviser(M2_PAR_HECTARE, surfaceParPlant, {
      message:
        'L’espacement entre plants ou entre rampes est nul : la densité de plantation ne peut pas être calculée.',
      code: 'ESPACEMENT_NUL',
      champ: 'sp',
    }),
    'densité de plantation',
    'sp',
  );

  const debitParHa = exigerFini(plantsParHa * qp, 'débit par hectare');

  const qSystemeLitresParHeure = exigerFini(
    e.qSystemeLitresParSeconde * 3600,
    'débit du système en l/h',
  );

  const surfaceSimultanee = exigerFini(
    diviser(qSystemeLitresParHeure, debitParHa, {
      message:
        'Le débit nécessaire par hectare est nul : la surface irrigable simultanément ne peut pas être calculée. Vérifiez le débit des goutteurs.',
      code: 'DEBIT_PAR_HA_NUL',
      champ: 'qa',
    }),
    'surface irrigable simultanément',
    'qa',
  );

  const nombreDeSecteurs = arrondiSuperieur(
    diviser(e.at, surfaceSimultanee, {
      message:
        'La surface irrigable simultanément est nulle : le nombre de secteurs ne peut pas être calculé.',
      code: 'SURFACE_SIMULTANEE_NULLE',
      champ: 'qSystemeLitresParSeconde',
    }),
  );

  const volumeParPlant = exigerFini(e.db * surfaceParPlant, 'volume par plant');

  const dureeParPoste = exigerFini(
    diviser(volumeParPlant, qp, {
      message:
        'Le débit par plant est nul : la durée d’arrosage par poste ne peut pas être calculée.',
      code: 'DEBIT_PAR_PLANT_NUL',
      champ: 'qa',
    }),
    'durée par poste',
    'qa',
  );

  return envelopper(
    CODE_MODULE_GOUTTE_A_GOUTTE,
    {
      qp,
      pw,
      pwMini,
      controleSurfaceMouillee,
      plantsParHa,
      debitParHa,
      qSystemeLitresParHeure,
      surfaceSimultanee,
      nombreDeSecteurs,
      volumeParPlant,
      dureeParPoste,
    },
    avertissements,
  );
}
