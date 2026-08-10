/**
 * Cas de test de référence — moteur **sous pression** (aspersion et
 * goutte-à-goutte).
 *
 * Chaque `describe` rejoue le « cas de test de référence » de
 * [docs/MOTEUR-SOUS-PRESSION.md](../../../docs/MOTEUR-SOUS-PRESSION.md), issu du
 * classeur `Boite_a_outils_Irrigation_sous_pression.xlsx`.
 *
 * **Aucune valeur attendue de ce fichier ne doit être modifiée pour faire passer
 * un test.** Comme pour le gravitaire, les modules sont chaînés sur les valeurs
 * de pleine précision.
 */

import { describe, expect, it } from 'vitest';

import { calculerDoses } from '../../src/engine/commun/doses.js';
import { calculerBesoinsEauSousPression } from '../../src/engine/commun/besoins-eau.js';
import { calculerIrrigationsSousPression } from '../../src/engine/commun/irrigations.js';
import { calculerCapacite } from '../../src/engine/commun/capacite.js';
import { calculerAspersion } from '../../src/engine/sous-pression/aspersion.js';
import { calculerGoutteAGoutte } from '../../src/engine/sous-pression/goutte-a-goutte.js';
import {
  calculerReseauHazenWilliams,
  facteurChristiansenContinu,
} from '../../src/engine/sous-pression/hazen-williams.js';
import { calculerPompe } from '../../src/engine/sous-pression/pompe.js';
import { calculerChristiansen } from '../../src/engine/sous-pression/christiansen.js';

import {
  attendreReference,
  entreesBesoinsEauSousPressionReference,
  feuillesNonFinies,
} from './aide-moteur.js';

// ---------------------------------------------------------------------------
//  Chaînage du pipeline sous pression
// ---------------------------------------------------------------------------

const doses = calculerDoses({
  variante: 'SOUS_PRESSION',
  culture: 'ARACHIDE',
  typeSol: 'LIMONEUX',
  sourceDnRetenue: 'TABLE',
  typeEfficience: 'Ea',
  methodeIrrigation: 'GOUTTE_A_GOUTTE',
}).resultats;

const besoins = calculerBesoinsEauSousPression(entreesBesoinsEauSousPressionReference()).resultats;

const irrigations = calculerIrrigationsSousPression({
  dnRetenue: 40,
  bEnTotal: 507.80375,
  besoinNetDePointe: 171.275,
  joursMoisDePointe: 31,
}).resultats;

const debit = calculerCapacite({
  variante: 'SOUS_PRESSION',
  at: 10,
  ic: irrigations.ic,
  db: doses.db,
  t: 20,
}).resultats;

// ---------------------------------------------------------------------------

describe('1_Doses sous pression (MOTEUR-SOUS-PRESSION.md §2)', () => {
  it('retrouve Dn = 40 mm et Db = 44,4444 mm avec Ea = 90 % (goutte-à-goutte)', () => {
    attendreReference(doses.dnRetenue, 40);
    // Ici le classeur fait bien la liaison : Ea vient de la table C.
    attendreReference(doses.efficienceUtilisee, 90);
    expect(doses.sourceEfficience).toBe('TABLE_C');
    attendreReference(doses.db, 44.4444, 4);
  });

  it('l’aspersion donne Ea = 75 % (table C, FAO 1989)', () => {
    const aspersion = calculerDoses({
      variante: 'SOUS_PRESSION',
      culture: 'ARACHIDE',
      typeSol: 'LIMONEUX',
      methodeIrrigation: 'ASPERSION',
    }).resultats;
    attendreReference(aspersion.efficienceUtilisee, 75);
    attendreReference(aspersion.db, (40 / 75) * 100);
  });
});

describe('2_Besoins_eau sous pression (MOTEUR-SOUS-PRESSION.md §3)', () => {
  it('retrouve la pointe de 171,275 mm/mois au 4ᵉ mois (31 j)', () => {
    attendreReference(besoins.besoinNetDePointe, 171.275, 3);
    expect(besoins.moisDePointe).toBe(4);
    expect(besoins.joursMoisDePointe).toBe(31);
  });

  it('retrouve BEnTotal = 507,80375 mm, tel que le calcule le classeur', () => {
    // Le classeur ne plafonne pas les mois excédentaires : son total inclut le
    // −10 mm de septembre. C'est donc `bEnTotalClasseur` qui doit le retrouver.
    attendreReference(besoins.bEnTotalClasseur, 507.80375, 5);
    // Le total retenu pour le dimensionnement plafonne ce mois à 0 : il vaut
    // exactement 10 mm de plus (MOTEUR-SOUS-PRESSION.md §3, comportement retenu).
    attendreReference(besoins.bEnTotal, 507.80375 + 10, 5);
  });

  it('septembre est bien excédentaire à −10 mm et signalé comme tel', () => {
    const septembre = besoins.parMois[5];
    expect(septembre).toBeDefined();
    if (septembre === undefined) return;
    expect(septembre.nom).toBe('Septembre');
    attendreReference(septembre.ben, -10);
    expect(septembre.excedentaire).toBe(true);
    attendreReference(septembre.benPlafonne, 0);
  });

  it('ne produit aucune valeur non finie', () => {
    expect(feuillesNonFinies(besoins)).toEqual([]);
  });
});

describe('3_Nb_Irrig_ESP_IC sous pression (MOTEUR-SOUS-PRESSION.md §4)', () => {
  it('retrouve Ni = 12,695 → 13 arrosages, ESP = 7,2398 j et IC = 6,2398 j', () => {
    attendreReference(irrigations.ni, 12.695, 3);
    // Ici l'arrondi EST automatisé dans le classeur.
    expect(irrigations.niArrondi).toBe(13);
    attendreReference(irrigations.benParJour, 171.275 / 31);
    attendreReference(irrigations.esp, 7.2398, 4);
    attendreReference(irrigations.ic, 6.2398, 4);
  });
});

describe('4_Debit_Systeme (MOTEUR-SOUS-PRESSION.md §5)', () => {
  it('retrouve A = 1,6026 ha/j, V = 712,271 m³/j et Q = 9,8927 l/s', () => {
    attendreReference(debit.a, 1.6026, 4);
    attendreReference(debit.v, 712.271, 3);
    attendreReference(debit.qLitresParSeconde, 9.8927, 4);
    attendreReference(debit.qM3ParHeure, 35.614, 3);
    attendreReference(debit.qM3ParSeconde, 0.0098927, 7);
  });

  it('n’expose pas le bloc de sensibilité au transport, propre au gravitaire', () => {
    expect(debit.debitDisponible).toBeNull();
    expect(debit.etApplique).toBeNull();
  });
});

describe('5_Aspersion (MOTEUR-SOUS-PRESSION.md §6)', () => {
  const aspersion = calculerAspersion({
    dm: 24,
    classeVent: 'FAIBLE',
    q: 1400,
    ki: 15,
    qSystemeLitresParSeconde: debit.qLitresParSeconde,
    db: doses.db,
    t: 20,
  });

  it('retrouve Se = Sl = 14,4 m, 207,36 m² par arroseur et Pr = 6,7515 mm/h', () => {
    const r = aspersion.resultats;
    attendreReference(r.fractionDm, 0.6);
    attendreReference(r.se, 14.4);
    attendreReference(r.sl, 14.4);
    attendreReference(r.surfaceParArroseur, 207.36);
    attendreReference(r.pr, 6.7515, 4);
  });

  it('Pr ≤ Ki = 15 mm/h : pas de risque de ruissellement', () => {
    expect(aspersion.resultats.controleRuissellement.conforme).toBe(true);
    expect(aspersion.resultats.controleRuissellement.message).toContain('pas de ruissellement');
  });

  it('retrouve N = 25,44 arroseurs, 0,5275 ha simultanés, t = 6,5829 h et 3,038 positions/jour', () => {
    const r = aspersion.resultats;
    attendreReference(r.qSystemeLitresParHeure, 35613.57, 2);
    attendreReference(r.nArroseurs, 25.44, 2);
    attendreReference(r.surfaceSimultanee, 0.5275, 4);
    attendreReference(r.dureeParPosition, 6.5829, 4);
    attendreReference(r.positionsParJour, 3.038, 3);
  });
});

describe('6_Goutte_a_goutte (MOTEUR-SOUS-PRESSION.md §7)', () => {
  const gag = calculerGoutteAGoutte({
    sp: 0.4,
    sr: 1.2,
    ne: 1,
    qa: 4,
    dw: 0.6,
    climat: 'SEMI_ARIDE',
    qSystemeLitresParSeconde: debit.qLitresParSeconde,
    at: 10,
    db: doses.db,
  }).resultats;

  it('retrouve qp = 4 l/h et Pw = 58,905 % (≥ 40 % en climat semi-aride)', () => {
    attendreReference(gag.qp, 4);
    attendreReference(gag.pw, 58.905, 3);
    attendreReference(gag.pwMini, 40);
    expect(gag.controleSurfaceMouillee.conforme).toBe(true);
  });

  it('retrouve 20 833,33 plants/ha et 83 333,33 l/h/ha', () => {
    attendreReference(gag.plantsParHa, 20833.33, 2);
    attendreReference(gag.debitParHa, 83333.33, 2);
  });

  it('retrouve 0,4274 ha simultanés, 24 secteurs, 21,333 L/plant et t = 5,333 h', () => {
    attendreReference(gag.surfaceSimultanee, 0.4274, 4);
    expect(gag.nombreDeSecteurs).toBe(24);
    attendreReference(gag.volumeParPlant, 21.333, 3);
    attendreReference(gag.dureeParPoste, 5.333, 3);
  });
});

describe('7_Reseau_Hazen_Williams (MOTEUR-SOUS-PRESSION.md §8)', () => {
  const reseau = calculerReseauHazenWilliams({
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
  });

  it('retrouve J = 0,043575 m/m, ΔH = 4,3575 m et v = 1,604 m/s (PEHD, C = 140)', () => {
    const troncon = reseau.resultats.troncons[0];
    expect(troncon).toBeDefined();
    if (troncon === undefined) return;
    attendreReference(troncon.c, 140);
    attendreReference(troncon.f, 1);
    attendreReference(troncon.j, 0.043575, 6);
    attendreReference(troncon.deltaH, 4.3575, 4);
    attendreReference(troncon.vitesse, 1.604, 3);
    attendreReference(reseau.resultats.deltaHTotal, 4.3575, 4);
  });

  it('signale la vitesse hors plage usuelle (> 1,5 m/s)', () => {
    const troncon = reseau.resultats.troncons[0];
    expect(troncon?.controleVitesse.conforme).toBe(false);
    expect(reseau.resultats.tronconsHorsPlage).toEqual(['Conduite principale']);
    expect(reseau.avertissements.map((a) => a.code)).toContain('VITESSE_HORS_PLAGE');
  });

  it('agrège les pertes de charge de tous les tronçons pour la pompe', () => {
    const multiple = calculerReseauHazenWilliams({
      troncons: [
        {
          nom: 'Principale',
          type: 'PRINCIPALE',
          materiau: 'PEHD',
          diametreMm: 63,
          debitLitresParSeconde: 5,
          longueurM: 100,
          nombreSorties: 0,
        },
        {
          nom: 'Rampe 1',
          type: 'RAMPE',
          materiau: 'PEHD',
          diametreMm: 63,
          debitLitresParSeconde: 5,
          longueurM: 100,
          nombreSorties: 0,
        },
      ],
    }).resultats;
    attendreReference(multiple.deltaHTotal, 2 * 4.3575, 4);
    attendreReference(multiple.deltaHParType.PRINCIPALE as number, 4.3575, 4);
    attendreReference(multiple.deltaHParType.RAMPE as number, 4.3575, 4);
  });
});

describe('8_HMT_Pompe (MOTEUR-SOUS-PRESSION.md §9)', () => {
  const pompe = calculerPompe({
    hg: 15,
    pressionServiceBar: 1,
    deltaHLineaire: 4.5,
    pourcentSingulieres: 10,
    qM3ParSeconde: debit.qM3ParSeconde,
    rendement: 0.65,
  });

  it('retrouve HMT = 30,14 m, Ph = 2,925 kW, Pa = 4,50 kW ≈ 6,11 CV', () => {
    const r = pompe.resultats;
    attendreReference(r.pressionServiceM, 10.19);
    attendreReference(r.deltaHSingulieres, 0.45);
    attendreReference(r.hmt, 30.14, 2);
    attendreReference(r.ph, 2.925, 3);
    attendreReference(r.pa, 4.5, 2);
    attendreReference(r.paCv, 6.11, 2);
  });

  it('rappelle que le NPSH disponible n’est pas calculé', () => {
    expect(pompe.resultats.rappelNpsh).toContain('NPSH');
    expect(pompe.avertissements.map((a) => a.code)).toContain('NPSH_A_VERIFIER');
  });
});

describe('9_Coeff_Fn_Rampe — facteur de Christiansen (MOTEUR-SOUS-PRESSION.md §10)', () => {
  it('retrouve F = 0,389 pour n = 20, plastique, position F1 (valeur tabulée)', () => {
    const resultat = calculerChristiansen({ n: 20, materiau: 'PLASTIQUE', position: 'F1' })
      .resultats;
    attendreReference(resultat.f, 0.389);
    expect(resultat.source).toBe('TABULEE');
    expect(resultat.libellePosition).toContain('F1');
  });

  it('compare la valeur tabulée à la formule continue du module 7', () => {
    const resultat = calculerChristiansen({ n: 20, materiau: 'PLASTIQUE', position: 'F1' })
      .resultats;
    attendreReference(resultat.fFormuleContinue, facteurChristiansenContinu(20));
    attendreReference(
      resultat.ecartRelatifAvecFormule,
      (0.389 - facteurChristiansenContinu(20)) / facteurChristiansenContinu(20),
    );
  });

  it('la formule continue prend bien la branche F = 1 pour N ≤ 1', () => {
    // ⚠️ MOTEUR-SOUS-PRESSION.md §13 : √(m−1)/(6N²) reste défini pour N = 1,
    // mais c'est la branche F = 1 qui doit être prise (conduite simple).
    expect(facteurChristiansenContinu(0)).toBe(1);
    expect(facteurChristiansenContinu(1)).toBe(1);
  });
});
