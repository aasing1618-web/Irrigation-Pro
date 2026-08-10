/**
 * Module 5 — `5_Efficiences` : calculateur d'efficiences.
 *
 * Source : MOTEUR-GRAVITAIRE.md §8.
 *
 * Relations : `Ed = Et × Eb` ; `Ei = Eb × Ea` ; `Ep = Et × Eb × Ea = Ed × Ea = Et × Ei`.
 * Toutes les efficiences sont exprimées en **pourcentage**.
 *
 * Définitions à afficher dans l'interface :
 *  - `Et` : eau reçue à l'entrée du bloc / eau lâchée à l'ouvrage de tête ;
 *  - `Eb` : eau reçue à l'entrée de la parcelle / eau reçue à l'entrée du bloc ;
 *  - `Ea` : eau disponible pour la culture / eau reçue à l'entrée de la parcelle.
 *
 * ⚠️ Dans le classeur, l'aide au choix de `Ea` (table C) est un calculateur
 * **local non répercuté** : l'utilisateur recopie la valeur à la main.
 * Comportement retenu : le moteur accepte une `methodeApplication` et en déduit
 * `Ea` automatiquement ; une valeur `ea` saisie explicitement l'emporte.
 */

import { z } from 'zod';

import { envelopper, info, type Avertissement, type ResultatMoteur } from '../types.js';
import {
  MethodeApplication,
  efficienceApplication,
  type CodeMethodeApplication,
} from '../tables/efficiences.js';
import { ErreurValidation, exigerFini } from '../erreurs.js';
import { analyser, pourcentageEfficience } from '../validation.js';

export const CODE_MODULE_EFFICIENCES = 'EFFICIENCES';

/** Tolérance des contrôles de cohérence (arithmétique flottante seulement). */
const TOLERANCE_COHERENCE = 1e-9;

export const schemaEfficiences = z
  .object({
    /** Efficience de transport Et (%). */
    et: pourcentageEfficience,
    /** Efficience des canaux du bloc Eb (%). */
    eb: pourcentageEfficience,
    /** Efficience d'application Ea (%). Prioritaire sur `methodeApplication`. */
    ea: pourcentageEfficience.optional(),
    /** Méthode d'irrigation (table C) : détermine `Ea` si `ea` est absent. */
    methodeApplication: z.enum(['SURFACE', 'ASPERSION', 'GOUTTE_A_GOUTTE']).optional(),
  })
  .strict();

export type EntreesEfficiences = z.input<typeof schemaEfficiences>;

export interface ResultatsEfficiences {
  readonly et: number;
  readonly eb: number;
  readonly ea: number;
  readonly sourceEa: 'TABLE_C' | 'SAISIE';
  /** Efficience de distribution Ed (%) = Et × Eb. */
  readonly ed: number;
  /** Efficience d'irrigation Ei (%) = Eb × Ea. */
  readonly ei: number;
  /** Efficience de projet Ep (%) = Et × Eb × Ea. */
  readonly ep: number;
  /** Ep en fraction (0-1) — forme attendue par le module 7 (DFC/DMP). */
  readonly epFraction: number;
  /** Contrôles de cohérence affichés par l'interface. */
  readonly controles: {
    readonly epViaEdEa: number;
    readonly epViaEtEi: number;
    readonly coherent: boolean;
  };
}

export function calculerEfficiences(entree: unknown): ResultatMoteur<ResultatsEfficiences> {
  const e = analyser(schemaEfficiences, entree);
  const avertissements: Avertissement[] = [];

  let ea: number;
  let sourceEa: 'TABLE_C' | 'SAISIE';
  if (e.ea !== undefined) {
    ea = e.ea;
    sourceEa = 'SAISIE';
  } else if (e.methodeApplication !== undefined) {
    ea = efficienceApplication(e.methodeApplication as CodeMethodeApplication);
    sourceEa = 'TABLE_C';
    avertissements.push(
      info(
        'EA_REPRISE_TABLE',
        'La valeur d’efficience d’application a été reprise de la table FAO (1989) correspondant à la méthode choisie. Vous pouvez l’écraser par une valeur mesurée sur le terrain.',
      ),
    );
  } else {
    throw new ErreurValidation(
      'Renseignez l’efficience d’application (Ea) ou choisissez une méthode d’irrigation pour la déduire.',
      { code: 'EA_MANQUANTE', champ: 'ea' },
    );
  }

  const ed = exigerFini((e.et * e.eb) / 100, 'efficience de distribution');
  const ei = exigerFini((e.eb * ea) / 100, 'efficience d’irrigation');
  const ep = exigerFini((e.et * e.eb * ea) / 10000, 'efficience de projet');

  const epViaEdEa = (ed * ea) / 100;
  const epViaEtEi = (e.et * ei) / 100;
  const coherent =
    Math.abs(epViaEdEa - ep) <= TOLERANCE_COHERENCE &&
    Math.abs(epViaEtEi - ep) <= TOLERANCE_COHERENCE;

  return envelopper(
    CODE_MODULE_EFFICIENCES,
    {
      et: e.et,
      eb: e.eb,
      ea,
      sourceEa,
      ed,
      ei,
      ep,
      epFraction: ep / 100,
      controles: { epViaEdEa, epViaEtEi, coherent },
    },
    avertissements,
  );
}

/** Méthodes d'application reconnues — utile au catalogue et aux tests. */
export const METHODES_APPLICATION = MethodeApplication;
