/**
 * Module 6 — `6_Canaux_Manning` : dimensionnement d'un canal trapézoïdal.
 *
 * Source : MOTEUR-GRAVITAIRE.md §9. Formules de Manning-Strickler :
 * `Q = (1/n) × S × R^(2/3) × I^(1/2)` ; `S = (b + m·h)·h` ;
 * `P = b + 2h√(1+m²)` ; `R = S/P`.
 *
 * > ⚠️ Différence majeure d'implémentation avec le classeur. Dans Excel, le
 * > tirant d'eau `h` est ajusté **à la main** par « Valeur cible » (Goal Seek),
 * > ce qui laisse presque toujours un écart résiduel non nul. Ici, `h` est
 * > **résolu numériquement** : `Q(h) − Qcible = 0`.
 *
 * Méthode retenue : **dichotomie**. `Q(h)` est strictement croissante sur
 * `h > 0` (S et R croissent tous deux avec h), donc la dichotomie converge
 * toujours — contrairement à Newton, qui peut diverger si la dérivée est mal
 * conditionnée près de `h = 0`. La borne haute est trouvée par doublement.
 *
 * Le résultat expose **toujours** l'écart résiduel `qCalcule − qCible` et un
 * indicateur `convergence` : une valeur non convergée n'est jamais rendue en
 * silence.
 */

import { z } from 'zod';

import { ErreurCalculImpossible, ErreurValidation, exigerFini } from '../erreurs.js';
import {
  PENTE_MAXIMALE,
  VITESSE_CANAL_MAXI,
  VITESSE_CANAL_MINI,
  classerCanal,
  coefficientManning,
  estParoiConnue,
} from '../tables/canaux.js';
import { attention, envelopper, info, type Avertissement, type ResultatMoteur } from '../types.js';
import { analyser, nombreFini, nombrePositif, nombrePositifOuNul } from '../validation.js';

export const CODE_MODULE_CANAL_MANNING = 'CANAL_MANNING';

/** Tolérance relative par défaut sur le débit, pour arrêter la dichotomie. */
export const TOLERANCE_DEBIT_PAR_DEFAUT = 1e-12;
/** Nombre maximal d'itérations de dichotomie. */
export const ITERATIONS_MAX_PAR_DEFAUT = 200;
/** Nombre maximal de doublements pour trouver la borne haute du tirant d'eau. */
const DOUBLEMENTS_MAX = 80;
/** Tirant d'eau de départ pour la recherche de borne haute (m). */
const TIRANT_INITIAL = 1;

export const schemaCanalManning = z
  .object({
    /** Débit cible (m³/s), saisi ou repris du module 4. */
    qCible: nombrePositif,
    /** Nature de la paroi (table I) → coefficient de Manning `n`. */
    natureParoi: z.string().min(1).optional(),
    /** Coefficient de Manning imposé, s'il est connu par ailleurs. */
    n: nombrePositif.optional(),
    /** Largeur au fond `b` (m). 0 = canal triangulaire. */
    b: nombrePositifOuNul,
    /** Fruit des talus `m` (horizontal / vertical). 0 = canal rectangulaire. */
    m: nombrePositifOuNul,
    /** Pente longitudinale `I` (m/m). */
    i: nombrePositif,
    /** Tirant d'eau imposé (m). S'il est absent, `h` est résolu numériquement. */
    h: nombrePositif.optional(),
    /** Tolérance relative sur le débit pour la résolution numérique. */
    toleranceDebit: nombrePositif.default(TOLERANCE_DEBIT_PAR_DEFAUT),
    /** Nombre maximal d'itérations de la dichotomie. */
    iterationsMax: nombreFini
      .int('doit être un nombre entier')
      .min(1)
      .max(10000)
      .default(ITERATIONS_MAX_PAR_DEFAUT),
  })
  .strict();

export type EntreesCanalManning = z.input<typeof schemaCanalManning>;

export interface ResultatsCanalManning {
  /** Coefficient de rugosité de Manning retenu. */
  readonly n: number;
  /** Coefficient de Strickler `Ks = 1/n`. */
  readonly ks: number;
  /** Tirant d'eau (m). */
  readonly h: number;
  /** `RESOLU` = trouvé par dichotomie ; `IMPOSE` = fourni par l'utilisateur. */
  readonly sourceH: 'RESOLU' | 'IMPOSE';
  /** Section mouillée (m²). */
  readonly s: number;
  /** Périmètre mouillé (m). */
  readonly p: number;
  /** Rayon hydraulique (m). */
  readonly r: number;
  /** Débit obtenu avec ce tirant d'eau (m³/s). */
  readonly qCalcule: number;
  /** Écart résiduel `qCalcule − qCible` (m³/s). Toujours affiché. */
  readonly ecart: number;
  /** Écart relatif au débit cible (sans unité). */
  readonly ecartRelatif: number;
  /** `false` si la résolution n'a pas atteint la tolérance demandée. */
  readonly convergence: boolean;
  /** Nombre d'itérations de dichotomie effectuées (0 si `h` imposé). */
  readonly iterations: number;
  /** Vitesse moyenne (m/s). */
  readonly vitesse: number;
  readonly controleVitesse: {
    readonly mini: number;
    readonly maxi: number;
    readonly conforme: boolean;
  };
  /** Rapport largeur au fond / tirant d'eau. `null` si `h` nul. */
  readonly rapportBSurH: number | null;
  /**
   * Revanche `J = C × √h` (m), et hauteur totale du canal.
   * `null` quand le coefficient `C` n'est pas défini par la source pour ce
   * débit — voir la note dans le code.
   */
  readonly revanche: {
    readonly c: number;
    readonly j: number;
    readonly hauteurTotale: number;
  } | null;
  /** Classement du canal et pente recommandée (table J). */
  readonly tailleCanal: string;
  readonly penteRecommandee: string;
}

interface Geometrie {
  readonly s: number;
  readonly p: number;
  readonly r: number;
}

/** Géométrie d'une section trapézoïdale pour un tirant d'eau donné. */
function geometrie(h: number, b: number, m: number): Geometrie {
  const s = (b + m * h) * h;
  const p = b + 2 * h * Math.sqrt(1 + m * m);
  return { s, p, r: p === 0 ? 0 : s / p };
}

/** Débit de Manning-Strickler pour un tirant d'eau donné (m³/s). */
function debit(h: number, n: number, b: number, m: number, i: number): number {
  const { s, r } = geometrie(h, b, m);
  if (s <= 0 || r <= 0) return 0;
  return (1 / n) * s * Math.pow(r, 2 / 3) * Math.sqrt(i);
}

export function calculerCanalManning(entree: unknown): ResultatMoteur<ResultatsCanalManning> {
  const e = analyser(schemaCanalManning, entree);
  const avertissements: Avertissement[] = [];

  if (e.b === 0 && e.m === 0) {
    throw new ErreurValidation(
      'Un canal sans largeur au fond ni fruit de talus n’a aucune section d’écoulement : renseignez une largeur au fond ou une pente de talus.',
      { code: 'SECTION_NULLE', champ: 'b' },
    );
  }

  // Coefficient de Manning : saisie explicite, sinon table I, sinon repli 0,014.
  let n: number;
  if (e.n !== undefined) {
    n = e.n;
  } else if (e.natureParoi !== undefined) {
    n = coefficientManning(e.natureParoi);
    if (!estParoiConnue(e.natureParoi)) {
      avertissements.push(
        attention(
          'PAROI_INCONNUE',
          `La nature de paroi « ${e.natureParoi} » ne figure pas dans la table de rugosité : la valeur de repli (n = 0,014) a été utilisée. Vérifiez ce choix.`,
        ),
      );
    }
  } else {
    throw new ErreurValidation(
      'Choisissez la nature de la paroi du canal, ou saisissez directement le coefficient de rugosité.',
      { code: 'PAROI_MANQUANTE', champ: 'natureParoi' },
    );
  }

  const ks = exigerFini(1 / n, 'coefficient de Strickler', 'n');

  // ------------------------------------------------------- Résolution de `h`
  let h: number;
  let iterations = 0;
  let sourceH: 'RESOLU' | 'IMPOSE';

  if (e.h !== undefined) {
    h = e.h;
    sourceH = 'IMPOSE';
  } else {
    sourceH = 'RESOLU';
    // Borne haute par doublement : Q(h) est strictement croissante, on cherche
    // le premier `h` dont le débit dépasse la cible.
    let borneHaute = TIRANT_INITIAL;
    let doublements = 0;
    while (debit(borneHaute, n, e.b, e.m, e.i) < e.qCible) {
      borneHaute *= 2;
      doublements += 1;
      if (doublements > DOUBLEMENTS_MAX) {
        throw new ErreurCalculImpossible(
          'Le débit cible ne peut pas être atteint avec cette géométrie : même un tirant d’eau démesuré ne suffirait pas. Vérifiez la pente, la largeur au fond et le fruit des talus.',
          { code: 'DEBIT_CIBLE_INATTEIGNABLE', champ: 'qCible' },
        );
      }
    }

    let borneBasse = 0;
    for (iterations = 0; iterations < e.iterationsMax; iterations += 1) {
      const milieu = (borneBasse + borneHaute) / 2;
      const qMilieu = debit(milieu, n, e.b, e.m, e.i);
      if (Math.abs(qMilieu - e.qCible) <= e.toleranceDebit * e.qCible) {
        borneBasse = milieu;
        borneHaute = milieu;
        break;
      }
      if (qMilieu < e.qCible) borneBasse = milieu;
      else borneHaute = milieu;
      // L'intervalle ne peut plus être coupé : on a atteint la résolution du
      // format flottant, inutile de continuer.
      if (borneHaute - borneBasse <= Number.EPSILON * borneHaute) break;
    }
    h = (borneBasse + borneHaute) / 2;
  }

  const { s, p, r } = geometrie(h, e.b, e.m);
  if (p <= 0 || s <= 0) {
    throw new ErreurCalculImpossible(
      'La section d’écoulement obtenue est nulle : le tirant d’eau ou la géométrie du canal sont incohérents.',
      { code: 'SECTION_NULLE', champ: 'h' },
    );
  }

  const qCalcule = exigerFini(debit(h, n, e.b, e.m, e.i), 'débit calculé');
  const ecart = qCalcule - e.qCible;
  const ecartRelatif = exigerFini(ecart / e.qCible, 'écart relatif', 'qCible');
  const convergence =
    sourceH === 'IMPOSE' ? true : Math.abs(ecartRelatif) <= Math.max(e.toleranceDebit, 1e-9);

  if (sourceH === 'RESOLU' && !convergence) {
    avertissements.push(
      attention(
        'RESOLUTION_NON_CONVERGEE',
        `La recherche du tirant d’eau n’a pas atteint la précision demandée : il subsiste un écart de ${ecart.toExponential(3)} m³/s sur le débit. Le résultat ne doit pas être utilisé tel quel.`,
      ),
    );
  }

  const vitesse = exigerFini(qCalcule / s, 'vitesse d’écoulement');
  const vitesseConforme = vitesse >= VITESSE_CANAL_MINI && vitesse <= VITESSE_CANAL_MAXI;
  if (!vitesseConforme) {
    avertissements.push(
      attention(
        'VITESSE_HORS_PLAGE',
        vitesse < VITESSE_CANAL_MINI
          ? `Vitesse de ${vitesse.toFixed(3)} m/s, inférieure au minimum recommandé de ${VITESSE_CANAL_MINI} m/s : risque de dépôt de sédiments dans le canal.`
          : `Vitesse de ${vitesse.toFixed(3)} m/s, supérieure au maximum recommandé de ${VITESSE_CANAL_MAXI} m/s : risque d’érosion des berges.`,
      ),
    );
  }

  // --------------------------------------------------------------- Revanche
  // MOTEUR-GRAVITAIRE.md §9 : « C = 0,8 si Q ≤ 0,5 m³/s ; 1,35 si Q > 80 m³/s ».
  // La source ne donne AUCUNE valeur pour 0,5 < Q ≤ 80 m³/s. Inventer une
  // interpolation reviendrait à fabriquer une hauteur de berge : on refuse, on
  // renvoie `null` et on le dit explicitement. À arbitrer avec le lead.
  let revanche: ResultatsCanalManning['revanche'] = null;
  if (e.qCible <= 0.5) {
    const c = 0.8;
    const j = exigerFini(c * Math.sqrt(h), 'revanche');
    revanche = { c, j, hauteurTotale: h + j };
  } else if (e.qCible > 80) {
    const c = 1.35;
    const j = exigerFini(c * Math.sqrt(h), 'revanche');
    revanche = { c, j, hauteurTotale: h + j };
  } else {
    avertissements.push(
      attention(
        'REVANCHE_NON_DEFINIE',
        'La source (Savva et Frenken, 2002) ne fournit le coefficient de revanche que pour Q ≤ 0,5 m³/s et Q > 80 m³/s. Pour ce débit, la revanche doit être déterminée à partir de l’abaque complet : elle n’est volontairement pas calculée ici.',
      ),
    );
  }

  if (e.i > PENTE_MAXIMALE) {
    avertissements.push(
      attention(
        'PENTE_EXCESSIVE',
        `La pente longitudinale saisie (${(e.i * 100).toFixed(3)} %) dépasse la pente maximale admise de 1:300 (0,33 %).`,
      ),
    );
  }

  const classement = classerCanal(e.qCible);
  avertissements.push(
    info(
      'PENTE_RECOMMANDEE',
      `${classement.taille} : pente longitudinale recommandée ${classement.penteRecommandee}.`,
    ),
  );

  return envelopper(
    CODE_MODULE_CANAL_MANNING,
    {
      n,
      ks,
      h,
      sourceH,
      s,
      p,
      r,
      qCalcule,
      ecart,
      ecartRelatif,
      convergence,
      iterations,
      vitesse,
      controleVitesse: {
        mini: VITESSE_CANAL_MINI,
        maxi: VITESSE_CANAL_MAXI,
        conforme: vitesseConforme,
      },
      rapportBSurH: h === 0 ? null : e.b / h,
      revanche,
      tailleCanal: classement.taille,
      penteRecommandee: classement.penteRecommandee,
    },
    avertissements,
  );
}
