/**
 * Module 2 — `2_Besoins_eau` : besoins en eau des cultures (méthode FAO).
 *
 * Deux variantes, volontairement séparées car les formules diffèrent :
 *
 *  - **Gravitaire** (MOTEUR-GRAVITAIRE.md §5) : assolement de 1 à 2 cultures,
 *    besoin mensuel plafonné à 0, agrégation pondérée par les surfaces.
 *  - **Sous pression** (MOTEUR-SOUS-PRESSION.md §3) : une seule culture, pas de
 *    plafonnement mensuel, et division par Ea pour le besoin brut.
 *
 * Formules-cadre : `ETcrop = Kr × Kc × ETO` ; `Ben = ETcrop × jours + Perc − (Pe + R)`.
 */

import { z } from 'zod';

import { ErreurCalculImpossible, diviser, exigerFini } from '../erreurs.js';
import { attention, envelopper, info, type Avertissement, type ResultatMoteur } from '../types.js';
import {
  analyser,
  douzeMois,
  fractionZeroUn,
  joursDuMois,
  nombrePositif,
  nombrePositifOuNul,
  pourcentageEfficience,
} from '../validation.js';

export const CODE_MODULE_BESOINS_EAU_GRAVITAIRE = 'BESOINS_EAU_GRAVITAIRE';
export const CODE_MODULE_BESOINS_EAU_SOUS_PRESSION = 'BESOINS_EAU_SOUS_PRESSION';

/** 1 mm d'eau sur 1 ha = 10 m³. Constante de conversion du classeur. */
const M3_PAR_MM_ET_PAR_HA = 10;

const schemaMoisClimat = z
  .object({
    /** Libellé du mois (« Juillet », « Mois 4 »…). Purement informatif. */
    nom: z.string().min(1).optional(),
    jours: joursDuMois,
    /** Évapotranspiration de référence (mm/j). */
    eto: nombrePositifOuNul,
    /** Pluie efficace (mm/mois). */
    pe: nombrePositifOuNul,
    /** Percolation profonde (mm/mois). */
    perc: nombrePositifOuNul,
    /** Contribution des eaux souterraines (mm/mois). */
    r: nombrePositifOuNul,
  })
  .strict();

// ===========================================================================
//  Variante gravitaire
// ===========================================================================

export const schemaBesoinsEauGravitaire = z
  .object({
    /** Superficie totale du périmètre (ha). */
    at: nombrePositif,
    /** Irrigation localisée : applique le coefficient de réduction Kr. */
    irrigationLocalisee: z.boolean().default(false),
    /** Coefficient de réduction Kr (sans unité, 0 à 1). */
    kr: fractionZeroUn.optional(),
    /**
     * Assolement. Le classeur prévoit deux cultures ; une seule est acceptée
     * pour ne pas obliger l'utilisateur à saisir une culture fictive.
     */
    cultures: z
      .array(
        z
          .object({
            nom: z.string().min(1),
            /** Surface occupée (ha). */
            surface: nombrePositifOuNul,
            /** Coefficient cultural Kc, un par mois. */
            kc: douzeMois(nombrePositifOuNul),
          })
          .strict(),
      )
      .min(1, 'renseignez au moins une culture')
      .max(2, 'le classeur d’origine ne prévoit que deux cultures'),
    mois: douzeMois(schemaMoisClimat),
    /**
     * ⚠️ MOTEUR-GRAVITAIRE.md §5 : l'en-tête du classeur annonce
     * `BEb = Σ[A%×Ben]/E` mais **la formule implémentée ne divise pas par E**.
     * Comportement retenu : reproduire fidèlement le classeur (pas de division)
     * et exposer la division comme une option **désactivée par défaut**.
     */
    diviserParEfficience: z.boolean().default(false),
    /** Efficience E (%), utilisée seulement si `diviserParEfficience` est vrai. */
    efficience: pourcentageEfficience.optional(),
  })
  .strict();

export type EntreesBesoinsEauGravitaire = z.input<typeof schemaBesoinsEauGravitaire>;

export interface MoisBesoinGravitaire {
  readonly index: number;
  readonly nom: string | null;
  readonly jours: number;
  /** ETcrop de chaque culture (mm/j), même ordre que `cultures`. */
  readonly etcropParCulture: readonly number[];
  /** Besoin net de chaque culture (mm/mois), plafonné à 0. */
  readonly benParCulture: readonly number[];
  /**
   * Besoin **net** assolé (mm/mois) — moyenne pondérée par les surfaces.
   * ⚠️ Le classeur l'appelle « BEb assolé » alors qu'il ne divise pas par
   * l'efficience : le libellé retenu ici cesse de mentir (MOTEUR-GRAVITAIRE.md §5).
   */
  readonly besoinNetAssole: number;
  /** Idem divisé par l'efficience, si l'option est activée. Sinon identique. */
  readonly besoinAssoleRetenu: number;
  /** Volume correspondant sur tout le périmètre (m³/mois). */
  readonly volumeM3: number;
}

export interface ResultatsBesoinsEauGravitaire {
  readonly at: number;
  /** Part de surface de chaque culture (fraction de At). */
  readonly partSurfaces: readonly number[];
  readonly parMois: readonly MoisBesoinGravitaire[];
  /** Besoin net mensuel de pointe (mm/mois). */
  readonly besoinNetDePointe: number;
  /** Rang du mois de pointe, de 1 à 12. */
  readonly moisDePointe: number;
  readonly nomMoisDePointe: string | null;
  readonly joursMoisDePointe: number;
  /** Somme des besoins nets assolés sur 12 mois (mm). */
  readonly bEnTotal: number;
  /** Volume annuel correspondant (m³). */
  readonly volumeTotalM3: number;
  readonly diviseParEfficience: boolean;
}

export function calculerBesoinsEauGravitaire(
  entree: unknown,
): ResultatMoteur<ResultatsBesoinsEauGravitaire> {
  const e = analyser(schemaBesoinsEauGravitaire, entree);
  const avertissements: Avertissement[] = [];

  if (e.irrigationLocalisee && e.kr === undefined) {
    throw new ErreurCalculImpossible(
      'Vous avez indiqué une irrigation localisée : renseignez le coefficient de réduction Kr.',
      { code: 'KR_MANQUANT', champ: 'kr' },
    );
  }
  if (e.diviserParEfficience && e.efficience === undefined) {
    throw new ErreurCalculImpossible(
      'La division du besoin assolé par l’efficience a été demandée : renseignez la valeur de l’efficience (%).',
      { code: 'EFFICIENCE_MANQUANTE', champ: 'efficience' },
    );
  }

  const kr = e.irrigationLocalisee ? (e.kr as number) : 1;

  const surfaceTotaleCultures = e.cultures.reduce((somme, culture) => somme + culture.surface, 0);
  if (surfaceTotaleCultures <= 0) {
    throw new ErreurCalculImpossible(
      'La somme des surfaces cultivées est nulle : renseignez la surface d’au moins une culture.',
      { code: 'SURFACES_NULLES', champ: 'cultures' },
    );
  }
  if (Math.abs(surfaceTotaleCultures - e.at) > 1e-9) {
    avertissements.push(
      attention(
        'SURFACES_INCOHERENTES',
        `La somme des surfaces cultivées (${surfaceTotaleCultures} ha) ne correspond pas à la superficie totale du périmètre (${e.at} ha).`,
      ),
    );
  }

  // %surface_i = surface_i / At  (MOTEUR-GRAVITAIRE.md §5)
  const partSurfaces = e.cultures.map((culture) =>
    diviser(culture.surface, e.at, {
      message: 'La superficie totale du périmètre est nulle : les parts de surface sont indéfinies.',
      code: 'SUPERFICIE_NULLE',
      champ: 'at',
    }),
  );

  const facteurEfficience = e.diviserParEfficience ? (e.efficience as number) / 100 : 1;

  const parMois: MoisBesoinGravitaire[] = [];
  for (let index = 0; index < 12; index += 1) {
    const mois = e.mois[index];
    if (mois === undefined) continue;

    const etcropParCulture: number[] = [];
    const benParCulture: number[] = [];

    for (const culture of e.cultures) {
      const kc = culture.kc[index] ?? 0;
      const etcrop = exigerFini(kr * mois.eto * kc, 'ETcrop');
      etcropParCulture.push(etcrop);
      // Plafonnement à 0 volontaire (MOTEUR-GRAVITAIRE.md §5) : un mois où la
      // pluie efficace dépasse les besoins ne produit pas de besoin négatif.
      benParCulture.push(Math.max(0, etcrop * mois.jours + mois.perc - (mois.pe + mois.r)));
    }

    let besoinNetAssole = 0;
    for (let culture = 0; culture < e.cultures.length; culture += 1) {
      besoinNetAssole += (partSurfaces[culture] ?? 0) * (benParCulture[culture] ?? 0);
    }
    besoinNetAssole = exigerFini(besoinNetAssole, 'besoin net assolé');

    const besoinAssoleRetenu = exigerFini(
      besoinNetAssole / facteurEfficience,
      'besoin assolé retenu',
      'efficience',
    );

    parMois.push({
      index: index + 1,
      nom: mois.nom ?? null,
      jours: mois.jours,
      etcropParCulture,
      benParCulture,
      besoinNetAssole,
      besoinAssoleRetenu,
      volumeM3: exigerFini(M3_PAR_MM_ET_PAR_HA * e.at * besoinAssoleRetenu, 'volume mensuel'),
    });
  }

  let moisPointe = parMois[0];
  for (const mois of parMois) {
    if (moisPointe === undefined || mois.besoinNetAssole > moisPointe.besoinNetAssole) {
      moisPointe = mois;
    }
  }
  if (moisPointe === undefined) {
    throw new ErreurCalculImpossible(
      'Aucun mois exploitable : renseignez les 12 mois du calendrier climatique.',
      { code: 'MOIS_MANQUANTS', champ: 'mois' },
    );
  }
  if (moisPointe.besoinNetAssole <= 0) {
    avertissements.push(
      attention(
        'AUCUN_BESOIN',
        'Aucun mois ne présente de besoin en eau : la pluie efficace couvre les besoins toute l’année. Vérifiez les coefficients culturaux et la pluie efficace.',
      ),
    );
  }

  const bEnTotal = exigerFini(
    parMois.reduce((somme, mois) => somme + mois.besoinNetAssole, 0),
    'besoin net total',
  );

  return envelopper(
    CODE_MODULE_BESOINS_EAU_GRAVITAIRE,
    {
      at: e.at,
      partSurfaces,
      parMois,
      besoinNetDePointe: moisPointe.besoinNetAssole,
      moisDePointe: moisPointe.index,
      nomMoisDePointe: moisPointe.nom,
      joursMoisDePointe: moisPointe.jours,
      bEnTotal,
      volumeTotalM3: exigerFini(
        parMois.reduce((somme, mois) => somme + mois.volumeM3, 0),
        'volume annuel',
      ),
      diviseParEfficience: e.diviserParEfficience,
    },
    avertissements,
  );
}

// ===========================================================================
//  Variante sous pression
// ===========================================================================

export const schemaBesoinsEauSousPression = z
  .object({
    at: nombrePositif,
    culture: z.string().min(1).optional(),
    irrigationLocalisee: z.boolean().default(false),
    /** Kr — vaut 1 en aspersion (couverture totale). */
    kr: fractionZeroUn.optional(),
    /** Efficience d'application Ea (%), reprise du module 1. */
    ea: pourcentageEfficience,
    mois: douzeMois(schemaMoisClimat.extend({ kc: nombrePositifOuNul })),
  })
  .strict();

export type EntreesBesoinsEauSousPression = z.input<typeof schemaBesoinsEauSousPression>;

export interface MoisBesoinSousPression {
  readonly index: number;
  readonly nom: string | null;
  readonly jours: number;
  readonly etcrop: number;
  /**
   * Besoin net mensuel **non plafonné** (mm/mois) — peut être négatif.
   * ⚠️ MOTEUR-SOUS-PRESSION.md §3 : le classeur ne plafonne pas au mois. Une
   * valeur négative traduit un excédent de pluie, information utile.
   */
  readonly ben: number;
  /** Même besoin, plafonné à 0 — c'est lui qui sert au dimensionnement. */
  readonly benPlafonne: number;
  /** `true` si la pluie efficace dépasse les besoins ce mois-là. */
  readonly excedentaire: boolean;
  /** Besoin brut mensuel `Ben / Ea` (mm/mois), non plafonné. */
  readonly beb: number;
  /** Besoin brut mensuel calculé sur le besoin plafonné (mm/mois). */
  readonly bebPlafonne: number;
}

export interface ResultatsBesoinsEauSousPression {
  readonly at: number;
  readonly ea: number;
  readonly parMois: readonly MoisBesoinSousPression[];
  /** Besoin net de pointe (mm/mois), recherché sur les besoins plafonnés. */
  readonly besoinNetDePointe: number;
  readonly moisDePointe: number;
  readonly nomMoisDePointe: string | null;
  readonly joursMoisDePointe: number;
  /**
   * Besoin net total du cycle (mm) — **somme des besoins plafonnés**.
   * C'est la valeur retenue pour le dimensionnement (MOTEUR-SOUS-PRESSION.md §3).
   */
  readonly bEnTotal: number;
  /**
   * Somme brute des besoins mensuels **non plafonnés**, telle que la calcule le
   * classeur d'origine. Conservée pour pouvoir comparer avec le tableur ; elle
   * ne doit pas servir au dimensionnement.
   */
  readonly bEnTotalClasseur: number;
  /** Besoin brut total du cycle (mm), à partir des besoins plafonnés. */
  readonly bEbTotal: number;
  readonly volumeTotalM3: number;
}

export function calculerBesoinsEauSousPression(
  entree: unknown,
): ResultatMoteur<ResultatsBesoinsEauSousPression> {
  const e = analyser(schemaBesoinsEauSousPression, entree);
  const avertissements: Avertissement[] = [];

  if (e.irrigationLocalisee && e.kr === undefined) {
    throw new ErreurCalculImpossible(
      'Vous avez indiqué une irrigation localisée : renseignez le coefficient de réduction Kr. En aspersion (couverture totale), Kr vaut 1.',
      { code: 'KR_MANQUANT', champ: 'kr' },
    );
  }

  const kr = e.irrigationLocalisee ? (e.kr as number) : 1;
  const eaFraction = e.ea / 100;

  const parMois: MoisBesoinSousPression[] = [];
  for (let index = 0; index < 12; index += 1) {
    const mois = e.mois[index];
    if (mois === undefined) continue;

    const etcrop = exigerFini(kr * mois.kc * mois.eto, 'ETcrop');
    const ben = exigerFini(etcrop * mois.jours + mois.perc - (mois.pe + mois.r), 'besoin net');
    const benPlafonne = Math.max(0, ben);

    parMois.push({
      index: index + 1,
      nom: mois.nom ?? null,
      jours: mois.jours,
      etcrop,
      ben,
      benPlafonne,
      excedentaire: ben < 0,
      beb: exigerFini(
        diviser(ben, eaFraction, {
          message: 'L’efficience d’application est nulle : le besoin brut ne peut pas être calculé.',
          code: 'EFFICIENCE_NULLE',
          champ: 'ea',
        }),
        'besoin brut mensuel',
        'ea',
      ),
      bebPlafonne: exigerFini(
        diviser(benPlafonne, eaFraction, {
          message: 'L’efficience d’application est nulle : le besoin brut ne peut pas être calculé.',
          code: 'EFFICIENCE_NULLE',
          champ: 'ea',
        }),
        'besoin brut mensuel',
        'ea',
      ),
    });
  }

  const moisExcedentaires = parMois.filter((mois) => mois.excedentaire);
  if (moisExcedentaires.length > 0) {
    avertissements.push(
      info(
        'MOIS_EXCEDENTAIRES',
        `Mois où la pluie efficace dépasse les besoins : ${moisExcedentaires
          .map((mois) => mois.nom ?? `mois ${mois.index}`)
          .join(', ')}. Ces excédents sont ramenés à 0 dans le total du cycle et dans la recherche du mois de pointe, pour ne pas sous-dimensionner le système.`,
      ),
    );
  }

  // ⚠️ MOTEUR-SOUS-PRESSION.md §3, comportement retenu : plafonnement à 0 dans
  // la recherche du mois de pointe ET dans la somme du cycle.
  let moisPointe = parMois[0];
  for (const mois of parMois) {
    if (moisPointe === undefined || mois.benPlafonne > moisPointe.benPlafonne) {
      moisPointe = mois;
    }
  }
  if (moisPointe === undefined) {
    throw new ErreurCalculImpossible(
      'Aucun mois exploitable : renseignez les 12 mois du calendrier climatique.',
      { code: 'MOIS_MANQUANTS', champ: 'mois' },
    );
  }
  if (moisPointe.benPlafonne <= 0) {
    avertissements.push(
      attention(
        'AUCUN_BESOIN',
        'Aucun mois ne présente de besoin en eau : la pluie efficace couvre les besoins toute l’année. Vérifiez les coefficients culturaux et la pluie efficace.',
      ),
    );
  }

  const bEnTotal = exigerFini(
    parMois.reduce((somme, mois) => somme + mois.benPlafonne, 0),
    'besoin net total du cycle',
  );

  return envelopper(
    CODE_MODULE_BESOINS_EAU_SOUS_PRESSION,
    {
      at: e.at,
      ea: e.ea,
      parMois,
      besoinNetDePointe: moisPointe.benPlafonne,
      moisDePointe: moisPointe.index,
      nomMoisDePointe: moisPointe.nom,
      joursMoisDePointe: moisPointe.jours,
      bEnTotal,
      bEnTotalClasseur: exigerFini(
        parMois.reduce((somme, mois) => somme + mois.ben, 0),
        'besoin net total (méthode du classeur)',
      ),
      bEbTotal: exigerFini(bEnTotal / eaFraction, 'besoin brut total', 'ea'),
      volumeTotalM3: exigerFini(M3_PAR_MM_ET_PAR_HA * e.at * bEnTotal, 'volume total'),
    },
    avertissements,
  );
}
