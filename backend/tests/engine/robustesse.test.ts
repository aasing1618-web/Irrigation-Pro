/**
 * Robustesse des modules de calcul.
 *
 * Exigence commune aux deux spécifications (§ « Exigences de test ») : pour
 * chaque module, tester les entrées nulles ou négatives, les valeurs hors plage
 * (efficience > 100 %, `p` hors [0, 1]) et les divisions par zéro
 * (`Sp × Sr = 0`, `q = 0`, `η = 0`, `IC = 0`, diamètre ou débit nul).
 *
 * **Aucune formule ne doit produire `NaN` ou `Infinity`** : elle renvoie une
 * erreur métier explicite, en français, destinée à un ingénieur agronome.
 *
 * Deux catégories d'erreur sont attendues, et le test vérifie laquelle :
 *  - `VALIDATION` (→ HTTP 400) : la saisie est invalide ;
 *  - `CALCUL_IMPOSSIBLE` (→ HTTP 422) : la saisie est formellement acceptable
 *    mais le calcul n'a pas de sens physique.
 */

import { describe, expect, it } from 'vitest';

import { CategorieErreur, estErreurMoteur } from '../../src/engine/erreurs.js';
import { calculerDoses } from '../../src/engine/commun/doses.js';
import {
  calculerBesoinsEauGravitaire,
  calculerBesoinsEauSousPression,
} from '../../src/engine/commun/besoins-eau.js';
import {
  calculerIrrigationsGravitaire,
  calculerIrrigationsSousPression,
} from '../../src/engine/commun/irrigations.js';
import { calculerCapacite } from '../../src/engine/commun/capacite.js';
import { calculerEfficiences } from '../../src/engine/commun/efficiences.js';
import { calculerCanalManning } from '../../src/engine/gravitaire/canaux-manning.js';
import { calculerDfcDmp } from '../../src/engine/gravitaire/dfc-dmp.js';
import { calculerAspersion } from '../../src/engine/sous-pression/aspersion.js';
import { calculerGoutteAGoutte } from '../../src/engine/sous-pression/goutte-a-goutte.js';
import { calculerReseauHazenWilliams } from '../../src/engine/sous-pression/hazen-williams.js';
import { calculerPompe } from '../../src/engine/sous-pression/pompe.js';
import { calculerChristiansen } from '../../src/engine/sous-pression/christiansen.js';

import {
  ENTREES_VALIDES,
  attendreMessageMetierFrancais,
  attendreReference,
  attraperErreurMoteur,
  entreeModifiee,
  feuillesNonFinies,
} from './aide-moteur.js';

/** Vérifie qu'une entrée fautive produit bien une erreur métier de la bonne catégorie. */
function attendreRefus(
  code: string,
  champ: string,
  valeur: unknown,
  categorie: string = CategorieErreur.VALIDATION,
): void {
  const calculer = FONCTIONS[code];
  if (calculer === undefined) throw new Error(`Module inconnu : ${code}`);
  const erreur = attraperErreurMoteur(() => calculer(entreeModifiee(code, champ, valeur)));
  attendreMessageMetierFrancais(erreur);
  expect(
    erreur.categorie,
    `${code}.${champ} = ${String(valeur)} : catégorie ${erreur.categorie} (${erreur.code})`,
  ).toBe(categorie);
}

const FONCTIONS: Readonly<Record<string, (entree: unknown) => { resultats: unknown }>> =
  Object.freeze({
    DOSES: calculerDoses,
    BESOINS_EAU_GRAVITAIRE: calculerBesoinsEauGravitaire,
    BESOINS_EAU_SOUS_PRESSION: calculerBesoinsEauSousPression,
    IRRIGATIONS_GRAVITAIRE: calculerIrrigationsGravitaire,
    IRRIGATIONS_SOUS_PRESSION: calculerIrrigationsSousPression,
    CAPACITE_SYSTEME: calculerCapacite,
    EFFICIENCES: calculerEfficiences,
    CANAL_MANNING: calculerCanalManning,
    DFC_DMP: calculerDfcDmp,
    ASPERSION: calculerAspersion,
    GOUTTE_A_GOUTTE: calculerGoutteAGoutte,
    RESEAU_HAZEN_WILLIAMS: calculerReseauHazenWilliams,
    POMPE_HMT: calculerPompe,
    COEFFICIENT_CHRISTIANSEN: calculerChristiansen,
  });

// ===========================================================================

describe('1_Doses — robustesse', () => {
  it('refuse une efficience nulle, négative ou supérieure à 100 %', () => {
    for (const valeur of [0, -10, 100.1, 150]) {
      attendreRefus('DOSES', 'valeurEfficience', valeur);
    }
    // 100 % reste admis : c'est la borne haute physique.
    expect(calculerDoses(entreeModifiee('DOSES', 'valeurEfficience', 100)).resultats.db).toBe(40);
  });

  it('refuse un facteur de tarissement hors de [0, 1]', () => {
    for (const valeur of [-0.1, 1.5, 2]) {
      attendreRefus('DOSES', 'p', valeur);
    }
  });

  it('avertit — sans refuser — quand p sort de la plage usuelle FAO 56', () => {
    const resultat = calculerDoses(entreeModifiee('DOSES', 'p', 0.9));
    expect(resultat.avertissements.map((a) => a.code)).toContain('P_HORS_PLAGE_USUELLE');
  });

  it('refuse une profondeur racinaire ou des humidités négatives', () => {
    attendreRefus('DOSES', 'profondeurRacinaire', -10);
    attendreRefus('DOSES', 'thetaCc', -0.1);
    attendreRefus('DOSES', 'thetaPf', -0.1);
  });

  it('refuse une réserve utile nulle ou négative (θcc ≤ θpf)', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerDoses(entreeModifiee('DOSES', 'thetaCc', 0.15)),
    );
    expect(erreur.code).toBe('RESERVE_UTILE_NULLE');
    attendreMessageMetierFrancais(erreur);
  });

  it('refuse de deviner l’efficience quand elle manque', () => {
    const gravitaire = attraperErreurMoteur(() =>
      calculerDoses({ variante: 'GRAVITAIRE', culture: 'ARACHIDE', typeSol: 'LIMONEUX' }),
    );
    expect(gravitaire.code).toBe('EFFICIENCE_MANQUANTE');

    const sousPression = attraperErreurMoteur(() =>
      calculerDoses({ variante: 'SOUS_PRESSION', culture: 'ARACHIDE', typeSol: 'LIMONEUX' }),
    );
    expect(sousPression.code).toBe('EFFICIENCE_MANQUANTE');
    expect(sousPression.message).toMatch(/aspersion|goutte/i);
  });

  it('refuse une dose nette par table impossible à lire, plutôt que d’en inventer une', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerDoses({ variante: 'GRAVITAIRE', typeSol: 'LIMONEUX', valeurEfficience: 70 }),
    );
    expect(erreur.code).toBe('METHODE_A_INCOMPLETE');
  });

  it('signale une culture inconnue sans planter', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerDoses({
        variante: 'GRAVITAIRE',
        culture: 'QUINOA_MARTIEN',
        typeSol: 'LIMONEUX',
        valeurEfficience: 70,
      }),
    );
    expect(erreur.code).toBe('METHODE_A_INCOMPLETE');
  });

  it('refuse une méthode détaillée incomplète', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerDoses({
        variante: 'GRAVITAIRE',
        sourceDnRetenue: 'FORMULE',
        p: 0.5,
        valeurEfficience: 70,
      }),
    );
    expect(erreur.code).toBe('METHODE_B_INCOMPLETE');
  });
});

describe('2_Besoins_eau — robustesse', () => {
  it('refuse une superficie totale nulle ou négative', () => {
    for (const valeur of [0, -1]) {
      attendreRefus('BESOINS_EAU_GRAVITAIRE', 'at', valeur);
      attendreRefus('BESOINS_EAU_SOUS_PRESSION', 'at', valeur);
    }
  });

  it('refuse des surfaces cultivées toutes nulles', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerBesoinsEauGravitaire(
        entreeModifiee('BESOINS_EAU_GRAVITAIRE', 'cultures', [
          { nom: 'Maïs', surface: 0, kc: Array.from({ length: 12 }, () => 1) },
        ]),
      ),
    );
    expect(erreur.code).toBe('SURFACES_NULLES');
    expect(erreur.categorie).toBe(CategorieErreur.CALCUL_IMPOSSIBLE);
    attendreMessageMetierFrancais(erreur);
  });

  it('refuse un calendrier qui ne compte pas 12 mois', () => {
    for (const nombre of [0, 11, 13]) {
      attendreRefus(
        'BESOINS_EAU_GRAVITAIRE',
        'mois',
        Array.from({ length: nombre }, () => ({ jours: 30, eto: 5, pe: 0, perc: 0, r: 0 })),
      );
    }
  });

  it('refuse des données climatiques négatives', () => {
    const moisFautif = Array.from({ length: 12 }, () => ({
      jours: 30,
      eto: -1,
      pe: 0,
      perc: 0,
      r: 0,
    }));
    attendreRefus('BESOINS_EAU_GRAVITAIRE', 'mois', moisFautif);
    attendreRefus('BESOINS_EAU_GRAVITAIRE', 'mois', [
      ...moisFautif.slice(1).map((mois) => ({ ...mois, eto: 5 })),
      { jours: 40, eto: 5, pe: 0, perc: 0, r: 0 },
    ]);
  });

  it('refuse une efficience d’application nulle ou hors plage (sous pression)', () => {
    for (const valeur of [0, -5, 101]) {
      attendreRefus('BESOINS_EAU_SOUS_PRESSION', 'ea', valeur);
    }
  });

  it('exige Kr quand l’irrigation est déclarée localisée', () => {
    const gravitaire = attraperErreurMoteur(() =>
      calculerBesoinsEauGravitaire({
        ...ENTREES_VALIDES.BESOINS_EAU_GRAVITAIRE,
        irrigationLocalisee: true,
        kr: undefined,
      }),
    );
    expect(gravitaire.code).toBe('KR_MANQUANT');

    const sousPression = attraperErreurMoteur(() =>
      calculerBesoinsEauSousPression({
        ...ENTREES_VALIDES.BESOINS_EAU_SOUS_PRESSION,
        kr: undefined,
      }),
    );
    expect(sousPression.code).toBe('KR_MANQUANT');
    expect(sousPression.message).toMatch(/aspersion/i);
  });

  it('refuse un Kr hors de [0, 1]', () => {
    attendreRefus('BESOINS_EAU_SOUS_PRESSION', 'kr', 1.5);
    attendreRefus('BESOINS_EAU_SOUS_PRESSION', 'kr', -0.2);
  });

  it('accepte un mois à zéro jour sans produire de valeur non finie', () => {
    const mois = Array.from({ length: 12 }, (_, index) => ({
      jours: index === 3 ? 0 : 30,
      eto: 5,
      pe: 0,
      perc: 0,
      r: 0,
    }));
    const resultat = calculerBesoinsEauGravitaire(
      entreeModifiee('BESOINS_EAU_GRAVITAIRE', 'mois', mois),
    );
    expect(feuillesNonFinies(resultat.resultats)).toEqual([]);
    expect(resultat.resultats.parMois[3]?.besoinNetAssole).toBe(0);
  });
});

describe('3_Nb_Irrig — robustesse', () => {
  it('refuse une dose nette nulle ou négative', () => {
    for (const valeur of [0, -40]) {
      attendreRefus('IRRIGATIONS_GRAVITAIRE', 'dnRetenue', valeur);
      attendreRefus('IRRIGATIONS_SOUS_PRESSION', 'dnRetenue', valeur);
    }
  });

  it('refuse un cycle indéterminé quand aucun mois ne présente de besoin', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerIrrigationsGravitaire(
        entreeModifiee(
          'IRRIGATIONS_GRAVITAIRE',
          'mois',
          Array.from({ length: 12 }, () => ({ jours: 30, besoinNetAssole: 0 })),
        ),
      ),
    );
    expect(erreur.code).toBe('AUCUN_BESOIN_MENSUEL');
    expect(erreur.categorie).toBe(CategorieErreur.CALCUL_IMPOSSIBLE);
    attendreMessageMetierFrancais(erreur);
  });

  it('plafonne le cycle gravitaire à 1 jour, en le signalant', () => {
    // Dose nette faible : ESP < 2 j → IC serait < 1 j.
    const resultat = calculerIrrigationsGravitaire({
      dnRetenue: 3,
      bEnTotal: 600,
      mois: Array.from({ length: 12 }, () => ({ jours: 30, besoinNetAssole: 180 })),
    });
    attendreReference(resultat.resultats.icRetenu, 1);
    expect(resultat.avertissements.map((a) => a.code)).toContain('IC_PLANCHER');
  });

  it('refuse un mois de pointe sans jour (sous pression)', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerIrrigationsSousPression(
        entreeModifiee('IRRIGATIONS_SOUS_PRESSION', 'joursMoisDePointe', 0),
      ),
    );
    expect(erreur.code).toBe('MOIS_DE_POINTE_SANS_JOURS');
    expect(erreur.categorie).toBe(CategorieErreur.CALCUL_IMPOSSIBLE);
  });

  it('refuse un besoin de pointe nul (espacement indéfini)', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerIrrigationsSousPression(
        entreeModifiee('IRRIGATIONS_SOUS_PRESSION', 'besoinNetDePointe', 0),
      ),
    );
    expect(erreur.code).toBe('BESOIN_DE_POINTE_NUL');
    attendreMessageMetierFrancais(erreur);
  });

  it('refuse un mois de pointe de plus de 31 jours', () => {
    attendreRefus('IRRIGATIONS_SOUS_PRESSION', 'joursMoisDePointe', 32);
    attendreRefus('IRRIGATIONS_SOUS_PRESSION', 'joursMoisDePointe', 30.5);
  });
});

describe('4_Capacite — robustesse', () => {
  it('refuse un cycle d’irrigation nul ou négatif', () => {
    for (const valeur of [0, -5]) {
      attendreRefus('CAPACITE_SYSTEME', 'ic', valeur);
    }
  });

  it('refuse une durée d’irrigation nulle ou supérieure à 24 h', () => {
    for (const valeur of [0, -2, 24.5, 100]) {
      attendreRefus('CAPACITE_SYSTEME', 't', valeur);
    }
    // 24 h reste admis.
    expect(
      calculerCapacite(entreeModifiee('CAPACITE_SYSTEME', 't', 24)).resultats.qLitresParSeconde,
    ).toBeGreaterThan(0);
  });

  it('refuse une dose brute ou une superficie nulles', () => {
    attendreRefus('CAPACITE_SYSTEME', 'db', 0);
    attendreRefus('CAPACITE_SYSTEME', 'at', 0);
  });

  it('refuse une efficience de transport hors de [0, 1]', () => {
    attendreRefus('CAPACITE_SYSTEME', 'et', 1.2);
    attendreRefus('CAPACITE_SYSTEME', 'et', -0.1);
  });
});

describe('5_Efficiences — robustesse', () => {
  it('refuse une efficience nulle, négative ou supérieure à 100 %', () => {
    for (const champ of ['et', 'eb', 'ea']) {
      for (const valeur of [0, -1, 100.5, 200]) {
        attendreRefus('EFFICIENCES', champ, valeur);
      }
    }
  });

  it('refuse de calculer sans Ea ni méthode d’irrigation', () => {
    const erreur = attraperErreurMoteur(() => calculerEfficiences({ et: 90, eb: 90 }));
    expect(erreur.code).toBe('EA_MANQUANTE');
    attendreMessageMetierFrancais(erreur);
  });

  it('reste cohérent aux bornes : Et = Eb = Ea = 100 % donne Ep = 100 %', () => {
    const resultat = calculerEfficiences({ et: 100, eb: 100, ea: 100 }).resultats;
    attendreReference(resultat.ep, 100);
    expect(resultat.controles.coherent).toBe(true);
  });
});

describe('6_Canaux_Manning — robustesse', () => {
  it('refuse un canal sans section possible (b = 0 et m = 0)', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerCanalManning({ qCible: 0.09, natureParoi: 'TERRE_LISSE', b: 0, m: 0, i: 0.001 }),
    );
    expect(erreur.code).toBe('SECTION_NULLE');
    attendreMessageMetierFrancais(erreur);
  });

  it('refuse un débit cible, une pente ou une rugosité nuls ou négatifs', () => {
    for (const valeur of [0, -0.09]) {
      attendreRefus('CANAL_MANNING', 'qCible', valeur);
      attendreRefus('CANAL_MANNING', 'i', valeur);
      attendreRefus('CANAL_MANNING', 'n', valeur);
      attendreRefus('CANAL_MANNING', 'h', valeur);
    }
    attendreRefus('CANAL_MANNING', 'b', -1);
    attendreRefus('CANAL_MANNING', 'm', -1);
  });

  it('refuse de calculer sans nature de paroi ni coefficient de rugosité', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerCanalManning({ qCible: 0.09, b: 0.3, m: 1, i: 0.001 }),
    );
    expect(erreur.code).toBe('PAROI_MANQUANTE');
  });

  it('retombe sur n = 0,014 pour une paroi inconnue, en le signalant', () => {
    const resultat = calculerCanalManning(
      entreeModifiee('CANAL_MANNING', 'natureParoi', 'BETON_LUNAIRE'),
    );
    attendreReference(resultat.resultats.n, 0.014);
    expect(resultat.avertissements.map((a) => a.code)).toContain('PAROI_INCONNUE');
  });

  it('signale une pente supérieure au maximum admis de 1:300', () => {
    const resultat = calculerCanalManning(entreeModifiee('CANAL_MANNING', 'i', 0.01));
    expect(resultat.avertissements.map((a) => a.code)).toContain('PENTE_EXCESSIVE');
  });

  it('signale une vitesse hors de la plage 0,3 – 1 m/s', () => {
    // Pente très forte → vitesse excessive (érosion).
    const rapide = calculerCanalManning({
      qCible: 5,
      natureParoi: 'BETON_FINI',
      b: 1,
      m: 1,
      i: 0.01,
    });
    expect(rapide.resultats.controleVitesse.conforme).toBe(false);
    expect(rapide.avertissements.map((a) => a.code)).toContain('VITESSE_HORS_PLAGE');
  });

  it('ne produit aucune valeur non finie sur une géométrie démesurée', () => {
    // Un fruit de talus absurde faisait déborder √(1 + m²) : le périmètre
    // mouillé devenait `Infinity`. Le moteur doit refuser proprement ou rendre
    // des valeurs finies, jamais afficher l'infini dans un rapport.
    for (const m of [1e12, 1e300]) {
      let resultats: unknown;
      let echec: unknown;
      try {
        resultats = calculerCanalManning(entreeModifiee('CANAL_MANNING', 'm', m)).resultats;
      } catch (erreur) {
        echec = erreur;
      }
      if (echec === undefined) {
        expect(feuillesNonFinies(resultats)).toEqual([]);
      } else {
        expect(estErreurMoteur(echec), `erreur non métier : ${String(echec)}`).toBe(true);
      }
    }
  });
});

describe('7_DFC_DMP — robustesse', () => {
  it('refuse un mois de pointe sans jour', () => {
    attendreRefus('DFC_DMP', 'joursMoisDePointe', 0);
  });

  it('refuse une efficience de projet nulle ou hors plage', () => {
    for (const valeur of [0, -10, 120]) {
      attendreRefus('DFC_DMP', 'epPourcent', valeur);
    }
  });

  it('refuse une main d’eau, une superficie ou une dose nettes nulles', () => {
    attendreRefus('DFC_DMP', 'mainDEau', 0);
    attendreRefus('DFC_DMP', 'at', 0);
    attendreRefus('DFC_DMP', 'dnRetenue', 0);
    attendreRefus('DFC_DMP', 'qmPointe', 0);
  });

  it('avertit quand le coefficient de pointe sort de la plage usuelle 1,1 – 1,3', () => {
    for (const k of [1, 2]) {
      const resultat = calculerDfcDmp(entreeModifiee('DFC_DMP', 'k', k));
      expect(resultat.avertissements.map((a) => a.code)).toContain('K_HORS_PLAGE_USUELLE');
    }
  });
});

describe('5_Aspersion — robustesse', () => {
  it('refuse un diamètre mouillé ou un débit d’arroseur nuls', () => {
    for (const valeur of [0, -1]) {
      attendreRefus('ASPERSION', 'dm', valeur);
      attendreRefus('ASPERSION', 'q', valeur);
      attendreRefus('ASPERSION', 'qSystemeLitresParSeconde', valeur);
      attendreRefus('ASPERSION', 'db', valeur);
    }
  });

  it('refuse une durée d’irrigation nulle ou supérieure à 24 h', () => {
    attendreRefus('ASPERSION', 't', 0);
    attendreRefus('ASPERSION', 't', 25);
  });

  it('signale un risque de ruissellement quand Pr dépasse la vitesse d’infiltration', () => {
    const resultat = calculerAspersion(entreeModifiee('ASPERSION', 'ki', 2));
    expect(resultat.resultats.controleRuissellement.conforme).toBe(false);
    expect(resultat.avertissements.map((a) => a.code)).toContain('RISQUE_RUISSELLEMENT');
  });

  it('n’invente pas de contrôle de ruissellement quand Ki n’est pas renseigné', () => {
    const resultat = calculerAspersion(entreeModifiee('ASPERSION', 'ki', undefined));
    expect(resultat.resultats.controleRuissellement.conforme).toBeNull();
    expect(resultat.avertissements.map((a) => a.code)).toContain('KI_NON_RENSEIGNE');
  });

  it('automatise la vérification de couverture du cycle (manuelle dans le classeur)', () => {
    // Cycle court : le réseau ne peut pas couvrir la surface exigée par jour.
    const resultat = calculerAspersion(entreeModifiee('ASPERSION', 'ic', 1));
    expect(resultat.resultats.verificationCouverture?.conforme).toBe(false);
    expect(resultat.avertissements.map((a) => a.code)).toContain('COUVERTURE_INSUFFISANTE');
  });

  it('signale qu’une position ne tient pas dans la journée', () => {
    // Dose brute énorme → la durée d'une position dépasse T.
    const resultat = calculerAspersion(entreeModifiee('ASPERSION', 'db', 500));
    expect(resultat.resultats.positionsParJour).toBeLessThan(1);
    expect(resultat.avertissements.map((a) => a.code)).toContain('MOINS_D_UNE_POSITION');
  });
});

describe('6_Goutte_a_goutte — robustesse', () => {
  it('refuse un espacement nul (Sp × Sr = 0)', () => {
    for (const champ of ['sp', 'sr']) {
      attendreRefus('GOUTTE_A_GOUTTE', champ, 0);
      attendreRefus('GOUTTE_A_GOUTTE', champ, -0.4);
    }
  });

  it('refuse un débit de goutteur nul et un nombre de goutteurs nul ou fractionnaire', () => {
    attendreRefus('GOUTTE_A_GOUTTE', 'qa', 0);
    attendreRefus('GOUTTE_A_GOUTTE', 'ne', 0);
    attendreRefus('GOUTTE_A_GOUTTE', 'ne', 1.5);
    attendreRefus('GOUTTE_A_GOUTTE', 'dw', 0);
    attendreRefus('GOUTTE_A_GOUTTE', 'db', 0);
    attendreRefus('GOUTTE_A_GOUTTE', 'qSystemeLitresParSeconde', 0);
  });

  it('signale une surface mouillée insuffisante pour le climat', () => {
    // Bulbe étroit en climat aride (60 % exigés).
    const resultat = calculerGoutteAGoutte({
      ...ENTREES_VALIDES.GOUTTE_A_GOUTTE,
      dw: 0.2,
      climat: 'ARIDE',
    });
    expect(resultat.resultats.controleSurfaceMouillee.conforme).toBe(false);
    expect(resultat.avertissements.map((a) => a.code)).toContain('SURFACE_MOUILLEE_INSUFFISANTE');
  });
});

describe('7_Reseau_Hazen_Williams — robustesse', () => {
  const troncon = ENTREES_VALIDES.RESEAU_HAZEN_WILLIAMS?.troncons as Record<string, unknown>[];

  function avecTroncon(surcharge: Record<string, unknown>) {
    return { troncons: [{ ...(troncon[0] as Record<string, unknown>), ...surcharge }] };
  }

  it('refuse un diamètre, un débit ou une longueur nuls ou négatifs', () => {
    for (const champ of ['diametreMm', 'debitLitresParSeconde', 'longueurM']) {
      for (const valeur of [0, -1]) {
        const erreur = attraperErreurMoteur(() =>
          calculerReseauHazenWilliams(avecTroncon({ [champ]: valeur })),
        );
        expect(erreur.categorie).toBe(CategorieErreur.VALIDATION);
        attendreMessageMetierFrancais(erreur);
      }
    }
  });

  it('refuse un nombre de sorties négatif ou fractionnaire', () => {
    for (const valeur of [-1, 2.5]) {
      const erreur = attraperErreurMoteur(() =>
        calculerReseauHazenWilliams(avecTroncon({ nombreSorties: valeur })),
      );
      expect(erreur.categorie).toBe(CategorieErreur.VALIDATION);
    }
  });

  it('refuse un réseau vide', () => {
    const erreur = attraperErreurMoteur(() => calculerReseauHazenWilliams({ troncons: [] }));
    expect(erreur.categorie).toBe(CategorieErreur.VALIDATION);
  });

  it('refuse un matériau inconnu au lieu d’appliquer un C de repli', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerReseauHazenWilliams(avecTroncon({ materiau: 'BAMBOU' })),
    );
    expect(erreur.code).toBe('MATERIAU_INCONNU');
    attendreMessageMetierFrancais(erreur);
  });

  it('refuse un tronçon sans matériau ni coefficient', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerReseauHazenWilliams(avecTroncon({ materiau: undefined })),
    );
    expect(erreur.code).toBe('MATERIAU_MANQUANT');
  });

  it('applique F = 1 pour une conduite simple (N = 0 ou 1) et F < 1 au-delà', () => {
    const sansSortie = calculerReseauHazenWilliams(avecTroncon({ nombreSorties: 0 })).resultats;
    const uneSortie = calculerReseauHazenWilliams(avecTroncon({ nombreSorties: 1 })).resultats;
    const vingtSorties = calculerReseauHazenWilliams(avecTroncon({ nombreSorties: 20 })).resultats;

    expect(sansSortie.troncons[0]?.f).toBe(1);
    expect(uneSortie.troncons[0]?.f).toBe(1);
    expect(vingtSorties.troncons[0]?.f).toBeLessThan(1);
    // La perte de charge d'une rampe est bien réduite par le facteur.
    expect(vingtSorties.deltaHTotal).toBeLessThan(sansSortie.deltaHTotal);
  });
});

describe('8_HMT_Pompe — robustesse', () => {
  it('refuse un rendement nul, négatif ou supérieur à 1', () => {
    for (const valeur of [0, -0.5, 1.2]) {
      attendreRefus('POMPE_HMT', 'rendement', valeur);
    }
  });

  it('refuse un débit nul ou négatif', () => {
    attendreRefus('POMPE_HMT', 'qM3ParSeconde', 0);
    attendreRefus('POMPE_HMT', 'qM3ParSeconde', -0.01);
  });

  it('refuse des hauteurs ou des pertes de charge négatives', () => {
    attendreRefus('POMPE_HMT', 'hg', -1);
    attendreRefus('POMPE_HMT', 'deltaHLineaire', -1);
    attendreRefus('POMPE_HMT', 'pressionServiceBar', -1);
    attendreRefus('POMPE_HMT', 'pourcentSingulieres', -1);
    attendreRefus('POMPE_HMT', 'pourcentSingulieres', 120);
  });

  it('avertit d’un rendement global irréaliste', () => {
    for (const rendement of [0.05, 1]) {
      const resultat = calculerPompe(entreeModifiee('POMPE_HMT', 'rendement', rendement));
      expect(resultat.avertissements.map((a) => a.code)).toContain('RENDEMENT_INHABITUEL');
    }
  });

  it('avertit quand la hauteur manométrique totale est nulle', () => {
    const resultat = calculerPompe({
      hg: 0,
      pressionServiceBar: 0,
      deltaHLineaire: 0,
      qM3ParSeconde: 0.01,
      rendement: 0.65,
    });
    attendreReference(resultat.resultats.hmt, 0);
    expect(resultat.avertissements.map((a) => a.code)).toContain('HMT_NULLE');
    expect(feuillesNonFinies(resultat.resultats)).toEqual([]);
  });
});

describe('messages d’erreur — toujours en français, jamais ceux de la bibliothèque', () => {
  // `erreurs.ts` pose la règle : « tous les messages sont en français et
  // destinés à un ingénieur agronome ». Les messages par défaut de la
  // bibliothèque de validation, eux, sont en anglais : ils ne doivent jamais
  // remonter jusqu'à l'utilisateur.
  it('traduit les valeurs de liste non reconnues', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerChristiansen({ n: 20, materiau: 'BAMBOU', position: 'F1' }),
    );
    attendreMessageMetierFrancais(erreur);
    expect(erreur.message).toMatch(/valeur non reconnue/);
    expect(erreur.champ).toBe('materiau');
  });

  it('traduit les champs obligatoires manquants', () => {
    const erreur = attraperErreurMoteur(() => calculerChristiansen({ materiau: 'PLASTIQUE' }));
    attendreMessageMetierFrancais(erreur);
    expect(erreur.message).toMatch(/obligatoire/);
  });

  it('traduit les erreurs de type', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerCapacite({ at: 100, ic: 5, db: 57, t: 'douze heures' }),
    );
    attendreMessageMetierFrancais(erreur);
    expect(erreur.message).toMatch(/nombre/);
  });

  it('traduit les champs non attendus et les listes mal formées', () => {
    const champInconnu = attraperErreurMoteur(() =>
      calculerEfficiences({ et: 90, eb: 90, ea: 70, coefficientSecret: 1 }),
    );
    attendreMessageMetierFrancais(champInconnu);

    const listeAttendue = attraperErreurMoteur(() =>
      calculerBesoinsEauGravitaire({ at: 100, cultures: 'maïs', mois: [] }),
    );
    attendreMessageMetierFrancais(listeAttendue);
    expect(listeAttendue.message).toMatch(/liste/);
  });

  it('porte le champ fautif, pour que l’interface puisse le mettre en évidence', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerReseauHazenWilliams({
        troncons: [
          {
            nom: 'Rampe',
            type: 'RAMPE',
            c: 140,
            diametreMm: -1,
            debitLitresParSeconde: 5,
            longueurM: 100,
          },
        ],
      }),
    );
    expect(erreur.champ).toBe('troncons.0.diametreMm');
    expect(Array.isArray(erreur.details)).toBe(true);
  });
});

describe('9_Coeff_Fn_Rampe — robustesse', () => {
  it('refuse un nombre de sorties nul, négatif ou fractionnaire', () => {
    for (const valeur of [0, -5, 7.5]) {
      attendreRefus('COEFFICIENT_CHRISTIANSEN', 'n', valeur);
    }
  });

  it('refuse un matériau ou une position inconnus', () => {
    attendreRefus('COEFFICIENT_CHRISTIANSEN', 'materiau', 'BAMBOU');
    attendreRefus('COEFFICIENT_CHRISTIANSEN', 'position', 'F9');
  });

  it('reste défini aux bornes de la table (n = 5 et n = 100)', () => {
    attendreReference(
      calculerChristiansen({ n: 5, materiau: 'PLASTIQUE', position: 'F1' }).resultats.f,
      0.469,
    );
    attendreReference(
      calculerChristiansen({ n: 100, materiau: 'ALUMINIUM', position: 'F3' }).resultats.f,
      0.352,
    );
  });
});
