/**
 * Table F(n) de Christiansen tabulée — module `9_Coeff_Fn_Rampe`.
 *
 * Source : MOTEUR-SOUS-PRESSION.md §10.
 *
 * `ΔHréel = ΔH(sans sortie) × F(n)`. Trois positions du premier orifice :
 *  - `F1` : premier orifice à une distance S de la tête ;
 *  - `F2` : premier orifice près de la tête (distance 0) ;
 *  - `F3` : premier orifice à S/2.
 *
 * Deux matériaux, dont l'exposant de perte de charge diffère (plastique lisse
 * vs aluminium).
 *
 * ⚠️ `null` = valeur **illisible sur la source** (`n.d.` dans le document).
 * Elle ne doit **jamais** être inventée ni interpolée : le module renvoie une
 * erreur explicite invitant à utiliser la formule continue de Christiansen.
 */

export const MateriauRampe = {
  PLASTIQUE: 'PLASTIQUE',
  ALUMINIUM: 'ALUMINIUM',
} as const;

export type CodeMateriauRampe = (typeof MateriauRampe)[keyof typeof MateriauRampe];

export const PositionPremierOrifice = {
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
} as const;

export type CodePositionPremierOrifice =
  (typeof PositionPremierOrifice)[keyof typeof PositionPremierOrifice];

export const LIBELLES_MATERIAU_RAMPE: Readonly<Record<CodeMateriauRampe, string>> =
  Object.freeze({
    PLASTIQUE: 'Plastique (PVC / PE)',
    ALUMINIUM: 'Aluminium',
  });

export const LIBELLES_POSITION_ORIFICE: Readonly<
  Record<CodePositionPremierOrifice, string>
> = Object.freeze({
  F1: 'F1 — premier orifice à une distance S de la tête',
  F2: 'F2 — premier orifice près de la tête (distance 0)',
  F3: 'F3 — premier orifice à S/2 de la tête',
});

interface LigneChristiansen {
  readonly n: number;
  readonly PLASTIQUE: Readonly<Record<CodePositionPremierOrifice, number | null>>;
  readonly ALUMINIUM: Readonly<Record<CodePositionPremierOrifice, number | null>>;
}

/** Table de MOTEUR-SOUS-PRESSION.md §10, recopiée telle quelle. */
const TABLE: readonly LigneChristiansen[] = Object.freeze([
  { n: 2, PLASTIQUE: { F1: null, F2: null, F3: null }, ALUMINIUM: { F1: 0.64, F2: null, F3: 0.52 } },
  { n: 3, PLASTIQUE: { F1: null, F2: null, F3: null }, ALUMINIUM: { F1: 0.54, F2: null, F3: 0.44 } },
  {
    n: 5,
    PLASTIQUE: { F1: 0.469, F2: 0.337, F3: 0.41 },
    ALUMINIUM: { F1: 0.457, F2: 0.321, F3: 0.396 },
  },
  {
    n: 10,
    PLASTIQUE: { F1: 0.415, F2: 0.35, F3: 0.384 },
    ALUMINIUM: { F1: 0.402, F2: 0.336, F3: 0.371 },
  },
  {
    n: 15,
    PLASTIQUE: { F1: 0.398, F2: 0.355, F3: 0.377 },
    ALUMINIUM: { F1: 0.385, F2: 0.341, F3: 0.363 },
  },
  {
    n: 20,
    PLASTIQUE: { F1: 0.389, F2: 0.357, F3: 0.373 },
    ALUMINIUM: { F1: 0.376, F2: 0.343, F3: 0.36 },
  },
  {
    n: 25,
    PLASTIQUE: { F1: 0.384, F2: 0.358, F3: 0.371 },
    ALUMINIUM: { F1: 0.371, F2: 0.345, F3: 0.358 },
  },
  {
    n: 30,
    PLASTIQUE: { F1: 0.381, F2: 0.359, F3: 0.37 },
    ALUMINIUM: { F1: 0.368, F2: 0.346, F3: 0.357 },
  },
  {
    n: 40,
    PLASTIQUE: { F1: 0.376, F2: 0.36, F3: 0.368 },
    ALUMINIUM: { F1: 0.363, F2: 0.347, F3: 0.355 },
  },
  {
    n: 50,
    PLASTIQUE: { F1: 0.374, F2: 0.361, F3: 0.367 },
    ALUMINIUM: { F1: 0.361, F2: 0.348, F3: 0.354 },
  },
  {
    n: 100,
    PLASTIQUE: { F1: 0.369, F2: 0.362, F3: 0.366 },
    ALUMINIUM: { F1: 0.356, F2: 0.349, F3: 0.352 },
  },
]);

/** Bornes de validité de l'interpolation linéaire (MOTEUR-SOUS-PRESSION.md §10). */
export const N_INTERPOLATION_MINI = 5;
export const N_INTERPOLATION_MAXI = 100;

/** Lignes de la table, exposées en lecture seule pour les tests et l'aide. */
export function lignesChristiansen(): readonly LigneChristiansen[] {
  return TABLE;
}

/** Valeur tabulée exacte pour un `n` figurant dans la table, sinon `undefined`. */
export function valeurTabulee(
  n: number,
  materiau: CodeMateriauRampe,
  position: CodePositionPremierOrifice,
): number | null | undefined {
  const ligne = TABLE.find((element) => element.n === n);
  if (ligne === undefined) return undefined;
  return ligne[materiau][position];
}

/**
 * Encadre `n` par les deux lignes de la table utilisables pour interpoler
 * (celles dont la valeur n'est pas `n.d.`). Renvoie `null` si l'encadrement est
 * impossible — l'appelant doit alors refuser le calcul.
 */
export function encadrer(
  n: number,
  materiau: CodeMateriauRampe,
  position: CodePositionPremierOrifice,
): { bas: { n: number; f: number }; haut: { n: number; f: number } } | null {
  let bas: { n: number; f: number } | null = null;
  let haut: { n: number; f: number } | null = null;

  for (const ligne of TABLE) {
    const f = ligne[materiau][position];
    if (f === null) continue;
    if (ligne.n <= n) bas = { n: ligne.n, f };
    if (ligne.n >= n && haut === null) haut = { n: ligne.n, f };
  }

  if (bas === null || haut === null) return null;
  return { bas, haut };
}

export function listerMateriauxRampe(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(LIBELLES_MATERIAU_RAMPE) as CodeMateriauRampe[]).map((cle) => ({
    cle,
    libelle: LIBELLES_MATERIAU_RAMPE[cle],
  }));
}

export function listerPositionsOrifice(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(LIBELLES_POSITION_ORIFICE) as CodePositionPremierOrifice[]).map((cle) => ({
    cle,
    libelle: LIBELLES_POSITION_ORIFICE[cle],
  }));
}
