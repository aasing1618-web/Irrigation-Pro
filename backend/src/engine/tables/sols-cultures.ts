/**
 * Tables A et B — dose nette par sol × enracinement, et classification des
 * cultures par profondeur racinaire.
 *
 * Source : MOTEUR-GRAVITAIRE.md §3, tables A et B (classeur
 * `Boite_a_outils_Irrigation.xlsx`, cours *Systèmes d'irrigation*, B. FAYE).
 *
 * Le classeur « sous pression » reprend les **mêmes valeurs** avec une liste de
 * cultures réduite à 30 entrées (MOTEUR-SOUS-PRESSION.md §1). La spécification
 * autorise explicitement à n'entretenir qu'une seule liste, la complète : c'est
 * ce qui est fait ici.
 *
 * ⚠️ Constantes de l'application : jamais modifiables par l'utilisateur, et
 * jamais transmises à l'application cliente (décision D-007). Seuls les couples
 * `{ cle, libelle }` sortent du serveur.
 */

/** Catégories d'enracinement de la table A. */
export const CategorieEnracinement = {
  PEU_PROFOND: 'PEU_PROFOND',
  MOYEN: 'MOYEN',
  PROFOND: 'PROFOND',
} as const;

export type CodeCategorieEnracinement =
  (typeof CategorieEnracinement)[keyof typeof CategorieEnracinement];

export const LIBELLES_ENRACINEMENT: Readonly<Record<CodeCategorieEnracinement, string>> =
  Object.freeze({
    PEU_PROFOND: 'Peu profond (30-60 cm)',
    MOYEN: 'Moyen (50-100 cm)',
    PROFOND: 'Profond (90-150 cm)',
  });

/** Types de sol de la table A. */
export const TypeSol = {
  SABLEUX: 'SABLEUX',
  LIMONEUX: 'LIMONEUX',
  ARGILEUX: 'ARGILEUX',
} as const;

export type CodeTypeSol = (typeof TypeSol)[keyof typeof TypeSol];

export const LIBELLES_TYPE_SOL: Readonly<Record<CodeTypeSol, string>> = Object.freeze({
  SABLEUX: 'Sols peu profonds / sableux',
  LIMONEUX: 'Sols limoneux',
  ARGILEUX: 'Sols argileux',
});

/**
 * Table A — dose nette Dn (mm) selon le type de sol et l'enracinement.
 * MOTEUR-GRAVITAIRE.md §3, table A.
 */
const TABLE_A: Readonly<
  Record<CodeTypeSol, Readonly<Record<CodeCategorieEnracinement, number>>>
> = Object.freeze({
  SABLEUX: Object.freeze({ PEU_PROFOND: 15, MOYEN: 30, PROFOND: 40 }),
  LIMONEUX: Object.freeze({ PEU_PROFOND: 20, MOYEN: 40, PROFOND: 60 }),
  ARGILEUX: Object.freeze({ PEU_PROFOND: 30, MOYEN: 50, PROFOND: 70 }),
});

/** Dose nette suggérée (mm) par la table A. */
export function doseNetteTableA(
  typeSol: CodeTypeSol,
  categorie: CodeCategorieEnracinement,
): number {
  return TABLE_A[typeSol][categorie];
}

/**
 * Table B — classification des 41 cultures du classeur par enracinement.
 * MOTEUR-GRAVITAIRE.md §3, table B.
 */
const TABLE_B: ReadonlyArray<
  Readonly<{ cle: string; libelle: string; categorie: CodeCategorieEnracinement }>
> = Object.freeze([
  // --- Peu profond (30-60 cm) — 8 entrées
  { cle: 'CHOU', libelle: 'Chou / chou-fleur', categorie: 'PEU_PROFOND' },
  { cle: 'CELERI', libelle: 'Céleri', categorie: 'PEU_PROFOND' },
  { cle: 'LAITUE', libelle: 'Laitue', categorie: 'PEU_PROFOND' },
  { cle: 'OIGNON', libelle: 'Oignon', categorie: 'PEU_PROFOND' },
  { cle: 'ANANAS', libelle: 'Ananas', categorie: 'PEU_PROFOND' },
  { cle: 'POMME_DE_TERRE', libelle: 'Pomme de terre', categorie: 'PEU_PROFOND' },
  { cle: 'EPINARDS', libelle: 'Épinards', categorie: 'PEU_PROFOND' },
  {
    cle: 'LEGUMES_GENERAL',
    libelle: 'Légumes (général, sauf betterave / carotte / concombre)',
    categorie: 'PEU_PROFOND',
  },

  // --- Moyen (50-100 cm) — 17 entrées
  { cle: 'BANANIER', libelle: 'Bananier', categorie: 'MOYEN' },
  { cle: 'HARICOTS', libelle: 'Haricots', categorie: 'MOYEN' },
  { cle: 'BETTERAVE', libelle: 'Betterave', categorie: 'MOYEN' },
  { cle: 'CAROTTE', libelle: 'Carotte', categorie: 'MOYEN' },
  { cle: 'TREFLE', libelle: 'Trèfle', categorie: 'MOYEN' },
  { cle: 'CACAO', libelle: 'Cacao', categorie: 'MOYEN' },
  { cle: 'CONCOMBRE', libelle: 'Concombre', categorie: 'MOYEN' },
  { cle: 'ARACHIDE', libelle: 'Arachide', categorie: 'MOYEN' },
  { cle: 'PALMIER', libelle: 'Palmier', categorie: 'MOYEN' },
  { cle: 'POIS', libelle: 'Pois', categorie: 'MOYEN' },
  { cle: 'POIVRIER', libelle: 'Poivrier', categorie: 'MOYEN' },
  { cle: 'SISAL', libelle: 'Sisal (agave)', categorie: 'MOYEN' },
  { cle: 'SOJA', libelle: 'Soja', categorie: 'MOYEN' },
  { cle: 'BETTERAVE_SUCRIERE', libelle: 'Betterave sucrière', categorie: 'MOYEN' },
  { cle: 'TOURNESOL', libelle: 'Tournesol', categorie: 'MOYEN' },
  { cle: 'TABAC', libelle: 'Tabac', categorie: 'MOYEN' },
  { cle: 'TOMATE', libelle: 'Tomate', categorie: 'MOYEN' },

  // --- Profond (90-150 cm) — 16 entrées
  { cle: 'LUZERNE', libelle: 'Luzerne', categorie: 'PROFOND' },
  { cle: 'AVOINE', libelle: 'Avoine', categorie: 'PROFOND' },
  { cle: 'AGRUMES', libelle: 'Agrumes', categorie: 'PROFOND' },
  { cle: 'COTONNIER', libelle: 'Cotonnier', categorie: 'PROFOND' },
  { cle: 'DATTIER', libelle: 'Dattier', categorie: 'PROFOND' },
  { cle: 'VERGERS_CADUCIFOLIES', libelle: 'Vergers caducifoliés', categorie: 'PROFOND' },
  { cle: 'LIN', libelle: 'Lin', categorie: 'PROFOND' },
  { cle: 'VIGNE', libelle: 'Vigne', categorie: 'PROFOND' },
  { cle: 'MAIS', libelle: 'Maïs', categorie: 'PROFOND' },
  { cle: 'MELON', libelle: 'Melon', categorie: 'PROFOND' },
  { cle: 'OLIVIER', libelle: 'Olivier', categorie: 'PROFOND' },
  { cle: 'CARTHAME', libelle: 'Carthame', categorie: 'PROFOND' },
  { cle: 'SORGHO', libelle: 'Sorgho', categorie: 'PROFOND' },
  { cle: 'CANNE_A_SUCRE', libelle: 'Canne à sucre', categorie: 'PROFOND' },
  { cle: 'PATATE_DOUCE', libelle: 'Patate douce', categorie: 'PROFOND' },
  { cle: 'BLE', libelle: 'Blé', categorie: 'PROFOND' },
]);

const INDEX_CULTURES = new Map(TABLE_B.map((entree) => [entree.cle, entree]));

/** Liste des cultures, pour une liste déroulante. Sans aucun coefficient. */
export function listerCultures(): ReadonlyArray<{ cle: string; libelle: string }> {
  return TABLE_B.map(({ cle, libelle }) => ({ cle, libelle }));
}

/** Liste des types de sol, pour une liste déroulante. */
export function listerTypesSol(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(LIBELLES_TYPE_SOL) as CodeTypeSol[]).map((cle) => ({
    cle,
    libelle: LIBELLES_TYPE_SOL[cle],
  }));
}

/** Codes de culture reconnus. */
export function estCultureConnue(cle: string): boolean {
  return INDEX_CULTURES.has(cle);
}

/**
 * Catégorie d'enracinement d'une culture (table B).
 * Renvoie `null` si la culture est inconnue — le classeur affiche « - ».
 */
export function categorieEnracinement(cle: string): CodeCategorieEnracinement | null {
  return INDEX_CULTURES.get(cle)?.categorie ?? null;
}

/** Nombre d'entrées de la table B — vérifié par les tests (41 attendues). */
export const NOMBRE_CULTURES = TABLE_B.length;
