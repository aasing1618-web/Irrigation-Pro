/**
 * Module 9 (sous pression) — `9_Coeff_Fn_Rampe` : facteur de Christiansen tabulé.
 *
 * Source : MOTEUR-SOUS-PRESSION.md §10. `ΔHréel = ΔH(sans sortie) × F(n)`.
 *
 * Interpolation **linéaire**, valable pour `5 ≤ n ≤ 100`. Hors de cette plage,
 * on renvoie une erreur explicite invitant à utiliser la formule continue de
 * Christiansen (module 7), valable pour tout `n`.
 *
 * ⚠️ Deux règles à ne jamais contourner :
 *  1. Les cases `n.d.` de la source (valeurs illisibles) **ne sont pas
 *     inventées** : elles produisent une erreur, jamais une interpolation.
 *  2. Dans le classeur, aucun lien automatique n'existe entre cette table et le
 *     module 7 : l'utilisateur recopie à la main. Comportement retenu — la
 *     valeur tabulée est une **aide de contrôle**, la formule continue reste la
 *     source du calcul. Le résultat renvoie donc les deux et leur écart.
 */

import { z } from 'zod';

import { ErreurCalculImpossible, exigerFini } from '../erreurs.js';
import {
  LIBELLES_MATERIAU_RAMPE,
  LIBELLES_POSITION_ORIFICE,
  N_INTERPOLATION_MAXI,
  N_INTERPOLATION_MINI,
  encadrer,
  valeurTabulee,
  type CodeMateriauRampe,
  type CodePositionPremierOrifice,
} from '../tables/christiansen.js';
import { attention, envelopper, info, type Avertissement, type ResultatMoteur } from '../types.js';
import { facteurChristiansenContinu } from './hazen-williams.js';
import { analyser, nombreFini } from '../validation.js';

export const CODE_MODULE_CHRISTIANSEN = 'COEFFICIENT_CHRISTIANSEN';

export const schemaChristiansen = z
  .object({
    /** Nombre de sorties (goutteurs ou arroseurs) sur la rampe. */
    n: nombreFini.int('doit être un nombre entier de sorties').min(1, 'au moins une sortie'),
    /** Matériau de la rampe : l'exposant de perte de charge en dépend. */
    materiau: z.enum(['PLASTIQUE', 'ALUMINIUM']),
    /** Position du premier orifice : F1 (à S), F2 (à 0) ou F3 (à S/2). */
    position: z.enum(['F1', 'F2', 'F3']),
  })
  .strict();

export type EntreesChristiansen = z.input<typeof schemaChristiansen>;

export interface ResultatsChristiansen {
  readonly n: number;
  readonly materiau: CodeMateriauRampe;
  readonly libelleMateriau: string;
  readonly position: CodePositionPremierOrifice;
  readonly libellePosition: string;
  /** Facteur F lu ou interpolé dans la table. */
  readonly f: number;
  /** `TABULEE` = valeur exacte de la table ; `INTERPOLEE` = interpolation linéaire. */
  readonly source: 'TABULEE' | 'INTERPOLEE';
  /** Facteur donné par la formule continue du module 7, pour comparaison. */
  readonly fFormuleContinue: number;
  /** Écart relatif entre la valeur tabulée et la formule continue. */
  readonly ecartRelatifAvecFormule: number;
}

export function calculerChristiansen(entree: unknown): ResultatMoteur<ResultatsChristiansen> {
  const e = analyser(schemaChristiansen, entree);
  const avertissements: Avertissement[] = [];

  const materiau = e.materiau as CodeMateriauRampe;
  const position = e.position as CodePositionPremierOrifice;

  const exacte = valeurTabulee(e.n, materiau, position);

  let f: number;
  let source: 'TABULEE' | 'INTERPOLEE';

  if (exacte !== undefined && exacte !== null) {
    // Ligne présente dans la table, valeur lisible : lecture directe.
    f = exacte;
    source = 'TABULEE';
  } else if (exacte === null) {
    // Case `n.d.` : la source est illisible. On ne l'invente pas.
    throw new ErreurCalculImpossible(
      `La table de Christiansen ne donne pas de valeur lisible pour ${e.n} sortie(s) en ${LIBELLES_MATERIAU_RAMPE[materiau].toLowerCase()}, position ${position}. Utilisez la formule continue de Christiansen (module « Réseau — pertes de charge »), valable pour tout nombre de sorties.`,
      { code: 'VALEUR_TABULEE_INDISPONIBLE', champ: 'n' },
    );
  } else if (e.n < N_INTERPOLATION_MINI || e.n > N_INTERPOLATION_MAXI) {
    throw new ErreurCalculImpossible(
      `L’interpolation de la table de Christiansen n’est valable que de ${N_INTERPOLATION_MINI} à ${N_INTERPOLATION_MAXI} sorties (valeur demandée : ${e.n}). Utilisez la formule continue de Christiansen (module « Réseau — pertes de charge »), valable pour tout nombre de sorties.`,
      { code: 'HORS_PLAGE_INTERPOLATION', champ: 'n' },
    );
  } else {
    const bornes = encadrer(e.n, materiau, position);
    if (bornes === null) {
      throw new ErreurCalculImpossible(
        `La table de Christiansen ne permet pas d’encadrer ${e.n} sortie(s) pour cette combinaison de matériau et de position. Utilisez la formule continue de Christiansen.`,
        { code: 'ENCADREMENT_IMPOSSIBLE', champ: 'n' },
      );
    }
    const { bas, haut } = bornes;
    f =
      haut.n === bas.n
        ? bas.f
        : bas.f + ((e.n - bas.n) * (haut.f - bas.f)) / (haut.n - bas.n);
    source = 'INTERPOLEE';
    avertissements.push(
      info(
        'VALEUR_INTERPOLEE',
        `Valeur interpolée linéairement entre ${bas.n} et ${haut.n} sorties.`,
      ),
    );
  }

  f = exigerFini(f, 'facteur de Christiansen', 'n');

  const fFormuleContinue = exigerFini(
    facteurChristiansenContinu(e.n),
    'facteur de Christiansen (formule continue)',
    'n',
  );
  const ecartRelatifAvecFormule = exigerFini(
    (f - fFormuleContinue) / fFormuleContinue,
    'écart avec la formule continue',
    'n',
  );

  avertissements.push(
    info(
      'AIDE_DE_CONTROLE',
      'Cette valeur tabulée est une aide de contrôle. Le calcul des pertes de charge du réseau utilise la formule continue de Christiansen.',
    ),
  );

  if (Math.abs(ecartRelatifAvecFormule) > 0.1) {
    avertissements.push(
      attention(
        'ECART_TABLE_FORMULE',
        `La valeur tabulée (${f.toFixed(3)}) et la formule continue (${fFormuleContinue.toFixed(3)}) diffèrent de ${(ecartRelatifAvecFormule * 100).toFixed(1)} %. Les deux sources supposent des exposants de perte de charge différents ; vérifiez laquelle correspond à votre matériau.`,
      ),
    );
  }

  return envelopper(
    CODE_MODULE_CHRISTIANSEN,
    {
      n: e.n,
      materiau,
      libelleMateriau: LIBELLES_MATERIAU_RAMPE[materiau],
      position,
      libellePosition: LIBELLES_POSITION_ORIFICE[position],
      f,
      source,
      fFormuleContinue,
      ecartRelatifAvecFormule,
    },
    avertissements,
  );
}
