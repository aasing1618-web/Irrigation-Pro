/**
 * Tables G, H, I et J du classeur gravitaire — canaux à surface libre.
 *
 * Source : MOTEUR-GRAVITAIRE.md §3.
 *
 * ⚠️ Le coefficient de Manning `n` est un coefficient métier : il ne sort
 * jamais du serveur (décision D-007). `listerNaturesParoi()` ne renvoie que des
 * couples `{ cle, libelle }`.
 */

/** Table G — main d'eau usuelle (l/s). */
export const MAINS_D_EAU_USUELLES: readonly number[] = Object.freeze([10, 15, 20, 25, 30]);

/**
 * Table H — pertes d'eau dans les canaux non revêtus (m³/m² de surface mouillée).
 *
 * ⚠️ MOTEUR-GRAVITAIRE.md §3, table H : **table documentaire seule**. Aucune
 * formule du classeur ne l'utilise. Elle est exposée comme aide à l'utilisateur
 * et ne doit être branchée dans aucun calcul.
 */
export const PERTES_CANAUX_NON_REVETUS: ReadonlyArray<
  Readonly<{ cle: string; libelle: string; mini: number; maxi: number }>
> = Object.freeze([
  {
    cle: 'ARGILO_LIMONEUX_IMPERMEABLES',
    libelle: 'Argilo-limoneux imperméables',
    mini: 0.07,
    maxi: 0.1,
  },
  {
    cle: 'ARGILO_LIMONEUX_VASEUX',
    libelle: 'Argilo-limoneux, sols vaseux',
    mini: 0.15,
    maxi: 0.23,
  },
  { cle: 'SABLE_LIMONEUX', libelle: 'Sable limoneux', mini: 0.3, maxi: 0.45 },
  { cle: 'SABLEUX', libelle: 'Sols sableux', mini: 0.45, maxi: 0.55 },
  { cle: 'SABLEUX_GRAVELEUX', libelle: 'Sols sableux graveleux', mini: 0.55, maxi: 0.75 },
  { cle: 'CAILLOUTEUX_PERMEABLES', libelle: 'Sols caillouteux perméables', mini: 0.75, maxi: 0.9 },
]);

/**
 * Table I — coefficient de rugosité de Manning `n` (engineeringtoolbox.com).
 * `Ks (Strickler) = 1 / n`.
 */
const TABLE_I: ReadonlyArray<Readonly<{ cle: string; libelle: string; n: number }>> =
  Object.freeze([
    { cle: 'BETON_FINI', libelle: 'Béton (ciment) — fini', n: 0.012 },
    { cle: 'BETON_COFFRAGE_ACIER', libelle: 'Béton — coffrages en acier', n: 0.011 },
    { cle: 'BETON_COFFRAGE_BOIS', libelle: 'Béton — coffrages en bois', n: 0.015 },
    { cle: 'BETON_CENTRIFUGE', libelle: 'Béton — centrifugé', n: 0.013 },
    { cle: 'TERRE_GRAVELEUX', libelle: 'Canal de terre — graveleux', n: 0.025 },
    { cle: 'TERRE_MAUVAISES_HERBES', libelle: 'Canal de terre — avec mauvaises herbes', n: 0.03 },
    { cle: 'TERRE_PIERREUX', libelle: 'Canal de terre — pierreux, galets', n: 0.035 },
    { cle: 'TERRE_LISSE', libelle: 'Terre, lisse', n: 0.018 },
    { cle: 'METAL_ONDULE', libelle: 'Métal ondulé', n: 0.022 },
    { cle: 'FONTE_NEUVE', libelle: 'Fonte / fonte ductile, neuve', n: 0.012 },
    { cle: 'MACONNERIE', libelle: 'Maçonnerie', n: 0.025 },
    { cle: 'MACONNERIE_MOELLONS', libelle: 'Maçonnerie de moellons', n: 0.02 },
    { cle: 'ACIER_LISSE', libelle: 'Acier lisse', n: 0.012 },
    { cle: 'ACIER_NEUF_NON_REVETU', libelle: 'Acier neuf non revêtu', n: 0.011 },
    { cle: 'ACIER_RIVETE', libelle: 'Acier riveté', n: 0.019 },
    { cle: 'PVC_LISSE', libelle: 'PVC — parois lisses', n: 0.01 },
    { cle: 'PEHD_ONDULE_LISSE', libelle: 'PEHD — ondulé, parois lisses', n: 0.012 },
    { cle: 'PEHD_ONDULE_ONDULE', libelle: 'PEHD — ondulé, parois ondulées', n: 0.021 },
    { cle: 'BOIS_RABOTE', libelle: 'Bois raboté', n: 0.012 },
    { cle: 'BOIS_NON_RABOTE', libelle: 'Bois non raboté', n: 0.013 },
    { cle: 'NATUREL_PROPRE_DROIT', libelle: 'Cours d’eau naturels propres et droits', n: 0.03 },
    { cle: 'NATUREL_GRANDES_RIVIERES', libelle: 'Cours d’eau naturels — grandes rivières', n: 0.035 },
    { cle: 'NATUREL_TRES_MAUVAIS_ETAT', libelle: 'Canaux naturels en très mauvais état', n: 0.06 },
  ]);

const INDEX_PAROIS = new Map(TABLE_I.map((ligne) => [ligne.cle, ligne]));

/** Valeur de repli si le matériau n'est pas trouvé (MOTEUR-GRAVITAIRE.md §3). */
export const N_MANNING_PAR_DEFAUT = 0.014;

/**
 * Coefficient de Manning `n` d'une nature de paroi.
 * Renvoie `N_MANNING_PAR_DEFAUT` si la paroi est inconnue, comme le classeur.
 */
export function coefficientManning(cle: string): number {
  return INDEX_PAROIS.get(cle)?.n ?? N_MANNING_PAR_DEFAUT;
}

/** `true` si la nature de paroi figure bien dans la table I. */
export function estParoiConnue(cle: string): boolean {
  return INDEX_PAROIS.has(cle);
}

export function listerNaturesParoi(): ReadonlyArray<{ cle: string; libelle: string }> {
  return TABLE_I.map(({ cle, libelle }) => ({ cle, libelle }));
}

/**
 * Table J — pente longitudinale recommandée (Savva et Frenken, 2002).
 * Le classement se fait sur le débit cible, en m³/s.
 */
export interface ClassementCanal {
  readonly taille: string;
  readonly penteRecommandee: string;
}

export function classerCanal(qCibleM3ParSeconde: number): ClassementCanal {
  if (qCibleM3ParSeconde > 15) {
    return { taille: 'Gros canal', penteRecommandee: '0,1 – 0,2 ‰' };
  }
  if (qCibleM3ParSeconde >= 0.3) {
    return { taille: 'Canal intermédiaire', penteRecommandee: '0,2 – 0,3 ‰' };
  }
  return { taille: 'Petit canal d’approvisionnement', penteRecommandee: '0,3 – 0,4 ‰' };
}

/** Pente maximale à ne jamais dépasser : 1:300 = 0,33 %. */
export const PENTE_MAXIMALE = 1 / 300;

/** Vitesse visée dans un canal : entre 0,3 et 1 m/s (érosion / dépôt). */
export const VITESSE_CANAL_MINI = 0.3;
export const VITESSE_CANAL_MAXI = 1;
