/**
 * Cas de test de référence — moteur **gravitaire**.
 *
 * Chaque `describe` rejoue le « cas de test de référence » de
 * [docs/MOTEUR-GRAVITAIRE.md](../../../docs/MOTEUR-GRAVITAIRE.md), module par
 * module. Ces valeurs sont celles du classeur `Boite_a_outils_Irrigation.xlsx` :
 * elles constituent la preuve que le portage est fidèle.
 *
 * **Aucune valeur attendue de ce fichier ne doit être modifiée pour faire passer
 * un test.** Si un calcul ne retrouve pas la référence, le défaut est dans le
 * moteur.
 *
 * Les modules sont chaînés comme dans le classeur : la dose brute calculée par
 * `1_Doses` alimente `4_Capacité`, le cycle de `3_Nb_Irrig` aussi, etc. Le
 * chaînage se fait sur les valeurs **de pleine précision**, jamais sur les
 * valeurs arrondies du document — c'est ce que fait Excel, et c'est ce qui
 * permet de retrouver `V = 11 087,42 m³/j`.
 */

import { describe, expect, it } from 'vitest';

import { calculerDoses } from '../../src/engine/commun/doses.js';
import { calculerBesoinsEauGravitaire } from '../../src/engine/commun/besoins-eau.js';
import { calculerIrrigationsGravitaire } from '../../src/engine/commun/irrigations.js';
import { calculerCapacite } from '../../src/engine/commun/capacite.js';
import { calculerEfficiences } from '../../src/engine/commun/efficiences.js';
import { calculerCanalManning } from '../../src/engine/gravitaire/canaux-manning.js';
import { calculerDfcDmp } from '../../src/engine/gravitaire/dfc-dmp.js';

import {
  attendreReference,
  attendreReferenceAvecTolerance,
  entreesBesoinsEauGravitaireReference,
  feuillesNonFinies,
} from './aide-moteur.js';

// ---------------------------------------------------------------------------
//  Chaînage : chaque module reprend les sorties de pleine précision du précédent
// ---------------------------------------------------------------------------

const doses = calculerDoses({
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
}).resultats;

const besoins = calculerBesoinsEauGravitaire(entreesBesoinsEauGravitaireReference()).resultats;

const irrigations = calculerIrrigationsGravitaire({
  dnRetenue: doses.dnRetenue,
  bEnTotal: besoins.bEnTotal,
  mois: besoins.parMois.map((mois) => ({
    nom: mois.nom ?? undefined,
    jours: mois.jours,
    besoinNetAssole: mois.besoinNetAssole,
  })),
}).resultats;

const capacite = calculerCapacite({
  variante: 'GRAVITAIRE',
  at: besoins.at,
  ic: irrigations.icRetenu,
  db: doses.db,
  t: 12,
  et: 0.9,
}).resultats;

// ---------------------------------------------------------------------------

describe('1_Doses — dose nette et dose brute (MOTEUR-GRAVITAIRE.md §4)', () => {
  it('retrouve les valeurs du classeur : Dn = 40 mm, RU = 135 mm, Dn(B) = 67,5 mm, Db = 57,142857 mm', () => {
    // Arachide → « Moyen (50-100 cm) » ; sol limoneux → table A.
    expect(doses.categorieEnracinement).toBe('MOYEN');
    expect(doses.libelleCategorieEnracinement).toBe('Moyen (50-100 cm)');
    attendreReference(doses.dnSuggere as number, 40);

    // Méthode B : p = 0,5 ; θcc = 0,30 ; θpf = 0,15 ; Z = 90 cm.
    attendreReference(doses.ru as number, 135);
    attendreReference(doses.dnMethodeB as number, 67.5);

    // Dose nette retenue = méthode A (valeur par défaut de la spécification).
    attendreReference(doses.dnRetenue, 40);
    expect(doses.sourceDnRetenue).toBe('TABLE');

    // Db = Dn / Ea × 100, avec Ea = 70 %.
    attendreReference(doses.db, 57.142857, 6);
    attendreReference(doses.efficienceUtilisee, 70);
  });

  it('la méthode B seule redonne Dn = 67,5 mm quand l’utilisateur l’impose', () => {
    const parFormule = calculerDoses({
      variante: 'GRAVITAIRE',
      p: 0.5,
      thetaCc: 0.3,
      thetaPf: 0.15,
      profondeurRacinaire: 90,
      sourceDnRetenue: 'FORMULE',
      valeurEfficience: 70,
    }).resultats;

    attendreReference(parFormule.dnRetenue, 67.5);
    // Db suit la dose nette retenue : 67,5 / 70 × 100.
    attendreReference(parFormule.db, 96.428571, 6);
  });

  it('signale que l’efficience du classeur gravitaire est une saisie libre', () => {
    const resultat = calculerDoses({
      variante: 'GRAVITAIRE',
      culture: 'ARACHIDE',
      typeSol: 'LIMONEUX',
      valeurEfficience: 70,
    });
    expect(resultat.avertissements.map((a) => a.code)).toContain('EFFICIENCE_SAISIE_LIBRE');
  });
});

describe('2_Besoins_eau — besoins en eau de l’assolement (MOTEUR-GRAVITAIRE.md §5)', () => {
  it('retrouve la pointe de 201,5 mm/mois en juillet (31 j) et BEnTotal = 619,8875 mm', () => {
    attendreReference(besoins.besoinNetDePointe, 201.5, 1);
    expect(besoins.moisDePointe).toBe(7);
    expect(besoins.nomMoisDePointe).toBe('Juillet');
    expect(besoins.joursMoisDePointe).toBe(31);
    attendreReference(besoins.bEnTotal, 619.8875, 4);
  });

  it('pondère bien par les parts de surface (50 ha / 50 ha sur 100 ha)', () => {
    expect(besoins.partSurfaces).toEqual([0.5, 0.5]);
    const juillet = besoins.parMois[6];
    expect(juillet).toBeDefined();
    if (juillet === undefined) return;
    // Ben maïs = 1,15 × 6,5 × 31 = 231,725 ; Ben coton = 0,85 × 6,5 × 31 = 171,275.
    attendreReference(juillet.benParCulture[0] as number, 231.725, 3);
    attendreReference(juillet.benParCulture[1] as number, 171.275, 3);
    attendreReference(juillet.besoinNetAssole, 201.5, 1);
  });

  it('convertit le besoin assolé en volume : 1 mm sur 1 ha = 10 m³', () => {
    attendreReference(besoins.volumeTotalM3, 10 * 100 * 619.8875);
  });

  it('ne produit aucune valeur non finie', () => {
    expect(feuillesNonFinies(besoins)).toEqual([]);
  });
});

describe('3_Nb_Irrig_ESP_IC — irrigations, espacement, cycle (MOTEUR-GRAVITAIRE.md §6)', () => {
  it('retrouve Ni = 15,497, ESP mini = 6,1538 j (juillet) et IC = 5,1538 j', () => {
    attendreReference(irrigations.ni, 15.497, 3);
    // Le classeur n'automatise pas l'arrondi : les deux valeurs sont exposées.
    expect(irrigations.niArrondi).toBe(16);

    attendreReference(irrigations.espMini, 6.1538, 4);
    expect(irrigations.moisEspMini).toBe(7);
    expect(irrigations.nomMoisEspMini).toBe('Juillet');
    attendreReference(irrigations.icRetenu, 5.1538, 4);
  });

  it('le mois le plus exigeant est bien celui qui dimensionne le cycle', () => {
    const espacements = irrigations.parMois
      .map((mois) => mois.esp)
      .filter((esp): esp is number => esp !== null);
    expect(Math.min(...espacements)).toBeCloseTo(irrigations.espMini, 12);
  });

  it('le numérateur de ESP est toujours la même dose nette', () => {
    for (const mois of irrigations.parMois) {
      if (mois.esp === null) continue;
      // ESP × Ben(mm/j) doit redonner Dn, quel que soit le mois.
      attendreReference(mois.esp * mois.benParJour, 40);
    }
  });
});

describe('4_Capacite_Systeme — capacité du système (MOTEUR-GRAVITAIRE.md §7)', () => {
  it('retrouve A = 19,403 ha/j, V = 11 087,42 m³/j et Q = 256,65 l/s', () => {
    attendreReference(capacite.a, 19.403, 3);
    attendreReference(capacite.v, 11087.42, 2);
    attendreReference(capacite.qLitresParSeconde, 256.65, 2);
    attendreReference(capacite.qM3ParHeure, 923.95, 2);
    attendreReference(capacite.qM3ParSeconde, 0.2567, 4);
  });

  it('applique la sensibilité au transport : Et = 0,9 → 230,99 l/s en aval', () => {
    attendreReference(capacite.debitDisponible as number, 230.99, 2);
    attendreReference(capacite.debitTete, capacite.qLitresParSeconde);
  });

  it('la capacité ne dépend des besoins que par le cycle d’irrigation', () => {
    // Point de méthode explicite du classeur : Q est fixé par Db et IC, jamais
    // directement par Ben ou BEnTotal. On le vérifie en doublant la dose brute :
    // le débit double, sans qu'aucun besoin n'intervienne.
    const doublee = calculerCapacite({
      variante: 'GRAVITAIRE',
      at: 100,
      ic: irrigations.icRetenu,
      db: doses.db * 2,
      t: 12,
    }).resultats;
    attendreReference(doublee.qLitresParSeconde, capacite.qLitresParSeconde * 2);
  });
});

describe('5_Efficiences — calculateur d’efficiences (MOTEUR-GRAVITAIRE.md §8)', () => {
  const efficiences = calculerEfficiences({ et: 90, eb: 90, ea: 70 }).resultats;

  it('retrouve Ed = 81 %, Ei = 63 % et Ep = 56,7 %', () => {
    attendreReference(efficiences.ed, 81);
    attendreReference(efficiences.ei, 63);
    attendreReference(efficiences.ep, 56.7);
    attendreReference(efficiences.epFraction, 0.567);
  });

  it('les contrôles de cohérence Ed × Ea et Et × Ei redonnent Ep', () => {
    attendreReference(efficiences.controles.epViaEdEa, 56.7);
    attendreReference(efficiences.controles.epViaEtEi, 56.7);
    expect(efficiences.controles.coherent).toBe(true);
  });

  it('déduit Ea de la méthode d’irrigation (table C, FAO 1989) si elle n’est pas saisie', () => {
    const surface = calculerEfficiences({ et: 90, eb: 90, methodeApplication: 'SURFACE' });
    expect(surface.resultats.ea).toBe(60);
    expect(surface.resultats.sourceEa).toBe('TABLE_C');
    expect(surface.avertissements.map((a) => a.code)).toContain('EA_REPRISE_TABLE');

    expect(calculerEfficiences({ et: 90, eb: 90, methodeApplication: 'ASPERSION' }).resultats.ea).toBe(75);
    expect(
      calculerEfficiences({ et: 90, eb: 90, methodeApplication: 'GOUTTE_A_GOUTTE' }).resultats.ea,
    ).toBe(90);
  });
});

describe('6_Canaux_Manning — canal trapézoïdal (MOTEUR-GRAVITAIRE.md §9)', () => {
  const entrees = {
    qCible: 0.09,
    natureParoi: 'TERRE_LISSE',
    b: 0.3,
    m: 1,
    i: 0.001,
  };

  it('retrouve la section du classeur pour le tirant d’eau h = 0,29639 m', () => {
    // Le classeur ajuste `h` à la main (Valeur cible), ce qui laisse un écart
    // résiduel. On rejoue donc d'abord son tirant d'eau tel quel.
    const resultat = calculerCanalManning({ ...entrees, h: 0.29639 }).resultats;

    attendreReference(resultat.n, 0.018);
    attendreReference(resultat.ks, 55.556, 3);
    expect(resultat.sourceH).toBe('IMPOSE');

    attendreReference(resultat.s, 0.17676, 5);
    attendreReference(resultat.p, 1.13831, 5);
    attendreReference(resultat.r, 0.15528, 5);
    attendreReference(resultat.qCalcule, 0.08971, 5);
    attendreReference(resultat.vitesse, 0.5075, 4);

    // L'écart résiduel publié (−0,000285 m³/s) est très sensible au tirant
    // d'eau : dQ/dh ≈ 0,61 m³/s par mètre. Le `h` publié n'ayant que 5
    // décimales, il porte lui-même ±5·10⁻⁶ m d'incertitude, soit ±3·10⁻⁶ m³/s
    // sur l'écart. C'est cette incertitude d'entrée qui est admise ici, pas une
    // imprécision du moteur.
    attendreReferenceAvecTolerance(
      resultat.ecart,
      -0.000285,
      3e-6,
      'incertitude induite par l’arrondi à 5 décimales du tirant d’eau publié',
    );
  });

  it('revanche (C = 0,8) : J = 0,4355 m et hauteur totale 0,7319 m', () => {
    const resultat = calculerCanalManning({ ...entrees, h: 0.29639 }).resultats;
    expect(resultat.revanche).not.toBeNull();
    if (resultat.revanche === null) return;
    attendreReference(resultat.revanche.c, 0.8);
    attendreReference(resultat.revanche.j, 0.4355, 4);
    attendreReference(resultat.revanche.hauteurTotale, 0.7319, 4);
  });

  it('classe l’ouvrage : « Petit canal », pente recommandée 0,3 – 0,4 ‰', () => {
    const resultat = calculerCanalManning(entrees).resultats;
    expect(resultat.tailleCanal).toBe('Petit canal d’approvisionnement');
    expect(resultat.penteRecommandee).toBe('0,3 – 0,4 ‰');
  });

  it('la vitesse obtenue reste dans la plage 0,3 – 1 m/s recommandée', () => {
    const resultat = calculerCanalManning(entrees).resultats;
    expect(resultat.controleVitesse).toEqual({ mini: 0.3, maxi: 1, conforme: true });
  });
});

describe('7_DFC_DMP — débit fictif continu et quartiers (MOTEUR-GRAVITAIRE.md §10)', () => {
  const dfc = calculerDfcDmp({
    qmPointe: 201.5,
    joursMoisDePointe: 31,
    epPourcent: 56.7,
    k: 1.2,
    mainDEau: 20,
    at: 100,
    bEnTotal: 619.8875,
    dnRetenue: 40,
  }).resultats;

  it('retrouve DFCnet = 0,7523, DFCbrut = 1,3268 et DMP = 1,5922 l/s/ha', () => {
    attendreReference(dfc.dfcNet, 0.7523, 4);
    attendreReference(dfc.dfcBrut, 1.3268, 4);
    attendreReference(dfc.dmp, 1.5922, 4);
  });

  it('retrouve W = 15,073 ha, N = 7 quartiers et F = 16 arrosages', () => {
    attendreReference(dfc.w, 15.073, 3);
    expect(dfc.nombreQuartiers).toBe(7);
    expect(dfc.nombreArrosages).toBe(16);
    attendreReference(dfc.nombreArrosagesTheorique, 15.497, 3);
  });
});
