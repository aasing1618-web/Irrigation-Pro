/**
 * Module 7 (sous pression) — `7_Reseau_Hazen_Williams` : pertes de charge.
 *
 * Source : MOTEUR-SOUS-PRESSION.md §8.
 * Formules-cadre : `J = 10,67 × Q^1,852 / (C^1,852 × D^4,87)` ;
 * `F = 1/(m+1) + 1/(2N) + √(m−1)/(6N²)` ; `v = Q / (πD²/4)`.
 *
 * > ⚠️ Point d'architecture. Le classeur dit « recopiez cette feuille pour
 * > chaque tronçon ». **Le réseau est donc modélisé ici comme une liste de
 * > tronçons typés** (rampe, porte-rampe, secondaire, principale, refoulement),
 * > chacun avec ses propres paramètres, et les ΔH sont **agrégés** pour
 * > alimenter le module 8 (HMT de la pompe). C'est la principale amélioration
 * > structurelle apportée au tableur.
 */

import { z } from 'zod';

import { ErreurValidation, diviser, exigerFini } from '../erreurs.js';
import {
  coefficientHazenWilliams,
  estMateriauConduiteConnu,
  plageVitesse,
  type CodeMateriauConduite,
  type CodeTypeConduite,
} from '../tables/sous-pression.js';
import { attention, envelopper, type Avertissement, type ResultatMoteur } from '../types.js';
import { analyser, nombreFini, nombrePositif } from '../validation.js';

export const CODE_MODULE_HAZEN_WILLIAMS = 'RESEAU_HAZEN_WILLIAMS';

/** Exposant de Hazen-Williams. Constante de la formule, jamais une saisie. */
export const EXPOSANT_HAZEN_WILLIAMS = 1.852;
/** Constante de la formule en unités SI (Q en m³/s, D en m). */
const CONSTANTE_HAZEN_WILLIAMS = 10.67;
/** Exposant du diamètre. */
const EXPOSANT_DIAMETRE = 4.87;

/**
 * Facteur de Christiansen, **formule continue** — valable pour tout `N`.
 *
 * Le long d'une rampe, chaque sortie prélève du débit : la perte de charge
 * réelle est donc inférieure à celle d'une conduite à débit constant.
 * `N ≤ 1` (conduite simple, sans sortie intermédiaire) → `F = 1`.
 */
export function facteurChristiansenContinu(nombreSorties: number): number {
  if (!Number.isFinite(nombreSorties) || nombreSorties <= 1) return 1;
  const m = EXPOSANT_HAZEN_WILLIAMS;
  return (
    1 / (m + 1) +
    1 / (2 * nombreSorties) +
    Math.sqrt(m - 1) / (6 * nombreSorties * nombreSorties)
  );
}

const schemaTroncon = z
  .object({
    nom: z.string().min(1),
    /** Rôle du tronçon dans le réseau — détermine la plage de vitesse admise. */
    type: z.enum(['RAMPE', 'PORTE_RAMPE', 'SECONDAIRE', 'PRINCIPALE', 'REFOULEMENT']),
    /** Matériau (table E) → coefficient C. */
    materiau: z.string().min(1).optional(),
    /** Coefficient C imposé, s'il est connu par ailleurs. */
    c: nombrePositif.optional(),
    /** Diamètre intérieur (mm). */
    diametreMm: nombrePositif,
    /** Débit transporté (l/s). */
    debitLitresParSeconde: nombrePositif,
    /** Longueur du tronçon (m). */
    longueurM: nombrePositif,
    /** Nombre de sorties équidistantes. 0 ou 1 = conduite simple. */
    nombreSorties: nombreFini
      .int('doit être un nombre entier de sorties')
      .min(0, 'ne peut pas être négatif')
      .default(0),
  })
  .strict();

export const schemaReseauHazenWilliams = z
  .object({
    troncons: z.array(schemaTroncon).min(1, 'renseignez au moins un tronçon'),
  })
  .strict();

export type EntreesReseauHazenWilliams = z.input<typeof schemaReseauHazenWilliams>;

export interface ResultatTroncon {
  readonly nom: string;
  readonly type: CodeTypeConduite;
  /** Coefficient de Hazen-Williams retenu. */
  readonly c: number;
  readonly diametreM: number;
  readonly qM3ParSeconde: number;
  /** Perte de charge unitaire J (m/m). */
  readonly j: number;
  /** Facteur de Christiansen appliqué. */
  readonly f: number;
  /** Perte de charge du tronçon ΔH (m). */
  readonly deltaH: number;
  /** Vitesse d'écoulement (m/s). */
  readonly vitesse: number;
  readonly controleVitesse: {
    readonly mini: number;
    readonly maxi: number;
    readonly conforme: boolean;
    readonly message: string;
  };
}

export interface ResultatsReseauHazenWilliams {
  readonly troncons: readonly ResultatTroncon[];
  /** Somme des pertes de charge linéaires (m) — entrée du module 8. */
  readonly deltaHTotal: number;
  /** Sous-totaux par type de conduite (m). */
  readonly deltaHParType: Readonly<Record<string, number>>;
  /** Noms des tronçons dont la vitesse sort de la plage usuelle. */
  readonly tronconsHorsPlage: readonly string[];
  readonly vitesseMaximale: number;
}

export function calculerReseauHazenWilliams(
  entree: unknown,
): ResultatMoteur<ResultatsReseauHazenWilliams> {
  const e = analyser(schemaReseauHazenWilliams, entree);
  const avertissements: Avertissement[] = [];

  const troncons: ResultatTroncon[] = [];
  const deltaHParType: Record<string, number> = {};
  const tronconsHorsPlage: string[] = [];
  let deltaHTotal = 0;
  let vitesseMaximale = 0;

  for (const troncon of e.troncons) {
    let c: number;
    if (troncon.c !== undefined) {
      c = troncon.c;
    } else if (troncon.materiau !== undefined) {
      if (!estMateriauConduiteConnu(troncon.materiau)) {
        throw new ErreurValidation(
          `Le matériau « ${troncon.materiau} » du tronçon « ${troncon.nom} » n’est pas reconnu : choisissez-le dans la liste, ou saisissez directement son coefficient de Hazen-Williams.`,
          { code: 'MATERIAU_INCONNU', champ: 'troncons.materiau' },
        );
      }
      c = coefficientHazenWilliams(troncon.materiau as CodeMateriauConduite);
    } else {
      throw new ErreurValidation(
        `Renseignez le matériau du tronçon « ${troncon.nom} », ou directement son coefficient de Hazen-Williams.`,
        { code: 'MATERIAU_MANQUANT', champ: 'troncons.materiau' },
      );
    }

    const qM3ParSeconde = troncon.debitLitresParSeconde / 1000;
    const diametreM = troncon.diametreMm / 1000;

    const j = exigerFini(
      diviser(
        CONSTANTE_HAZEN_WILLIAMS * Math.pow(qM3ParSeconde, EXPOSANT_HAZEN_WILLIAMS),
        Math.pow(c, EXPOSANT_HAZEN_WILLIAMS) * Math.pow(diametreM, EXPOSANT_DIAMETRE),
        {
          message: `Le diamètre du tronçon « ${troncon.nom} » est nul : la perte de charge ne peut pas être calculée.`,
          code: 'DIAMETRE_NUL',
          champ: 'troncons.diametreMm',
        },
      ),
      'perte de charge unitaire',
      'troncons.diametreMm',
    );

    const f = facteurChristiansenContinu(troncon.nombreSorties);
    const deltaH = exigerFini(j * troncon.longueurM * f, 'perte de charge du tronçon');

    const section = (Math.PI * diametreM * diametreM) / 4;
    const vitesse = exigerFini(
      diviser(qM3ParSeconde, section, {
        message: `Le diamètre du tronçon « ${troncon.nom} » est nul : la vitesse ne peut pas être calculée.`,
        code: 'DIAMETRE_NUL',
        champ: 'troncons.diametreMm',
      }),
      'vitesse d’écoulement',
      'troncons.diametreMm',
    );

    const plage = plageVitesse(troncon.type as CodeTypeConduite);
    const conforme = vitesse >= plage.mini && vitesse <= plage.maxi;
    const message = conforme
      ? `OK — vitesse dans la plage usuelle (${plage.mini} à ${plage.maxi} m/s).`
      : vitesse < plage.mini
        ? `Vitesse hors plage usuelle : inférieure à ${plage.mini} m/s (risque de dépôt).`
        : `Vitesse hors plage usuelle : supérieure à ${plage.maxi} m/s (pertes de charge et coups de bélier).`;

    if (!conforme) {
      tronconsHorsPlage.push(troncon.nom);
      avertissements.push(
        attention(
          'VITESSE_HORS_PLAGE',
          `Tronçon « ${troncon.nom} » : vitesse de ${vitesse.toFixed(3)} m/s, hors de la plage usuelle ${plage.mini} à ${plage.maxi} m/s pour ce type de conduite. Envisagez un diamètre ${vitesse > plage.maxi ? 'supérieur' : 'inférieur'}.`,
        ),
      );
    }

    troncons.push({
      nom: troncon.nom,
      type: troncon.type as CodeTypeConduite,
      c,
      diametreM,
      qM3ParSeconde,
      j,
      f,
      deltaH,
      vitesse,
      controleVitesse: { mini: plage.mini, maxi: plage.maxi, conforme, message },
    });

    deltaHTotal += deltaH;
    deltaHParType[troncon.type] = (deltaHParType[troncon.type] ?? 0) + deltaH;
    if (vitesse > vitesseMaximale) vitesseMaximale = vitesse;
  }

  return envelopper(
    CODE_MODULE_HAZEN_WILLIAMS,
    {
      troncons,
      deltaHTotal: exigerFini(deltaHTotal, 'perte de charge totale'),
      deltaHParType,
      tronconsHorsPlage,
      vitesseMaximale,
    },
    avertissements,
  );
}
