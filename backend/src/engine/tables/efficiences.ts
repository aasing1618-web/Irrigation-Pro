/**
 * Tables C, D, E et F du classeur gravitaire — efficiences.
 *
 * Source : MOTEUR-GRAVITAIRE.md §3.
 *
 * ⚠️ Ces valeurs ne quittent jamais le serveur (décision D-007). Les fonctions
 * `lister*` exposées ici ne renvoient que des couples `{ cle, libelle }`.
 */

/** Table C — efficience d'application Ea (%), FAO 1989. */
export const MethodeApplication = {
  SURFACE: 'SURFACE',
  ASPERSION: 'ASPERSION',
  GOUTTE_A_GOUTTE: 'GOUTTE_A_GOUTTE',
} as const;

export type CodeMethodeApplication =
  (typeof MethodeApplication)[keyof typeof MethodeApplication];

const TABLE_C: Readonly<Record<CodeMethodeApplication, { libelle: string; ea: number }>> =
  Object.freeze({
    SURFACE: { libelle: 'Irrigation de surface', ea: 60 },
    ASPERSION: { libelle: 'Irrigation par aspersion', ea: 75 },
    GOUTTE_A_GOUTTE: { libelle: 'Irrigation goutte à goutte', ea: 90 },
  });

/** Efficience d'application Ea (%) pour une méthode d'irrigation. */
export function efficienceApplication(methode: CodeMethodeApplication): number {
  return TABLE_C[methode].ea;
}

export function listerMethodesApplication(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(TABLE_C) as CodeMethodeApplication[]).map((cle) => ({
    cle,
    libelle: TABLE_C[cle].libelle,
  }));
}

/**
 * Table D — efficience au champ (%), irrigation de surface.
 * `moyenne = AVERAGE(mini, maxi)`, comme dans le classeur.
 */
export const TechniqueSurface = {
  RAIE_INCLINEE: 'RAIE_INCLINEE',
  RAIE_REUTILISATION: 'RAIE_REUTILISATION',
  RAIE_HORIZONTALE: 'RAIE_HORIZONTALE',
  PLANCHE: 'PLANCHE',
  BASSINS_PLATS: 'BASSINS_PLATS',
} as const;

export type CodeTechniqueSurface = (typeof TechniqueSurface)[keyof typeof TechniqueSurface];

const TABLE_D: Readonly<
  Record<CodeTechniqueSurface, { libelle: string; mini: number; maxi: number }>
> = Object.freeze({
  RAIE_INCLINEE: { libelle: 'Irrigation à la raie (inclinée)', mini: 50, maxi: 80 },
  RAIE_REUTILISATION: {
    libelle: 'Irrigation à la raie, réutilisation des eaux aval',
    mini: 60,
    maxi: 90,
  },
  RAIE_HORIZONTALE: { libelle: 'Irrigation à la raie (horizontale)', mini: 65, maxi: 95 },
  PLANCHE: { libelle: 'Irrigation par planche', mini: 50, maxi: 80 },
  BASSINS_PLATS: { libelle: 'Bassins plats', mini: 80, maxi: 95 },
});

/** Efficience au champ (%) — mini, maxi et moyenne. */
export function efficienceAuChamp(technique: CodeTechniqueSurface): {
  mini: number;
  maxi: number;
  moyenne: number;
} {
  const ligne = TABLE_D[technique];
  return { mini: ligne.mini, maxi: ligne.maxi, moyenne: (ligne.mini + ligne.maxi) / 2 };
}

export function listerTechniquesSurface(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(TABLE_D) as CodeTechniqueSurface[]).map((cle) => ({
    cle,
    libelle: TABLE_D[cle].libelle,
  }));
}

/** Table E — efficience de distribution Ed (%) = Et × Eb. */
export const LongueurCanal = {
  IMPORTANTE: 'IMPORTANTE',
  MOYENNE: 'MOYENNE',
  FAIBLE: 'FAIBLE',
} as const;

export type CodeLongueurCanal = (typeof LongueurCanal)[keyof typeof LongueurCanal];

export const RevetementCanal = {
  TERRE_SABLE: 'TERRE_SABLE',
  TERRE_LIMON: 'TERRE_LIMON',
  TERRE_ARGILE: 'TERRE_ARGILE',
  REVETU: 'REVETU',
} as const;

export type CodeRevetementCanal = (typeof RevetementCanal)[keyof typeof RevetementCanal];

export const LIBELLES_LONGUEUR_CANAL: Readonly<Record<CodeLongueurCanal, string>> =
  Object.freeze({
    IMPORTANTE: 'Longueur importante (> 2000 m)',
    MOYENNE: 'Longueur moyenne (200 à 2000 m)',
    FAIBLE: 'Longueur faible (< 200 m)',
  });

export const LIBELLES_REVETEMENT_CANAL: Readonly<Record<CodeRevetementCanal, string>> =
  Object.freeze({
    TERRE_SABLE: 'Canal en terre — sable',
    TERRE_LIMON: 'Canal en terre — limon',
    TERRE_ARGILE: 'Canal en terre — argile',
    REVETU: 'Canal revêtu',
  });

const TABLE_E: Readonly<
  Record<CodeLongueurCanal, Readonly<Record<CodeRevetementCanal, number>>>
> = Object.freeze({
  IMPORTANTE: Object.freeze({
    TERRE_SABLE: 60,
    TERRE_LIMON: 70,
    TERRE_ARGILE: 80,
    REVETU: 95,
  }),
  MOYENNE: Object.freeze({ TERRE_SABLE: 70, TERRE_LIMON: 75, TERRE_ARGILE: 85, REVETU: 95 }),
  FAIBLE: Object.freeze({ TERRE_SABLE: 80, TERRE_LIMON: 85, TERRE_ARGILE: 90, REVETU: 95 }),
});

/** Efficience de distribution Ed (%) selon longueur et revêtement du canal. */
export function efficienceDistribution(
  longueur: CodeLongueurCanal,
  revetement: CodeRevetementCanal,
): number {
  return TABLE_E[longueur][revetement];
}

export function listerLongueursCanal(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(LIBELLES_LONGUEUR_CANAL) as CodeLongueurCanal[]).map((cle) => ({
    cle,
    libelle: LIBELLES_LONGUEUR_CANAL[cle],
  }));
}

export function listerRevetementsCanal(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(LIBELLES_REVETEMENT_CANAL) as CodeRevetementCanal[]).map((cle) => ({
    cle,
    libelle: LIBELLES_REVETEMENT_CANAL[cle],
  }));
}

/** Table F — efficiences de référence pour le design (Hayde, 2006). */
export const CultureDesign = {
  RIZ: 'RIZ',
  CULTURES_SECHES: 'CULTURES_SECHES',
} as const;

export type CodeCultureDesign = (typeof CultureDesign)[keyof typeof CultureDesign];

const TABLE_F: Readonly<
  Record<CodeCultureDesign, { libelle: string; eiDesign: number; etDesign: number }>
> = Object.freeze({
  RIZ: { libelle: 'Riz', eiDesign: 90, etDesign: 95 },
  CULTURES_SECHES: { libelle: 'Cultures sèches', eiDesign: 80, etDesign: 95 },
});

/** Efficiences de référence pour le design (%). */
export function efficiencesDesign(culture: CodeCultureDesign): {
  eiDesign: number;
  etDesign: number;
} {
  const ligne = TABLE_F[culture];
  return { eiDesign: ligne.eiDesign, etDesign: ligne.etDesign };
}

export function listerCulturesDesign(): ReadonlyArray<{ cle: string; libelle: string }> {
  return (Object.keys(TABLE_F) as CodeCultureDesign[]).map((cle) => ({
    cle,
    libelle: TABLE_F[cle].libelle,
  }));
}
