/**
 * Module 4 — `4_Capacite_Systeme` (gravitaire) / `4_Debit_Systeme` (sous pression).
 *
 * Sources : MOTEUR-GRAVITAIRE.md §7 et MOTEUR-SOUS-PRESSION.md §5. Les formules
 * sont **strictement identiques** dans les deux classeurs ; seul le bloc de
 * sensibilité au transport (`Et`) est propre au gravitaire. Le module est donc
 * partagé et paramétré par `variante`, comme demandé par la spécification.
 *
 * Formules-cadre : `A = At / IC` ; `V = 10 × A × Db` ; `Q = V / T`.
 *
 * > Point de méthode à conserver absolument (énoncé explicitement dans le
 * > classeur) : dans le design, les besoins n'interviennent **que via IC**.
 * > C'est la **dose brute Db** qui détermine la capacité du système. `Q` ne
 * > dépend donc pas directement de `Ben` ni de `BEnTotal`.
 */

import { z } from 'zod';

import { ErreurCalculImpossible, diviser, exigerFini } from '../erreurs.js';
import { envelopper, info, type Avertissement, type ResultatMoteur } from '../types.js';
import { analyser, fractionZeroUn, nombrePositif } from '../validation.js';

export const CODE_MODULE_CAPACITE = 'CAPACITE_SYSTEME';

/** Secondes dans une heure — conversion m³/h → l/s. */
const SECONDES_PAR_HEURE = 3600;
/** 1 mm d'eau sur 1 ha = 10 m³. */
const M3_PAR_MM_ET_PAR_HA = 10;
/** Durée maximale d'irrigation par jour. */
const HEURES_PAR_JOUR = 24;

export const schemaCapacite = z
  .object({
    variante: z.enum(['GRAVITAIRE', 'SOUS_PRESSION']).default('GRAVITAIRE'),
    /** Superficie totale du périmètre (ha), du module 2. */
    at: nombrePositif,
    /** Cycle d'irrigation retenu (jours), du module 3. */
    ic: nombrePositif,
    /** Dose brute (mm), du module 1. */
    db: nombrePositif,
    /** Durée d'irrigation par jour (h). */
    t: nombrePositif.max(HEURES_PAR_JOUR, 'ne peut pas dépasser 24 heures par jour'),
    /**
     * Efficience de transport Et (fraction 0-1), pour la sensibilité au
     * transport. Bloc propre au classeur gravitaire.
     */
    et: fractionZeroUn.optional(),
  })
  .strict();

export type EntreesCapacite = z.input<typeof schemaCapacite>;

export interface ResultatsCapacite {
  /** Superficie irriguée par jour (ha/j). */
  readonly a: number;
  /** Volume prélevé par jour (m³/j). */
  readonly v: number;
  readonly qLitresParSeconde: number;
  readonly qM3ParHeure: number;
  readonly qM3ParSeconde: number;
  /** Débit à l'ouvrage de tête (l/s) — identique à `qLitresParSeconde`. */
  readonly debitTete: number;
  /** Débit encore disponible en aval après pertes de transport (l/s). */
  readonly debitDisponible: number | null;
  readonly etApplique: number | null;
}

export function calculerCapacite(entree: unknown): ResultatMoteur<ResultatsCapacite> {
  const e = analyser(schemaCapacite, entree);
  const avertissements: Avertissement[] = [];

  const a = exigerFini(
    diviser(e.at, e.ic, {
      message:
        'Le cycle d’irrigation est nul : la superficie irriguée par jour ne peut pas être calculée. Vérifiez le cycle d’irrigation issu du module « Nombre d’irrigations ».',
      code: 'CYCLE_IRRIGATION_NUL',
      champ: 'ic',
    }),
    'superficie irriguée par jour',
    'ic',
  );

  if (a <= 0) {
    throw new ErreurCalculImpossible(
      'La superficie irriguée par jour est nulle : vérifiez le cycle d’irrigation.',
      { code: 'SUPERFICIE_JOURNALIERE_NULLE', champ: 'ic' },
    );
  }

  const v = exigerFini(M3_PAR_MM_ET_PAR_HA * a * e.db, 'volume prélevé par jour');

  const qM3ParHeure = exigerFini(
    diviser(v, e.t, {
      message:
        'La durée d’irrigation par jour est nulle : le débit ne peut pas être calculé. Indiquez combien d’heures par jour le système fonctionne.',
      code: 'DUREE_IRRIGATION_NULLE',
      champ: 't',
    }),
    'débit horaire',
    't',
  );

  const qM3ParSeconde = exigerFini(qM3ParHeure / SECONDES_PAR_HEURE, 'débit en m³/s');
  const qLitresParSeconde = exigerFini(qM3ParSeconde * 1000, 'débit en l/s');

  // Bloc de sensibilité au transport — classeur gravitaire uniquement.
  let debitDisponible: number | null = null;
  let etApplique: number | null = null;
  if (e.et !== undefined) {
    if (e.variante === 'SOUS_PRESSION') {
      avertissements.push(
        info(
          'ET_HORS_VARIANTE',
          'Le bloc de sensibilité au transport (Et) est propre au classeur gravitaire. Il a tout de même été calculé, à titre indicatif.',
        ),
      );
    }
    etApplique = e.et;
    debitDisponible = exigerFini(qLitresParSeconde * e.et, 'débit disponible en aval');
  }

  return envelopper(
    CODE_MODULE_CAPACITE,
    {
      a,
      v,
      qLitresParSeconde,
      qM3ParHeure,
      qM3ParSeconde,
      debitTete: qLitresParSeconde,
      debitDisponible,
      etApplique,
    },
    avertissements,
  );
}
