/**
 * Tables C, D, E, F, G, H, I et L du classeur « sous pression ».
 *
 * Source : MOTEUR-SOUS-PRESSION.md §1.
 *
 * ⚠️ Les coefficients (Ea, C de Hazen-Williams, % de Dm…) ne sortent jamais du
 * serveur (décision D-007) : seules les listes `{ cle, libelle }` sont exposées.
 */

/** Table L — conversion pression. 1 bar = 10,19 mCE. Constante centralisée. */
export const METRES_COLONNE_EAU_PAR_BAR = 10.19;

/** Table C — efficience d'application Ea (%), FAO 1989, sous pression. */
export const MethodeSousPression = {
  ASPERSION: 'ASPERSION',
  GOUTTE_A_GOUTTE: 'GOUTTE_A_GOUTTE',
} as const;

export type CodeMethodeSousPression =
  (typeof MethodeSousPression)[keyof typeof MethodeSousPression];

const TABLE_C: Readonly<Record<CodeMethodeSousPression, { libelle: string; ea: number }>> =
  Object.freeze({
    ASPERSION: { libelle: 'Aspersion', ea: 75 },
    GOUTTE_A_GOUTTE: { libelle: 'Goutte-à-goutte', ea: 90 },
  });

/** Efficience d'application Ea (%) sous pression. */
export function efficienceApplicationSousPression(methode: CodeMethodeSousPression): number {
  return TABLE_C[methode].ea;
}

export function listerMethodesSousPression(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(TABLE_C) as CodeMethodeSousPression[]).map((cle) => ({
    cle,
    libelle: TABLE_C[cle].libelle,
  }));
}

/**
 * Table D — espacement des arroseurs, en fraction du diamètre mouillé Dm,
 * selon la classe de vent (FAO I&D 8, Vermeiren & Jobling, 1980).
 */
export const ClasseVent = {
  CALME: 'CALME',
  FAIBLE: 'FAIBLE',
  MODERE: 'MODERE',
  FORT: 'FORT',
} as const;

export type CodeClasseVent = (typeof ClasseVent)[keyof typeof ClasseVent];

const TABLE_D: Readonly<Record<CodeClasseVent, { libelle: string; fractionDm: number }>> =
  Object.freeze({
    CALME: { libelle: 'Calme (< 2 m/s)', fractionDm: 0.65 },
    FAIBLE: { libelle: 'Faible (2 à 4 m/s)', fractionDm: 0.6 },
    MODERE: { libelle: 'Modéré (4 à 6 m/s)', fractionDm: 0.5 },
    FORT: { libelle: 'Fort (> 6 m/s)', fractionDm: 0.3 },
  });

/** Fraction du diamètre mouillé à retenir comme espacement (Se = Sl). */
export function fractionDiametreMouille(classe: CodeClasseVent): number {
  return TABLE_D[classe].fractionDm;
}

export function listerClassesVent(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(TABLE_D) as CodeClasseVent[]).map((cle) => ({
    cle,
    libelle: TABLE_D[cle].libelle,
  }));
}

/** Table E — coefficient de Hazen-Williams C. */
export const MateriauConduite = {
  PVC: 'PVC',
  PEHD: 'PEHD',
  ALUMINIUM_NEUF: 'ALUMINIUM_NEUF',
  ALUMINIUM_USAGE: 'ALUMINIUM_USAGE',
  ACIER_GALVANISE: 'ACIER_GALVANISE',
  FONTE: 'FONTE',
  BETON: 'BETON',
  AMIANTE_CIMENT: 'AMIANTE_CIMENT',
} as const;

export type CodeMateriauConduite = (typeof MateriauConduite)[keyof typeof MateriauConduite];

const TABLE_E: Readonly<Record<CodeMateriauConduite, { libelle: string; c: number }>> =
  Object.freeze({
    PVC: { libelle: 'PVC', c: 150 },
    PEHD: { libelle: 'PEHD (polyéthylène)', c: 140 },
    ALUMINIUM_NEUF: { libelle: 'Aluminium neuf', c: 120 },
    ALUMINIUM_USAGE: { libelle: 'Aluminium usagé', c: 100 },
    ACIER_GALVANISE: { libelle: 'Acier galvanisé', c: 100 },
    FONTE: { libelle: 'Fonte', c: 130 },
    BETON: { libelle: 'Béton', c: 130 },
    AMIANTE_CIMENT: { libelle: 'Amiante-ciment', c: 140 },
  });

/** Coefficient C de Hazen-Williams pour un matériau de conduite. */
export function coefficientHazenWilliams(materiau: CodeMateriauConduite): number {
  return TABLE_E[materiau].c;
}

export function estMateriauConduiteConnu(cle: string): cle is CodeMateriauConduite {
  return Object.hasOwn(TABLE_E, cle);
}

export function listerMateriauxConduite(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(TABLE_E) as CodeMateriauConduite[]).map((cle) => ({
    cle,
    libelle: TABLE_E[cle].libelle,
  }));
}

/**
 * Table F — débits usuels de goutteurs (l/h), tous donnés à une pression de
 * service de 1 bar ≈ 10 mCE (goutteurs **non autorégulants**).
 */
export const DEBITS_GOUTTEURS_USUELS: readonly number[] = Object.freeze([2, 4, 8, 16]);

/** Pression de service de référence des goutteurs de la table F, en bar. */
export const PRESSION_SERVICE_GOUTTEUR_BAR = 1;

/** Table G — vitesse admissible dans les conduites (m/s). */
export const TypeConduite = {
  PRINCIPALE: 'PRINCIPALE',
  SECONDAIRE: 'SECONDAIRE',
  PORTE_RAMPE: 'PORTE_RAMPE',
  RAMPE: 'RAMPE',
  REFOULEMENT: 'REFOULEMENT',
} as const;

export type CodeTypeConduite = (typeof TypeConduite)[keyof typeof TypeConduite];

const TABLE_G: Readonly<
  Record<CodeTypeConduite, { libelle: string; mini: number; maxi: number }>
> = Object.freeze({
  PRINCIPALE: { libelle: 'Conduite principale', mini: 0.5, maxi: 1.5 },
  SECONDAIRE: { libelle: 'Conduite secondaire', mini: 0.5, maxi: 1.5 },
  // Le porte-rampe distribue vers les rampes : il est assimilé, dans la table G
  // du classeur, à une conduite secondaire (même plage 0,5 – 1,5 m/s).
  PORTE_RAMPE: { libelle: 'Porte-rampe', mini: 0.5, maxi: 1.5 },
  RAMPE: { libelle: 'Rampe (porte-arroseurs / porte-goutteurs)', mini: 0.3, maxi: 1 },
  REFOULEMENT: { libelle: 'Conduite de refoulement (sortie pompe)', mini: 1, maxi: 2.5 },
});

/** Plage de vitesse admissible (m/s) pour un type de conduite. */
export function plageVitesse(type: CodeTypeConduite): { mini: number; maxi: number; libelle: string } {
  const ligne = TABLE_G[type];
  return { mini: ligne.mini, maxi: ligne.maxi, libelle: ligne.libelle };
}

export function listerTypesConduite(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(TABLE_G) as CodeTypeConduite[]).map((cle) => ({
    cle,
    libelle: TABLE_G[cle].libelle,
  }));
}

/** Table H — diamètres intérieurs commerciaux (PVC/PE), en mm. */
export const DIAMETRES_COMMERCIAUX_MM: readonly number[] = Object.freeze([
  16, 20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 200,
]);

/** Diamètre commercial immédiatement supérieur ou égal. `null` si hors table. */
export function diametreCommercialSuperieur(diametreMm: number): number | null {
  for (const diametre of DIAMETRES_COMMERCIAUX_MM) {
    if (diametre >= diametreMm) return diametre;
  }
  return null;
}

/**
 * Table I — surface mouillée minimale recommandée en goutte-à-goutte
 * (FAO I&D 24, Doorenbos & Pruitt, 1977), en %.
 */
export const Climat = {
  HUMIDE: 'HUMIDE',
  SEMI_ARIDE: 'SEMI_ARIDE',
  ARIDE: 'ARIDE',
} as const;

export type CodeClimat = (typeof Climat)[keyof typeof Climat];

const TABLE_I: Readonly<Record<CodeClimat, { libelle: string; pourcentMini: number }>> =
  Object.freeze({
    HUMIDE: { libelle: 'Humide', pourcentMini: 25 },
    SEMI_ARIDE: { libelle: 'Semi-aride', pourcentMini: 40 },
    ARIDE: { libelle: 'Aride', pourcentMini: 60 },
  });

/** Surface mouillée minimale recommandée (%) selon le climat. */
export function surfaceMouilleeMinimale(climat: CodeClimat): number {
  return TABLE_I[climat].pourcentMini;
}

export function listerClimats(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(TABLE_I) as CodeClimat[]).map((cle) => ({
    cle,
    libelle: TABLE_I[cle].libelle,
  }));
}
