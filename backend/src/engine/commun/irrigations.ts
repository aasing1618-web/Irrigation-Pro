/**
 * Module 3 — `3_Nb_Irrig_ESP_IC` : nombre d'irrigations, espacement, cycle.
 *
 * Formules-cadre (Savva & Frenken, 2002) :
 * `Ni = BEnTotal / Dn` ; `ESP = Dn / Ben(mm/j)` ; `IC = ESP − 1 j`.
 *
 * Deux variantes :
 *  - **Gravitaire** (MOTEUR-GRAVITAIRE.md §6) : tableau mensuel complet, `IC`
 *    plafonné par le bas à 1 jour, `ICretenu` déduit du mois le plus exigeant.
 *  - **Sous pression** (MOTEUR-SOUS-PRESSION.md §4) : pas de tableau mensuel,
 *    tout est calculé sur le mois de pointe, et **pas de `MAX(1, …)`**.
 */

import { z } from 'zod';

import { ErreurCalculImpossible, diviser, exigerFini } from '../erreurs.js';
import { arrondiSuperieur } from '../nombres.js';
import { attention, envelopper, info, type Avertissement, type ResultatMoteur } from '../types.js';
import {
  analyser,
  douzeMois,
  joursDuMois,
  nombreFini,
  nombrePositif,
  nombrePositifOuNul,
} from '../validation.js';

export const CODE_MODULE_IRRIGATIONS_GRAVITAIRE = 'IRRIGATIONS_GRAVITAIRE';
export const CODE_MODULE_IRRIGATIONS_SOUS_PRESSION = 'IRRIGATIONS_SOUS_PRESSION';

// ===========================================================================
//  Variante gravitaire
// ===========================================================================

export const schemaIrrigationsGravitaire = z
  .object({
    /** Dose nette retenue (mm), du module 1. */
    dnRetenue: nombrePositif,
    /** Besoin net total du cycle (mm), du module 2. */
    bEnTotal: nombrePositifOuNul,
    mois: douzeMois(
      z
        .object({
          nom: z.string().min(1).optional(),
          jours: joursDuMois,
          /** Besoin net assolé du mois (mm/mois), du module 2. */
          besoinNetAssole: nombrePositifOuNul,
        })
        .strict(),
    ),
  })
  .strict();

export type EntreesIrrigationsGravitaire = z.input<typeof schemaIrrigationsGravitaire>;

export interface MoisIrrigation {
  readonly index: number;
  readonly nom: string | null;
  readonly jours: number;
  /** Besoin net journalier (mm/j). */
  readonly benParJour: number;
  /** Espacement entre deux arrosages (jours). `null` = mois sans besoin. */
  readonly esp: number | null;
  /** Cycle d'irrigation du mois (jours), plancher à 1 j. `null` si pas d'ESP. */
  readonly ic: number | null;
  /** Nombre d'arrosages dans le mois, arrondi au supérieur. */
  readonly nbArrosages: number;
}

export interface ResultatsIrrigationsGravitaire {
  /** Nombre d'irrigations théorique du cycle. */
  readonly ni: number;
  /** Nombre d'irrigations retenu pour la planification (arrondi au supérieur). */
  readonly niArrondi: number;
  readonly parMois: readonly MoisIrrigation[];
  /** Espacement minimal sur les 12 mois (jours) — le mois qui dimensionne. */
  readonly espMini: number;
  readonly moisEspMini: number;
  readonly nomMoisEspMini: string | null;
  /** Cycle d'irrigation retenu pour le design (jours). */
  readonly icRetenu: number;
}

export function calculerIrrigationsGravitaire(
  entree: unknown,
): ResultatMoteur<ResultatsIrrigationsGravitaire> {
  const e = analyser(schemaIrrigationsGravitaire, entree);
  const avertissements: Avertissement[] = [];

  const ni = exigerFini(
    diviser(e.bEnTotal, e.dnRetenue, {
      message:
        'La dose nette retenue est nulle : le nombre d’irrigations du cycle ne peut pas être calculé.',
      code: 'DOSE_NETTE_NULLE',
      champ: 'dnRetenue',
    }),
    'nombre d’irrigations',
    'dnRetenue',
  );

  // MOTEUR-GRAVITAIRE.md §6 : le classeur n'automatise pas l'arrondi ; on
  // affiche les deux et on indique lequel sert à la planification.
  const niArrondi = arrondiSuperieur(ni);

  const parMois: MoisIrrigation[] = [];
  for (let index = 0; index < 12; index += 1) {
    const mois = e.mois[index];
    if (mois === undefined) continue;

    const benParJour = mois.jours === 0 ? 0 : mois.besoinNetAssole / mois.jours;
    // Le numérateur d'ESP est toujours le même Dn : la dose ne varie pas d'un
    // mois à l'autre (MOTEUR-GRAVITAIRE.md §6).
    const esp = benParJour === 0 ? null : exigerFini(e.dnRetenue / benParJour, 'espacement');
    const ic = esp === null ? null : Math.max(1, esp - 1);
    const nbArrosages = esp === null ? 0 : arrondiSuperieur(mois.jours / esp);

    parMois.push({
      index: index + 1,
      nom: mois.nom ?? null,
      jours: mois.jours,
      benParJour: exigerFini(benParJour, 'besoin net journalier'),
      esp,
      ic,
      nbArrosages,
    });
  }

  let moisMini: MoisIrrigation | undefined;
  for (const mois of parMois) {
    if (mois.esp === null) continue;
    if (moisMini === undefined || mois.esp < (moisMini.esp ?? Number.POSITIVE_INFINITY)) {
      moisMini = mois;
    }
  }

  if (moisMini === undefined || moisMini.esp === null) {
    throw new ErreurCalculImpossible(
      'Aucun mois ne présente de besoin en eau : l’espacement entre arrosages est indéfini, le cycle d’irrigation ne peut pas être déterminé.',
      { code: 'AUCUN_BESOIN_MENSUEL', champ: 'mois' },
    );
  }

  const espMini = moisMini.esp;
  const icRetenu = Math.max(1, espMini - 1);

  if (espMini - 1 < 1) {
    avertissements.push(
      attention(
        'IC_PLANCHER',
        `L’espacement le plus contraignant est de ${espMini.toFixed(2)} jour(s) : le cycle d’irrigation serait inférieur à 1 jour. Il a été ramené à 1 jour, conformément à la règle du classeur. Vérifiez la dose nette retenue.`,
      ),
    );
  }

  avertissements.push(
    info(
      'NI_ARRONDI',
      `Nombre d’irrigations théorique : ${ni.toFixed(3)}. C’est la valeur arrondie au supérieur (${niArrondi}) qui sert à la planification.`,
    ),
  );

  return envelopper(
    CODE_MODULE_IRRIGATIONS_GRAVITAIRE,
    {
      ni,
      niArrondi,
      parMois,
      espMini,
      moisEspMini: moisMini.index,
      nomMoisEspMini: moisMini.nom,
      icRetenu,
    },
    avertissements,
  );
}

// ===========================================================================
//  Variante sous pression
// ===========================================================================

export const schemaIrrigationsSousPression = z
  .object({
    dnRetenue: nombrePositif,
    bEnTotal: nombreFini,
    /** Besoin net du mois de pointe (mm/mois), du module 2. */
    besoinNetDePointe: nombrePositifOuNul,
    /** Nombre de jours du mois de pointe. */
    joursMoisDePointe: joursDuMois,
  })
  .strict();

export type EntreesIrrigationsSousPression = z.input<typeof schemaIrrigationsSousPression>;

export interface ResultatsIrrigationsSousPression {
  readonly ni: number;
  readonly niArrondi: number;
  /** Besoin net journalier du mois de pointe (mm/j). */
  readonly benParJour: number;
  /** Espacement entre deux arrosages (jours). */
  readonly esp: number;
  /** Cycle d'irrigation retenu (jours) — **non plafonné à 1**. */
  readonly ic: number;
}

export function calculerIrrigationsSousPression(
  entree: unknown,
): ResultatMoteur<ResultatsIrrigationsSousPression> {
  const e = analyser(schemaIrrigationsSousPression, entree);
  const avertissements: Avertissement[] = [];

  const ni = exigerFini(
    diviser(e.bEnTotal, e.dnRetenue, {
      message:
        'La dose nette retenue est nulle : le nombre d’irrigations du cycle ne peut pas être calculé.',
      code: 'DOSE_NETTE_NULLE',
      champ: 'dnRetenue',
    }),
    'nombre d’irrigations',
    'dnRetenue',
  );
  // MOTEUR-SOUS-PRESSION.md §4 : ici l'arrondi EST automatisé dans le classeur.
  const niArrondi = arrondiSuperieur(ni);

  const benParJour = exigerFini(
    diviser(e.besoinNetDePointe, e.joursMoisDePointe, {
      message:
        'Le mois de pointe ne compte aucun jour : le besoin journalier ne peut pas être calculé.',
      code: 'MOIS_DE_POINTE_SANS_JOURS',
      champ: 'joursMoisDePointe',
    }),
    'besoin net journalier',
    'joursMoisDePointe',
  );

  const esp = exigerFini(
    diviser(e.dnRetenue, benParJour, {
      message:
        'Le besoin en eau du mois de pointe est nul : l’espacement entre arrosages est indéfini. Vérifiez le calcul des besoins en eau.',
      code: 'BESOIN_DE_POINTE_NUL',
      champ: 'besoinNetDePointe',
    }),
    'espacement',
    'besoinNetDePointe',
  );

  const ic = esp - 1;

  // ⚠️ MOTEUR-SOUS-PRESSION.md §4, comportement retenu : ne pas plafonner
  // silencieusement, mais REFUSER le calcul si IC ≤ 0 — un cycle négatif n'a
  // pas de sens physique et propagerait une aberration jusqu'au débit de la
  // pompe. Avertir si 0 < IC < 1.
  if (ic <= 0) {
    throw new ErreurCalculImpossible(
      `Le cycle d’irrigation obtenu est nul ou négatif (${ic.toFixed(3)} jour). L’espacement entre deux arrosages (${esp.toFixed(3)} jour) est inférieur ou égal à 1 jour : la dose nette retenue est trop faible au regard du besoin de pointe. Augmentez la dose nette ou vérifiez les besoins en eau.`,
      { code: 'CYCLE_IRRIGATION_NON_PHYSIQUE', champ: 'dnRetenue' },
    );
  }
  if (ic < 1) {
    avertissements.push(
      attention(
        'CYCLE_INFERIEUR_A_UN_JOUR',
        `Le cycle d’irrigation obtenu (${ic.toFixed(3)} jour) est inférieur à 1 jour : le système devrait arroser plus d’une fois par jour. Vérifiez la dose nette retenue avant de dimensionner.`,
      ),
    );
  }

  return envelopper(
    CODE_MODULE_IRRIGATIONS_SOUS_PRESSION,
    { ni, niArrondi, benParJour, esp, ic },
    avertissements,
  );
}
