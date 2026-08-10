/**
 * Module 8 (sous pression) — `8_HMT_Pompe` : hauteur manométrique totale et
 * puissance de pompage.
 *
 * Source : MOTEUR-SOUS-PRESSION.md §9.
 * Formules-cadre : `HMT = Hg + Pservice(m) + ΔHlin + ΔHsing` ;
 * `Ph = 9,81 × Q × HMT` ; `Pa = Ph / η`.
 *
 * ⚠️ Le **NPSH disponible** n'est pas calculé par le classeur, et ne l'est pas
 * davantage ici : il dépend de la configuration exacte de l'aspiration et des
 * courbes du constructeur. Un rappel explicite est renvoyé dans les
 * avertissements. Ne rien inventer sur ce point.
 */

import { z } from 'zod';

import { diviser, exigerFini } from '../erreurs.js';
import { METRES_COLONNE_EAU_PAR_BAR } from '../tables/sous-pression.js';
import { attention, envelopper, info, type Avertissement, type ResultatMoteur } from '../types.js';
import { analyser, nombreFini, nombrePositif, nombrePositifOuNul } from '../validation.js';

export const CODE_MODULE_POMPE = 'POMPE_HMT';

/** Poids volumique de l'eau, en kN/m³ : ρ·g = 1000 × 9,81 / 1000. */
const RHO_G = 9.81;
/** 1 CV = 0,736 kW. */
const KW_PAR_CV = 0.736;

/** Plage de rendement global (pompe + moteur) réaliste, pour le contrôle. */
const RENDEMENT_MINI_REALISTE = 0.3;
const RENDEMENT_MAXI_REALISTE = 0.9;

export const schemaPompe = z
  .object({
    /** Hauteur géométrique Hg (m). */
    hg: nombrePositifOuNul,
    /** Pression de service demandée aux émetteurs (bar). */
    pressionServiceBar: nombrePositifOuNul,
    /** Pertes de charge linéaires totales (m), du module 7. */
    deltaHLineaire: nombrePositifOuNul,
    /** Pertes singulières, en % des pertes linéaires (coudes, vannes, filtres). */
    pourcentSingulieres: nombreFini
      .min(0, 'ne peut pas être négatif')
      .max(100, 'ne peut pas dépasser 100 % des pertes linéaires')
      .default(10),
    /** Débit de la pompe (m³/s), du module 4. */
    qM3ParSeconde: nombrePositif,
    /** Rendement global pompe + moteur η (fraction 0-1). */
    rendement: nombreFini
      .gt(0, 'doit être strictement supérieur à 0')
      .max(1, 'ne peut pas dépasser 1 (un rendement est une fraction)'),
  })
  .strict();

export type EntreesPompe = z.input<typeof schemaPompe>;

export interface ResultatsPompe {
  /** Pression de service convertie en mètres de colonne d'eau. */
  readonly pressionServiceM: number;
  /** Pertes de charge singulières (m). */
  readonly deltaHSingulieres: number;
  /** Hauteur manométrique totale (m). */
  readonly hmt: number;
  /** Puissance hydraulique (kW). */
  readonly ph: number;
  /** Puissance absorbée (kW). */
  readonly pa: number;
  /** Puissance absorbée (CV). */
  readonly paCv: number;
  /** Rappel : le NPSH disponible n'est pas calculé. */
  readonly rappelNpsh: string;
}

export function calculerPompe(entree: unknown): ResultatMoteur<ResultatsPompe> {
  const e = analyser(schemaPompe, entree);
  const avertissements: Avertissement[] = [];

  const pressionServiceM = exigerFini(
    e.pressionServiceBar * METRES_COLONNE_EAU_PAR_BAR,
    'pression de service en mCE',
  );

  const deltaHSingulieres = exigerFini(
    (e.pourcentSingulieres / 100) * e.deltaHLineaire,
    'pertes de charge singulières',
  );

  const hmt = exigerFini(
    e.hg + pressionServiceM + e.deltaHLineaire + deltaHSingulieres,
    'hauteur manométrique totale',
  );

  if (hmt <= 0) {
    avertissements.push(
      attention(
        'HMT_NULLE',
        'La hauteur manométrique totale est nulle : la pompe n’aurait rien à vaincre. Vérifiez la hauteur géométrique, la pression de service et les pertes de charge.',
      ),
    );
  }

  const ph = exigerFini(RHO_G * e.qM3ParSeconde * hmt, 'puissance hydraulique');

  const pa = exigerFini(
    diviser(ph, e.rendement, {
      message:
        'Le rendement de la pompe est nul : la puissance absorbée ne peut pas être calculée.',
      code: 'RENDEMENT_NUL',
      champ: 'rendement',
    }),
    'puissance absorbée',
    'rendement',
  );

  if (e.rendement < RENDEMENT_MINI_REALISTE || e.rendement > RENDEMENT_MAXI_REALISTE) {
    avertissements.push(
      attention(
        'RENDEMENT_INHABITUEL',
        `Le rendement global saisi (${(e.rendement * 100).toFixed(0)} %) sort de la plage réaliste pour un groupe motopompe (30 à 90 %). Vérifiez la valeur auprès du constructeur.`,
      ),
    );
  }

  const rappelNpsh =
    'Le NPSH disponible n’est pas calculé par ce module : il dépend de la configuration de l’aspiration (hauteur, pertes de charge, température, altitude). Il doit être vérifié auprès du constructeur avant le choix définitif de la pompe.';

  avertissements.push(info('NPSH_A_VERIFIER', rappelNpsh));

  return envelopper(
    CODE_MODULE_POMPE,
    {
      pressionServiceM,
      deltaHSingulieres,
      hmt,
      ph,
      pa,
      paCv: exigerFini(pa / KW_PAR_CV, 'puissance absorbée en CV'),
      rappelNpsh,
    },
    avertissements,
  );
}
