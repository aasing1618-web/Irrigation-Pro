/**
 * Module 1 — `1_Doses` : dose nette (Dn) et dose brute (Db).
 *
 * Sources : MOTEUR-GRAVITAIRE.md §4 et MOTEUR-SOUS-PRESSION.md §2.
 * Formules-cadre : `Dn = RFU = p × RU = p × (θcc − θpf) × Z` ; `Db = Dn / E × 100`.
 *
 * Module **partagé** entre les deux classeurs, paramétré par `variante` :
 *
 *  - `GRAVITAIRE` : l'efficience est une **saisie libre** (`valeurEfficience`).
 *    ⚠️ MOTEUR-GRAVITAIRE.md §4 : dans le classeur, cette case n'est pas reliée
 *    au module `5_Efficiences` — l'utilisateur recopie à la main, ce qui est une
 *    source d'erreur. Comportement retenu : l'application **propose**
 *    automatiquement la valeur issue de `5_Efficiences`, l'utilisateur pouvant
 *    l'écraser. Le moteur étant une fonction pure, c'est l'appelant qui fournit
 *    la valeur proposée ; le résultat indique sa provenance via
 *    `sourceEfficience`, pour que l'interface puisse afficher « valeur reprise
 *    du module Efficiences ».
 *
 *  - `SOUS_PRESSION` : l'efficience Ea est **calculée automatiquement** à partir
 *    de la méthode d'irrigation (table C sous pression), comme dans le classeur.
 *    Une saisie explicite reste possible et prend alors le dessus.
 */

import { z } from 'zod';

import { ErreurValidation, diviser, exigerFini } from '../erreurs.js';
import {
  LIBELLES_ENRACINEMENT,
  categorieEnracinement,
  doseNetteTableA,
  estCultureConnue,
  type CodeCategorieEnracinement,
  type CodeTypeSol,
} from '../tables/sols-cultures.js';
import {
  MethodeSousPression,
  efficienceApplicationSousPression,
} from '../tables/sous-pression.js';
import { attention, envelopper, info, type Avertissement, type ResultatMoteur } from '../types.js';
import { analyser, nombreFini, nombrePositif, pourcentageEfficience } from '../validation.js';

export const CODE_MODULE_DOSES = 'DOSES';

export const schemaDoses = z
  .object({
    /** Classeur d'origine : gravitaire (surface libre) ou sous pression. */
    variante: z.enum(['GRAVITAIRE', 'SOUS_PRESSION']).default('GRAVITAIRE'),

    // --- Méthode A : choix rapide par tables A et B
    culture: z.string().min(1).optional(),
    typeSol: z.enum(['SABLEUX', 'LIMONEUX', 'ARGILEUX']).optional(),

    // --- Méthode B : calcul détaillé (RFU)
    /** Facteur de tarissement p (0 à 1 ; FAO 56 usuel ≈ 0,3 à 0,7). */
    p: nombreFini.min(0, 'doit être compris entre 0 et 1').max(1, 'doit être compris entre 0 et 1').optional(),
    /** Humidité à la capacité au champ θcc (cm³/cm³). */
    thetaCc: nombreFini.min(0, 'ne peut pas être négative').max(1, 'ne peut pas dépasser 1 cm³/cm³').optional(),
    /** Humidité au point de flétrissement permanent θpf (cm³/cm³). */
    thetaPf: nombreFini.min(0, 'ne peut pas être négative').max(1, 'ne peut pas dépasser 1 cm³/cm³').optional(),
    /** Profondeur racinaire Z (cm). */
    profondeurRacinaire: nombrePositif.optional(),

    // --- Dose nette retenue
    sourceDnRetenue: z.enum(['TABLE', 'FORMULE', 'SAISIE']).default('TABLE'),
    /** Dose nette imposée par l'utilisateur (mm), si `sourceDnRetenue = SAISIE`. */
    dnSaisie: nombrePositif.optional(),

    // --- Dose brute
    /** Efficience utilisée pour la dose brute : Ea, Eb ou Ep. */
    typeEfficience: z.enum(['Ea', 'Eb', 'Ep']).default('Ea'),
    /** Valeur d'efficience en % — saisie libre (gravitaire) ou écrasement. */
    valeurEfficience: pourcentageEfficience.optional(),
    /** Méthode d'irrigation sous pression (table C) : détermine Ea. */
    methodeIrrigation: z.enum(['ASPERSION', 'GOUTTE_A_GOUTTE']).optional(),
  })
  .strict();

export type EntreesDoses = z.input<typeof schemaDoses>;

export interface ResultatsDoses {
  /** Catégorie d'enracinement issue de la table B. `null` si culture inconnue. */
  readonly categorieEnracinement: CodeCategorieEnracinement | null;
  readonly libelleCategorieEnracinement: string | null;
  /** Dose nette suggérée par la table A (mm). `null` si méthode A incomplète. */
  readonly dnSuggere: number | null;
  /** Réserve utile (mm), méthode B. `null` si méthode B non renseignée. */
  readonly ru: number | null;
  /** Dose nette calculée par la formule RFU (mm), méthode B. */
  readonly dnMethodeB: number | null;
  /** Dose nette effectivement retenue pour la suite du pipeline (mm). */
  readonly dnRetenue: number;
  readonly sourceDnRetenue: 'TABLE' | 'FORMULE' | 'SAISIE';
  /** Efficience appliquée pour la dose brute (%). */
  readonly efficienceUtilisee: number;
  readonly typeEfficience: 'Ea' | 'Eb' | 'Ep';
  /** `TABLE_C` = déduite de la méthode d'irrigation ; `SAISIE` = fournie. */
  readonly sourceEfficience: 'TABLE_C' | 'SAISIE';
  /** Dose brute (mm). */
  readonly db: number;
}

/** Bornes usuelles du facteur de tarissement p (FAO 56). Simple aide au contrôle. */
const P_USUEL_MINI = 0.3;
const P_USUEL_MAXI = 0.7;

export function calculerDoses(entree: unknown): ResultatMoteur<ResultatsDoses> {
  const e = analyser(schemaDoses, entree);
  const avertissements: Avertissement[] = [];

  // ---------------------------------------------------------------- Méthode A
  let categorie: CodeCategorieEnracinement | null = null;
  if (e.culture !== undefined) {
    if (!estCultureConnue(e.culture)) {
      avertissements.push(
        attention(
          'CULTURE_INCONNUE',
          `La culture « ${e.culture} » ne figure pas dans la table de classification des enracinements : aucune dose nette ne peut être suggérée.`,
        ),
      );
    }
    categorie = categorieEnracinement(e.culture);
  }

  const dnSuggere =
    categorie !== null && e.typeSol !== undefined
      ? doseNetteTableA(e.typeSol as CodeTypeSol, categorie)
      : null;

  // ---------------------------------------------------------------- Méthode B
  let ru: number | null = null;
  let dnMethodeB: number | null = null;
  const methodeBRenseignee =
    e.p !== undefined &&
    e.thetaCc !== undefined &&
    e.thetaPf !== undefined &&
    e.profondeurRacinaire !== undefined;

  if (methodeBRenseignee) {
    const thetaCc = e.thetaCc as number;
    const thetaPf = e.thetaPf as number;
    const p = e.p as number;
    const z = e.profondeurRacinaire as number;

    if (thetaCc <= thetaPf) {
      throw new ErreurValidation(
        'L’humidité à la capacité au champ doit être supérieure à celle au point de flétrissement : sinon la réserve utile du sol est nulle ou négative.',
        { code: 'RESERVE_UTILE_NULLE', champ: 'thetaCc' },
      );
    }

    // MOTEUR-GRAVITAIRE.md §4, méthode B : ×10 convertit Z (cm) en mm d'eau.
    ru = exigerFini((thetaCc - thetaPf) * z * 10, 'réserve utile', 'thetaCc');
    dnMethodeB = exigerFini(p * ru, 'dose nette (méthode détaillée)', 'p');

    if (p < P_USUEL_MINI || p > P_USUEL_MAXI) {
      avertissements.push(
        info(
          'P_HORS_PLAGE_USUELLE',
          `Le facteur de tarissement saisi (${p}) sort de la plage usuelle FAO 56 (0,3 à 0,7). Vérifiez qu'il correspond bien à la culture et au sol.`,
        ),
      );
    }
  }

  // -------------------------------------------------------- Dose nette retenue
  // MOTEUR-GRAVITAIRE.md §4 : la valeur par défaut est celle de la méthode A ;
  // l'utilisateur peut l'écraser par la méthode B ou par une valeur libre.
  let dnRetenue: number;
  switch (e.sourceDnRetenue) {
    case 'SAISIE':
      if (e.dnSaisie === undefined) {
        throw new ErreurValidation(
          'Vous avez choisi de saisir librement la dose nette : renseignez sa valeur en millimètres.',
          { code: 'DN_SAISIE_MANQUANTE', champ: 'dnSaisie' },
        );
      }
      dnRetenue = e.dnSaisie;
      break;
    case 'FORMULE':
      if (dnMethodeB === null) {
        throw new ErreurValidation(
          'Le calcul détaillé de la dose nette demande les quatre valeurs : facteur de tarissement, humidité à la capacité au champ, humidité au point de flétrissement et profondeur racinaire.',
          { code: 'METHODE_B_INCOMPLETE', champ: 'p' },
        );
      }
      dnRetenue = dnMethodeB;
      break;
    default:
      if (dnSuggere === null) {
        throw new ErreurValidation(
          'La dose nette ne peut pas être lue dans la table : choisissez une culture reconnue et un type de sol, ou passez au calcul détaillé.',
          { code: 'METHODE_A_INCOMPLETE', champ: 'culture' },
        );
      }
      dnRetenue = dnSuggere;
      break;
  }

  // ------------------------------------------------------------- Dose brute
  let efficienceUtilisee: number;
  let sourceEfficience: 'TABLE_C' | 'SAISIE';

  if (e.valeurEfficience !== undefined) {
    efficienceUtilisee = e.valeurEfficience;
    sourceEfficience = 'SAISIE';
  } else if (e.variante === 'SOUS_PRESSION' && e.methodeIrrigation !== undefined) {
    // MOTEUR-SOUS-PRESSION.md §2 : ici le classeur fait bien la liaison.
    efficienceUtilisee = efficienceApplicationSousPression(
      e.methodeIrrigation === 'ASPERSION'
        ? MethodeSousPression.ASPERSION
        : MethodeSousPression.GOUTTE_A_GOUTTE,
    );
    sourceEfficience = 'TABLE_C';
  } else {
    throw new ErreurValidation(
      e.variante === 'SOUS_PRESSION'
        ? 'Choisissez la méthode d’irrigation (aspersion ou goutte-à-goutte) pour déterminer l’efficience d’application, ou saisissez directement sa valeur.'
        : 'Renseignez l’efficience à utiliser pour la dose brute (en %). Elle peut être reprise du module Efficiences.',
      { code: 'EFFICIENCE_MANQUANTE', champ: 'valeurEfficience' },
    );
  }

  const db = exigerFini(
    diviser(dnRetenue * 100, efficienceUtilisee, {
      message:
        'L’efficience utilisée pour la dose brute est nulle : la dose brute ne peut pas être calculée.',
      code: 'EFFICIENCE_NULLE',
      champ: 'valeurEfficience',
    }),
    'dose brute',
    'valeurEfficience',
  );

  if (e.variante === 'GRAVITAIRE' && sourceEfficience === 'SAISIE') {
    avertissements.push(
      info(
        'EFFICIENCE_SAISIE_LIBRE',
        'L’efficience utilisée ici est une saisie libre. Vérifiez qu’elle correspond bien à la valeur produite par le module Efficiences.',
      ),
    );
  }

  return envelopper(
    CODE_MODULE_DOSES,
    {
      categorieEnracinement: categorie,
      libelleCategorieEnracinement: categorie === null ? null : LIBELLES_ENRACINEMENT[categorie],
      dnSuggere,
      ru,
      dnMethodeB,
      dnRetenue,
      sourceDnRetenue: e.sourceDnRetenue,
      efficienceUtilisee,
      typeEfficience: e.typeEfficience,
      sourceEfficience,
      db,
    },
    avertissements,
  );
}
