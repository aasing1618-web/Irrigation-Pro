/**
 * Module 7 — `7_DFC_DMP` : débit fictif continu, débit maximal de pointe,
 * découpage en quartiers hydrauliques.
 *
 * Source : MOTEUR-GRAVITAIRE.md §10 (p. 140 du support de cours).
 *
 * ```
 * DFCnet (l/s/ha)  = Qm(mm/mois) / (joursMoisDePointe × 8,64)
 * DFCbrut (l/s/ha) = DFCnet / Ep
 * DMP (l/s/ha)     = DFCbrut × K            // K de 1,1 à 1,3, usuel 1,2
 * W (ha)           = mainDEau / DFCbrut
 * N (quartiers)    = ROUNDUP(At / W, 0)
 * F (arrosages)    = ROUNDUP(BEnTotal / Dn, 0)
 * ```
 *
 * Le facteur 8,64 convertit des mm/mois en l/s/ha :
 * 1 mm/j sur 1 ha = 10 m³/j = 10 000 l / 86 400 s = 0,11574 l/s ; l'inverse,
 * ramené au mois, donne 86 400 / 10 000 = 8,64.
 */

import { z } from 'zod';

import { diviser, exigerFini } from '../erreurs.js';
import { arrondiSuperieur } from '../nombres.js';
import { attention, envelopper, type Avertissement, type ResultatMoteur } from '../types.js';
import {
  analyser,
  joursDuMois,
  nombreFini,
  nombrePositif,
  nombrePositifOuNul,
} from '../validation.js';

export const CODE_MODULE_DFC_DMP = 'DFC_DMP';

/** Facteur de conversion mm/mois → l/s/ha (voir en-tête). */
const FACTEUR_CONVERSION = 8.64;

/** Bornes usuelles du coefficient de pointe K. */
const K_MINI_USUEL = 1.1;
const K_MAXI_USUEL = 1.3;

export const schemaDfcDmp = z
  .object({
    /** Besoin net mensuel de pointe Qm (mm/mois), du module 2. */
    qmPointe: nombrePositif,
    /** Nombre de jours du mois de pointe. */
    joursMoisDePointe: joursDuMois.refine(
      (valeur) => valeur > 0,
      'le mois de pointe doit compter au moins un jour',
    ),
    /** Efficience de projet Ep (%), du module 5. */
    epPourcent: nombreFini
      .gt(0, 'doit être strictement supérieure à 0 %')
      .max(100, 'ne peut pas dépasser 100 %'),
    /** Coefficient de pointe K (1,1 à 1,3 ; usuel 1,2). */
    k: nombrePositif.default(1.2),
    /** Main d'eau usuelle (l/s), table G. */
    mainDEau: nombrePositif,
    /** Superficie totale du périmètre (ha), du module 2. */
    at: nombrePositif,
    /** Besoin net total du cycle (mm), du module 2. */
    bEnTotal: nombrePositifOuNul,
    /** Dose nette retenue (mm), du module 1. */
    dnRetenue: nombrePositif,
  })
  .strict();

export type EntreesDfcDmp = z.input<typeof schemaDfcDmp>;

export interface ResultatsDfcDmp {
  /** Débit fictif continu net (l/s/ha). */
  readonly dfcNet: number;
  /** Débit fictif continu brut (l/s/ha). */
  readonly dfcBrut: number;
  /** Débit maximal de pointe (l/s/ha). */
  readonly dmp: number;
  /** Superficie desservie par une main d'eau (ha). */
  readonly w: number;
  /** Nombre de quartiers hydrauliques. */
  readonly nombreQuartiers: number;
  /** Nombre d'arrosages du cycle, arrondi au supérieur. */
  readonly nombreArrosages: number;
  /** Nombre d'arrosages théorique, avant arrondi. */
  readonly nombreArrosagesTheorique: number;
}

export function calculerDfcDmp(entree: unknown): ResultatMoteur<ResultatsDfcDmp> {
  const e = analyser(schemaDfcDmp, entree);
  const avertissements: Avertissement[] = [];

  const dfcNet = exigerFini(
    diviser(e.qmPointe, e.joursMoisDePointe * FACTEUR_CONVERSION, {
      message:
        'Le mois de pointe ne compte aucun jour : le débit fictif continu ne peut pas être calculé.',
      code: 'MOIS_DE_POINTE_SANS_JOURS',
      champ: 'joursMoisDePointe',
    }),
    'débit fictif continu net',
    'joursMoisDePointe',
  );

  const epFraction = e.epPourcent / 100;
  const dfcBrut = exigerFini(
    diviser(dfcNet, epFraction, {
      message:
        'L’efficience de projet est nulle : le débit fictif continu brut ne peut pas être calculé.',
      code: 'EFFICIENCE_PROJET_NULLE',
      champ: 'epPourcent',
    }),
    'débit fictif continu brut',
    'epPourcent',
  );

  const dmp = exigerFini(dfcBrut * e.k, 'débit maximal de pointe');

  if (e.k < K_MINI_USUEL || e.k > K_MAXI_USUEL) {
    avertissements.push(
      attention(
        'K_HORS_PLAGE_USUELLE',
        `Le coefficient de pointe saisi (${e.k}) sort de la plage usuelle 1,1 à 1,3 (valeur courante : 1,2).`,
      ),
    );
  }

  const w = exigerFini(
    diviser(e.mainDEau, dfcBrut, {
      message:
        'Le débit fictif continu brut est nul : la superficie desservie par une main d’eau ne peut pas être calculée.',
      code: 'DFC_BRUT_NUL',
      champ: 'qmPointe',
    }),
    'superficie par main d’eau',
  );

  const nombreQuartiers = arrondiSuperieur(
    diviser(e.at, w, {
      message:
        'La superficie desservie par une main d’eau est nulle : le nombre de quartiers ne peut pas être calculé.',
      code: 'SUPERFICIE_PAR_MAIN_D_EAU_NULLE',
      champ: 'mainDEau',
    }),
  );

  const nombreArrosagesTheorique = exigerFini(
    diviser(e.bEnTotal, e.dnRetenue, {
      message:
        'La dose nette retenue est nulle : le nombre d’arrosages ne peut pas être calculé.',
      code: 'DOSE_NETTE_NULLE',
      champ: 'dnRetenue',
    }),
    'nombre d’arrosages',
    'dnRetenue',
  );

  return envelopper(
    CODE_MODULE_DFC_DMP,
    {
      dfcNet,
      dfcBrut,
      dmp,
      w,
      nombreQuartiers,
      nombreArrosages: arrondiSuperieur(nombreArrosagesTheorique),
      nombreArrosagesTheorique,
    },
    avertissements,
  );
}
