/**
 * Module 5 (sous pression) — `5_Aspersion` : disposition et fonctionnement d'un
 * réseau d'aspersion.
 *
 * Source : MOTEUR-SOUS-PRESSION.md §6.
 * Formules-cadre : `Se, Sl = %Dm (vent)` ; `Pr = q / (Se×Sl)` ;
 * `N = Qsystème / q` ; `t = Db / Pr`.
 *
 * ⚠️ La vérification « les positions par jour couvrent-elles bien la surface à
 * irriguer sur le cycle IC ? » est **manuelle** dans le classeur. Comportement
 * retenu : elle est **automatisée** ici et signale l'incohérence — c'est
 * précisément le genre d'erreur qu'un tableur laisse passer.
 */

import { z } from 'zod';

import { diviser, exigerFini } from '../erreurs.js';
import { fractionDiametreMouille, type CodeClasseVent } from '../tables/sous-pression.js';
import { attention, envelopper, info, type Avertissement, type ResultatMoteur } from '../types.js';
import { analyser, nombrePositif, nombrePositifOuNul } from '../validation.js';

export const CODE_MODULE_ASPERSION = 'ASPERSION';

/** 1 hectare = 10 000 m². */
const M2_PAR_HECTARE = 10000;
/** Tolérance relative du contrôle de couverture (arrondis de saisie). */
const TOLERANCE_COUVERTURE = 0.02;

export const schemaAspersion = z
  .object({
    /** Diamètre mouillé de l'arroseur Dm (m). */
    dm: nombrePositif,
    /** Classe de vent (table D) : détermine l'espacement en % de Dm. */
    classeVent: z.enum(['CALME', 'FAIBLE', 'MODERE', 'FORT']),
    /** Débit d'un arroseur q (l/h). */
    q: nombrePositif,
    /** Vitesse d'infiltration du sol Ki (mm/h), pour le contrôle de ruissellement. */
    ki: nombrePositifOuNul.optional(),
    /** Débit du système (l/s), du module 4. */
    qSystemeLitresParSeconde: nombrePositif,
    /** Dose brute Db (mm), du module 1. */
    db: nombrePositif,
    /** Durée d'irrigation par jour T (h). */
    t: nombrePositif.max(24, 'ne peut pas dépasser 24 heures par jour'),
    /** Superficie totale (ha) — pour la vérification de couverture. */
    at: nombrePositif.optional(),
    /** Cycle d'irrigation IC (j) — pour la vérification de couverture. */
    ic: nombrePositif.optional(),
  })
  .strict();

export type EntreesAspersion = z.input<typeof schemaAspersion>;

export interface ResultatsAspersion {
  /** Fraction du diamètre mouillé retenue (table D). */
  readonly fractionDm: number;
  /** Espacement entre rampes Se (m). */
  readonly se: number;
  /** Espacement entre arroseurs sur la rampe Sl (m). */
  readonly sl: number;
  /** Surface couverte par un arroseur (m²). */
  readonly surfaceParArroseur: number;
  /** Pluviométrie de l'installation Pr (mm/h). */
  readonly pr: number;
  readonly controleRuissellement: {
    readonly ki: number | null;
    readonly conforme: boolean | null;
    readonly message: string;
  };
  readonly qSystemeLitresParHeure: number;
  /** Nombre d'arroseurs fonctionnant simultanément. */
  readonly nArroseurs: number;
  /** Surface irriguée simultanément (ha). */
  readonly surfaceSimultanee: number;
  /** Durée d'arrosage par position (h). */
  readonly dureeParPosition: number;
  /** Nombre de positions réalisables par jour. */
  readonly positionsParJour: number;
  /**
   * Vérification automatique de la couverture : la surface réellement irriguée
   * par jour doit couvrir `At / IC`. `null` si `at` ou `ic` ne sont pas fournis.
   */
  readonly verificationCouverture: {
    readonly surfaceCouverteParJour: number;
    readonly surfaceRequiseParJour: number;
    readonly ecartRelatif: number;
    readonly conforme: boolean;
  } | null;
}

export function calculerAspersion(entree: unknown): ResultatMoteur<ResultatsAspersion> {
  const e = analyser(schemaAspersion, entree);
  const avertissements: Avertissement[] = [];

  const fractionDm = fractionDiametreMouille(e.classeVent as CodeClasseVent);
  const se = exigerFini(fractionDm * e.dm, 'espacement entre rampes');
  const sl = se; // Se et Sl sont pris égaux dans le classeur.
  const surfaceParArroseur = exigerFini(se * sl, 'surface par arroseur');

  // Pr (mm/h) = q / (Se × Sl) : q en l/h et 1 l/m² = 1 mm.
  const pr = exigerFini(
    diviser(e.q, surfaceParArroseur, {
      message:
        'L’espacement entre arroseurs est nul : la pluviométrie de l’installation ne peut pas être calculée. Vérifiez le diamètre mouillé.',
      code: 'ESPACEMENT_NUL',
      champ: 'dm',
    }),
    'pluviométrie de l’installation',
    'dm',
  );

  let controleRuissellement: ResultatsAspersion['controleRuissellement'];
  if (e.ki === undefined) {
    controleRuissellement = {
      ki: null,
      conforme: null,
      message:
        'Vitesse d’infiltration du sol non renseignée : le risque de ruissellement n’a pas été contrôlé.',
    };
    avertissements.push(
      info(
        'KI_NON_RENSEIGNE',
        'Renseignez la vitesse d’infiltration du sol pour contrôler le risque de ruissellement.',
      ),
    );
  } else if (pr <= e.ki) {
    controleRuissellement = { ki: e.ki, conforme: true, message: 'OK — pas de ruissellement.' };
  } else {
    controleRuissellement = {
      ki: e.ki,
      conforme: false,
      message: 'Risque de ruissellement : réduire le débit des arroseurs ou augmenter Se × Sl.',
    };
    avertissements.push(
      attention(
        'RISQUE_RUISSELLEMENT',
        `La pluviométrie de l’installation (${pr.toFixed(3)} mm/h) dépasse la vitesse d’infiltration du sol (${e.ki} mm/h) : l’eau ruissellera au lieu de s’infiltrer.`,
      ),
    );
  }

  const qSystemeLitresParHeure = exigerFini(
    e.qSystemeLitresParSeconde * 3600,
    'débit du système en l/h',
  );

  const nArroseurs = exigerFini(
    diviser(qSystemeLitresParHeure, e.q, {
      message:
        'Le débit d’un arroseur est nul : le nombre d’arroseurs simultanés ne peut pas être calculé.',
      code: 'DEBIT_ARROSEUR_NUL',
      champ: 'q',
    }),
    'nombre d’arroseurs simultanés',
    'q',
  );

  const surfaceSimultanee = exigerFini(
    (nArroseurs * surfaceParArroseur) / M2_PAR_HECTARE,
    'surface irriguée simultanément',
  );

  const dureeParPosition = exigerFini(
    diviser(e.db, pr, {
      message:
        'La pluviométrie de l’installation est nulle : la durée d’arrosage par position ne peut pas être calculée.',
      code: 'PLUVIOMETRIE_NULLE',
      champ: 'q',
    }),
    'durée par position',
    'q',
  );

  const positionsParJour = exigerFini(
    diviser(e.t, dureeParPosition, {
      message:
        'La durée d’arrosage par position est nulle : le nombre de positions par jour ne peut pas être calculé.',
      code: 'DUREE_POSITION_NULLE',
      champ: 'db',
    }),
    'positions par jour',
    'db',
  );

  if (positionsParJour < 1) {
    avertissements.push(
      attention(
        'MOINS_D_UNE_POSITION',
        `Une seule position demande ${dureeParPosition.toFixed(2)} h alors que le système ne fonctionne que ${e.t} h par jour : l’arrosage d’une position ne peut pas être achevé dans la journée.`,
      ),
    );
  }

  // Vérification de couverture, automatisée (⚠️ manuelle dans le classeur).
  let verificationCouverture: ResultatsAspersion['verificationCouverture'] = null;
  if (e.at !== undefined && e.ic !== undefined) {
    const surfaceCouverteParJour = exigerFini(
      surfaceSimultanee * positionsParJour,
      'surface couverte par jour',
    );
    const surfaceRequiseParJour = exigerFini(
      diviser(e.at, e.ic, {
        message:
          'Le cycle d’irrigation est nul : la superficie à irriguer par jour ne peut pas être calculée.',
        code: 'CYCLE_IRRIGATION_NUL',
        champ: 'ic',
      }),
      'superficie à irriguer par jour',
      'ic',
    );
    const ecartRelatif = exigerFini(
      (surfaceCouverteParJour - surfaceRequiseParJour) / surfaceRequiseParJour,
      'écart de couverture',
      'ic',
    );
    const conforme = ecartRelatif >= -TOLERANCE_COUVERTURE;
    verificationCouverture = {
      surfaceCouverteParJour,
      surfaceRequiseParJour,
      ecartRelatif,
      conforme,
    };
    if (!conforme) {
      avertissements.push(
        attention(
          'COUVERTURE_INSUFFISANTE',
          `Le réseau ne couvre que ${surfaceCouverteParJour.toFixed(3)} ha par jour alors que le cycle d’irrigation en exige ${surfaceRequiseParJour.toFixed(3)} ha. Augmentez la durée de fonctionnement, le débit du système, ou raccourcissez le cycle.`,
        ),
      );
    }
  }

  return envelopper(
    CODE_MODULE_ASPERSION,
    {
      fractionDm,
      se,
      sl,
      surfaceParArroseur,
      pr,
      controleRuissellement,
      qSystemeLitresParHeure,
      nArroseurs,
      surfaceSimultanee,
      dureeParPosition,
      positionsParJour,
      verificationCouverture,
    },
    avertissements,
  );
}
