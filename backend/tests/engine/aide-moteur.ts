/**
 * Outillage commun aux tests du moteur de calcul.
 *
 * Trois choses y sont mutualisées :
 *
 *  1. **La comparaison aux valeurs de référence.** Les cas de test des
 *     spécifications sont les valeurs affichées par les classeurs Excel
 *     d'origine : elles sont donc arrondies — parfois même tronquées — au
 *     nombre de décimales affiché. On ne peut pas exiger d'un résultat qu'il
 *     soit plus proche de la référence que la précision à laquelle celle-ci a
 *     été publiée. `attendreReference` applique donc la tolérance relative de
 *     1e-6 demandée par les spécifications, **élargie au dernier rang affiché**
 *     quand ce rang est plus grossier. Chaque appel indique explicitement le
 *     nombre de décimales publiées : la précision de la référence reste lisible
 *     dans le test.
 *
 *  2. **La recherche de valeurs non finies** dans une arborescence de résultats.
 *
 *  3. **Un jeu d'entrées valides pour chaque module du registre**, réutilisé par
 *     les tests de robustesse et par le balayage générique. Ajouter un module au
 *     moteur sans ajouter son jeu d'entrées ici fait échouer un test : c'est
 *     voulu, c'est le filet qui protège les modules futurs.
 */

import { expect } from 'vitest';

import { ErreurCalcul, estErreurMoteur } from '../../src/engine/erreurs.js';

// ---------------------------------------------------------------------------
//  Comparaison aux valeurs de référence
// ---------------------------------------------------------------------------

/** Tolérance relative exigée par les spécifications (§ « Exigences de test »). */
export const TOLERANCE_RELATIVE = 1e-6;

function ecartAdmissible(attendu: number, decimalesAffichees?: number): number {
  const relative = Math.abs(attendu) * TOLERANCE_RELATIVE;
  if (decimalesAffichees === undefined) return Math.max(relative, Number.EPSILON * 8);
  // Un rang complet, et non un demi : les classeurs tronquent parfois au lieu
  // d'arrondir (1,1383175… y est affiché « 1,13831 »).
  return Math.max(relative, Math.pow(10, -decimalesAffichees));
}

/**
 * Compare un résultat du moteur à une valeur publiée par la spécification.
 *
 * @param decimalesAffichees Nombre de décimales avec lesquelles la valeur figure
 * dans le document de référence. À omettre lorsque la valeur est exacte (lecture
 * de table, entier, fraction exacte) : la tolérance vaut alors 1e-6 en relatif.
 */
export function attendreReference(
  obtenu: number,
  attendu: number,
  decimalesAffichees?: number,
): void {
  expect(Number.isFinite(obtenu), `valeur non finie : ${String(obtenu)}`).toBe(true);
  const admissible = ecartAdmissible(attendu, decimalesAffichees);
  const ecart = Math.abs(obtenu - attendu);
  expect(
    ecart <= admissible,
    `obtenu ${obtenu}, attendu ${attendu} (écart ${ecart.toExponential(3)} > ${admissible.toExponential(3)})`,
  ).toBe(true);
}

/**
 * Variante à tolérance imposée, pour les rares grandeurs dont l'incertitude ne
 * vient pas de leur propre affichage mais de celle d'une **entrée** arrondie.
 * La justification est obligatoire : elle est affichée en cas d'échec.
 */
export function attendreReferenceAvecTolerance(
  obtenu: number,
  attendu: number,
  tolerance: number,
  justification: string,
): void {
  const ecart = Math.abs(obtenu - attendu);
  expect(
    ecart <= tolerance,
    `obtenu ${obtenu}, attendu ${attendu} (écart ${ecart.toExponential(3)} > ${tolerance.toExponential(3)}) — ${justification}`,
  ).toBe(true);
}

// ---------------------------------------------------------------------------
//  Détection des valeurs non finies
// ---------------------------------------------------------------------------

/** Chemins de toutes les valeurs `NaN` ou `Infinity` d'une arborescence. */
export function feuillesNonFinies(valeur: unknown, chemin = ''): string[] {
  if (typeof valeur === 'number') {
    return Number.isFinite(valeur) ? [] : [`${chemin || '(racine)'} = ${String(valeur)}`];
  }
  if (Array.isArray(valeur)) {
    return valeur.flatMap((element, index) => feuillesNonFinies(element, `${chemin}[${index}]`));
  }
  if (valeur !== null && typeof valeur === 'object') {
    return Object.entries(valeur).flatMap(([cle, sousValeur]) =>
      feuillesNonFinies(sousValeur, `${chemin}.${cle}`),
    );
  }
  return [];
}

/** Exécute `action` et renvoie l'erreur moteur levée. Échoue si rien n'est levé. */
export function attraperErreurMoteur(action: () => unknown): ErreurCalcul {
  try {
    action();
  } catch (erreur) {
    if (!estErreurMoteur(erreur)) {
      throw new Error(`Une erreur non métier a été levée : ${String(erreur)}`);
    }
    return erreur;
  }
  throw new Error('Aucune erreur n’a été levée alors qu’une erreur métier était attendue.');
}

/**
 * Un message d'erreur du moteur s'adresse à un ingénieur agronome, en français.
 * Il ne doit contenir ni jargon de développeur, ni artefact d'exécution.
 */
export function attendreMessageMetierFrancais(erreur: ErreurCalcul): void {
  expect(erreur.message.length, `message trop court : « ${erreur.message} »`).toBeGreaterThan(12);
  // Aucun artefact d'exécution : « nulle » est français, `null` ne l'est pas.
  expect(erreur.message, `artefact technique dans « ${erreur.message} »`).not.toMatch(
    /\b(NaN|Infinity|undefined|null|TypeError|stack|object|Object)\b/,
  );
  // Aucun message par défaut de la bibliothèque de validation, qui est anglais.
  expect(erreur.message, `message non traduit : « ${erreur.message} »`).not.toMatch(
    /\b(Expected|Invalid|Required|received|Unrecognized|String|Number|Array)\b/,
  );
  expect(erreur.code).toMatch(/^[A-Z0-9_]+$/);
}

// ---------------------------------------------------------------------------
//  Calendriers de référence reconstitués
// ---------------------------------------------------------------------------

/**
 * ⚠️ **Reconstitution assumée.**
 *
 * MOTEUR-GRAVITAIRE.md §5 publie les *résultats* du cas de référence du module
 * `2_Besoins_eau` (At = 100 ha, 50 ha de maïs / 50 ha de coton, pointe de
 * 201,5 mm/mois en juillet sur 31 jours, BEnTotal = 619,8875 mm) mais **pas le
 * tableau climatique mensuel qui les produit** : il n'a pas été transmis avec la
 * spécification.
 *
 * Le calendrier ci-dessous a donc été reconstitué de façon à reproduire
 * **exactement** les deux valeurs publiées. Il n'a pas la prétention d'être le
 * climat du classeur d'origine : c'est un jeu de données cohérent qui permet de
 * vérifier la chaîne de calcul (pondération par les surfaces, plafonnement à 0,
 * recherche du mois de pointe, somme du cycle) contre les sorties de référence.
 *
 * Preuve de cohérence : ces valeurs alimentent ensuite `3_Nb_Irrig` et y
 * redonnent **également** les valeurs publiées (Ni = 15,497 ; ESP mini = 6,1538 j
 * en juillet ; IC = 5,1538 j), ce qui serait improbable si la reconstitution
 * était fantaisiste.
 *
 * La pluie efficace de juin (60,2975 mm) est la seule valeur ajustée pour
 * retomber exactement sur le total publié. **À remplacer par le tableau réel dès
 * que le classeur d'origine sera fourni.**
 */
export const CALENDRIER_GRAVITAIRE = {
  noms: [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ],
  jours: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  eto: [5.5, 6, 6.5, 7, 7, 6.8, 6.5, 6.2, 5.6, 5.4, 5.5, 5.2],
  pe: [0, 0, 0, 0, 0, 60.2975, 0, 40, 60, 10, 0, 0],
  kcMais: [0, 0, 0, 0, 0.4, 0.8, 1.15, 1.05, 0.6, 0, 0, 0],
  kcCoton: [0, 0, 0, 0, 0.35, 0.7, 0.85, 1.1, 0.75, 0.35, 0, 0],
} as const;

/** Entrées du module `2_Besoins_eau` gravitaire pour le cas de référence. */
export function entreesBesoinsEauGravitaireReference() {
  return {
    at: 100,
    irrigationLocalisee: false,
    cultures: [
      { nom: 'Maïs', surface: 50, kc: [...CALENDRIER_GRAVITAIRE.kcMais] },
      { nom: 'Cotonnier', surface: 50, kc: [...CALENDRIER_GRAVITAIRE.kcCoton] },
    ],
    mois: CALENDRIER_GRAVITAIRE.jours.map((jours, index) => ({
      nom: CALENDRIER_GRAVITAIRE.noms[index] as string,
      jours,
      eto: CALENDRIER_GRAVITAIRE.eto[index] as number,
      pe: CALENDRIER_GRAVITAIRE.pe[index] as number,
      perc: 0,
      r: 0,
    })),
  };
}

/**
 * ⚠️ **Reconstitution assumée**, même raison que ci-dessus.
 *
 * MOTEUR-SOUS-PRESSION.md §3 publie : At = 10 ha, tomate en goutte-à-goutte,
 * Kr = 0,85, pointe de 171,275 mm/mois au 4ᵉ mois de 31 jours, BEnTotal =
 * 507,80375 mm, et un mois de septembre à **Ben = −10 mm** (excédent de pluie).
 * Le calendrier mensuel n'a pas été transmis.
 *
 * La campagne est donc reconstituée d'avril à mars — ce qui place bien le 4ᵉ mois
 * en juillet (31 jours) et le mois excédentaire en septembre — de façon à
 * reproduire exactement la pointe, le −10 de septembre et le total du classeur.
 * La pluie efficace d'août (84,39825 mm) est la seule valeur ajustée.
 *
 * Le total publié (507,80375 mm) est ici celui **du classeur**, qui ne plafonne
 * pas les mois excédentaires : c'est donc `bEnTotalClasseur` qui doit le
 * retrouver, le total retenu pour le dimensionnement valant 10 mm de plus.
 */
export const CALENDRIER_SOUS_PRESSION = {
  noms: [
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
    'Janvier',
    'Février',
    'Mars',
  ],
  jours: [30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31],
  eto: [7, 7, 6.8, 6.5, 6.2, 5.5, 5, 5, 5, 5.5, 6, 6.5],
  kc: [0.45, 0.75, 1, 1, 0.85, 0.6, 0, 0, 0, 0, 0, 0],
  pe: [0, 0, 100, 0, 84.39825, 94.15, 0, 0, 0, 0, 0, 0],
} as const;

/** Entrées du module `2_Besoins_eau` sous pression pour le cas de référence. */
export function entreesBesoinsEauSousPressionReference() {
  return {
    at: 10,
    culture: 'TOMATE',
    irrigationLocalisee: true,
    kr: 0.85,
    ea: 90,
    mois: CALENDRIER_SOUS_PRESSION.jours.map((jours, index) => ({
      nom: CALENDRIER_SOUS_PRESSION.noms[index] as string,
      jours,
      eto: CALENDRIER_SOUS_PRESSION.eto[index] as number,
      kc: CALENDRIER_SOUS_PRESSION.kc[index] as number,
      pe: CALENDRIER_SOUS_PRESSION.pe[index] as number,
      perc: 0,
      r: 0,
    })),
  };
}

// ---------------------------------------------------------------------------
//  Jeu d'entrées valides, un par module du registre
// ---------------------------------------------------------------------------

const MOIS_CLIMAT_SIMPLE = Array.from({ length: 12 }, () => ({
  jours: 30,
  eto: 5,
  pe: 10,
  perc: 2,
  r: 0,
}));

/**
 * Une entrée valide par module, pour les tests de robustesse et le balayage
 * générique. La clé est le code du module dans le registre.
 */
export const ENTREES_VALIDES: Readonly<Record<string, Readonly<Record<string, unknown>>>> =
  Object.freeze({
    DOSES: {
      variante: 'GRAVITAIRE',
      culture: 'ARACHIDE',
      typeSol: 'LIMONEUX',
      p: 0.5,
      thetaCc: 0.3,
      thetaPf: 0.15,
      profondeurRacinaire: 90,
      sourceDnRetenue: 'TABLE',
      typeEfficience: 'Ea',
      valeurEfficience: 70,
    },
    BESOINS_EAU_GRAVITAIRE: entreesBesoinsEauGravitaireReference(),
    BESOINS_EAU_SOUS_PRESSION: entreesBesoinsEauSousPressionReference(),
    IRRIGATIONS_GRAVITAIRE: {
      dnRetenue: 40,
      bEnTotal: 619.8875,
      mois: MOIS_CLIMAT_SIMPLE.map((mois, index) => ({
        jours: mois.jours,
        besoinNetAssole: 100 + index,
      })),
    },
    IRRIGATIONS_SOUS_PRESSION: {
      dnRetenue: 40,
      bEnTotal: 507.80375,
      besoinNetDePointe: 171.275,
      joursMoisDePointe: 31,
    },
    CAPACITE_SYSTEME: {
      variante: 'GRAVITAIRE',
      at: 100,
      ic: 5.153846153846154,
      db: 57.142857142857146,
      t: 12,
      et: 0.9,
    },
    EFFICIENCES: { et: 90, eb: 90, ea: 70 },
    CANAL_MANNING: { qCible: 0.09, natureParoi: 'TERRE_LISSE', b: 0.3, m: 1, i: 0.001 },
    DFC_DMP: {
      qmPointe: 201.5,
      joursMoisDePointe: 31,
      epPourcent: 56.7,
      k: 1.2,
      mainDEau: 20,
      at: 100,
      bEnTotal: 619.8875,
      dnRetenue: 40,
    },
    ASPERSION: {
      dm: 24,
      classeVent: 'FAIBLE',
      q: 1400,
      ki: 15,
      qSystemeLitresParSeconde: 9.892657946803464,
      db: 44.44444444444444,
      t: 20,
      at: 10,
      ic: 6.239819004524886,
    },
    GOUTTE_A_GOUTTE: {
      sp: 0.4,
      sr: 1.2,
      ne: 1,
      qa: 4,
      dw: 0.6,
      climat: 'SEMI_ARIDE',
      qSystemeLitresParSeconde: 9.892657946803464,
      at: 10,
      db: 44.44444444444444,
    },
    RESEAU_HAZEN_WILLIAMS: {
      troncons: [
        {
          nom: 'Conduite principale',
          type: 'PRINCIPALE',
          materiau: 'PEHD',
          diametreMm: 63,
          debitLitresParSeconde: 5,
          longueurM: 100,
          nombreSorties: 0,
        },
      ],
    },
    POMPE_HMT: {
      hg: 15,
      pressionServiceBar: 1,
      deltaHLineaire: 4.5,
      pourcentSingulieres: 10,
      qM3ParSeconde: 0.0098927,
      rendement: 0.65,
    },
    COEFFICIENT_CHRISTIANSEN: { n: 20, materiau: 'PLASTIQUE', position: 'F1' },
  });

/** Entrée valide d'un module, copiée puis modifiée sur un champ. */
export function entreeModifiee(
  code: string,
  champ: string,
  valeur: unknown,
): Record<string, unknown> {
  const base = ENTREES_VALIDES[code];
  if (base === undefined) {
    throw new Error(`Aucun jeu d’entrées valides n’est défini pour le module « ${code} ».`);
  }
  return { ...base, [champ]: valeur };
}
