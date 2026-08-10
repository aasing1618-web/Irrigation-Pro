/**
 * Comportements tranchés par les spécifications.
 *
 * Les deux documents de référence signalent par ⚠️ les incohérences des
 * classeurs d'origine, et indiquent à chaque fois le **comportement retenu**.
 * Ces arbitrages sont des décisions de conception : ils doivent être verrouillés
 * par un test, sinon un développeur les « corrigera » de bonne foi et le moteur
 * cessera de dire ce que le document annonce.
 *
 * Un test par arbitrage, avec la référence du paragraphe correspondant.
 */

import { describe, expect, it } from 'vitest';

import { calculerBesoinsEauGravitaire, calculerBesoinsEauSousPression } from '../../src/engine/commun/besoins-eau.js';
import { calculerIrrigationsSousPression } from '../../src/engine/commun/irrigations.js';
import { calculerCanalManning } from '../../src/engine/gravitaire/canaux-manning.js';
import { calculerChristiansen } from '../../src/engine/sous-pression/christiansen.js';
import { lignesChristiansen } from '../../src/engine/tables/christiansen.js';

import {
  attendreMessageMetierFrancais,
  attendreReference,
  attraperErreurMoteur,
  entreesBesoinsEauGravitaireReference,
} from './aide-moteur.js';

/** Calendrier simple : 12 mois identiques, paramétrable mois par mois. */
function moisUniformes(surcharge: Partial<Record<string, number>> = {}) {
  return Array.from({ length: 12 }, () => ({
    jours: 30,
    eto: 5,
    pe: 0,
    perc: 0,
    r: 0,
    ...surcharge,
  }));
}

describe('⚠️ MOTEUR-GRAVITAIRE.md §5 — le besoin assolé ne divise PAS par l’efficience', () => {
  it('l’efficience n’intervient pas dans le besoin assolé par défaut', () => {
    // L'en-tête du classeur annonce BEb = Σ[A%×Ben]/E, mais la formule
    // réellement implémentée ne divise pas. Le moteur reproduit le classeur.
    const sansOption = calculerBesoinsEauGravitaire(entreesBesoinsEauGravitaireReference())
      .resultats;
    const avecEfficienceFournie = calculerBesoinsEauGravitaire({
      ...entreesBesoinsEauGravitaireReference(),
      efficience: 70,
    }).resultats;

    // Fournir E sans activer l'option ne change strictement rien.
    attendreReference(avecEfficienceFournie.bEnTotal, sansOption.bEnTotal);
    attendreReference(avecEfficienceFournie.besoinNetDePointe, sansOption.besoinNetDePointe);
    expect(avecEfficienceFournie.diviseParEfficience).toBe(false);
    // Ce que le classeur nomme « BEb assolé » est bien un besoin NET.
    for (const mois of sansOption.parMois) {
      attendreReference(mois.besoinAssoleRetenu, mois.besoinNetAssole);
    }
  });

  it('la division par l’efficience reste possible, mais en option explicite', () => {
    const avecOption = calculerBesoinsEauGravitaire({
      ...entreesBesoinsEauGravitaireReference(),
      diviserParEfficience: true,
      efficience: 70,
    }).resultats;

    expect(avecOption.diviseParEfficience).toBe(true);
    const juillet = avecOption.parMois[6];
    expect(juillet).toBeDefined();
    if (juillet === undefined) return;
    // Le besoin net publié reste inchangé ; seule la grandeur « retenue » divise.
    attendreReference(juillet.besoinNetAssole, 201.5, 1);
    attendreReference(juillet.besoinAssoleRetenu, 201.5 / 0.7, 1);
    // Et le total du cycle continue de sommer les besoins NETS.
    attendreReference(avecOption.bEnTotal, 619.8875, 4);
  });

  it('demander la division sans fournir l’efficience est refusé, pas deviné', () => {
    const erreur = attraperErreurMoteur(() =>
      calculerBesoinsEauGravitaire({
        ...entreesBesoinsEauGravitaireReference(),
        diviserParEfficience: true,
      }),
    );
    expect(erreur.code).toBe('EFFICIENCE_MANQUANTE');
    attendreMessageMetierFrancais(erreur);
  });
});

describe('⚠️ MOTEUR-GRAVITAIRE.md §5 — le besoin gravitaire est plafonné à 0', () => {
  it('un mois où la pluie dépasse les besoins donne 0, jamais une valeur négative', () => {
    // ETcrop × jours = 1 × 5 × 30 = 150 mm ; pluie efficace = 400 mm.
    const resultat = calculerBesoinsEauGravitaire({
      at: 10,
      cultures: [{ nom: 'Maïs', surface: 10, kc: Array.from({ length: 12 }, () => 1) }],
      mois: moisUniformes({ pe: 400 }),
    }).resultats;

    for (const mois of resultat.parMois) {
      expect(mois.besoinNetAssole).toBe(0);
      expect(mois.benParCulture[0]).toBe(0);
    }
    expect(resultat.bEnTotal).toBe(0);
    expect(resultat.besoinNetDePointe).toBe(0);
    // Le cas est signalé : un périmètre sans aucun besoin doit alerter.
    const codes = calculerBesoinsEauGravitaire({
      at: 10,
      cultures: [{ nom: 'Maïs', surface: 10, kc: Array.from({ length: 12 }, () => 1) }],
      mois: moisUniformes({ pe: 400 }),
    }).avertissements.map((a) => a.code);
    expect(codes).toContain('AUCUN_BESOIN');
  });

  it('le plafonnement s’applique culture par culture, avant la pondération', () => {
    // Culture 1 très demandeuse, culture 2 excédentaire en pluie : la seconde
    // ne doit pas « subventionner » la première par une valeur négative.
    const resultat = calculerBesoinsEauGravitaire({
      at: 100,
      cultures: [
        { nom: 'Exigeante', surface: 50, kc: Array.from({ length: 12 }, () => 2) },
        { nom: 'Sobre', surface: 50, kc: Array.from({ length: 12 }, () => 0.1) },
      ],
      mois: moisUniformes({ pe: 100 }),
    }).resultats;

    const janvier = resultat.parMois[0];
    expect(janvier).toBeDefined();
    if (janvier === undefined) return;
    // Culture 1 : 2 × 5 × 30 − 100 = 200 ; culture 2 : 0,1 × 5 × 30 − 100 = −85 → 0.
    attendreReference(janvier.benParCulture[0] as number, 200);
    expect(janvier.benParCulture[1]).toBe(0);
    // Assolé = 0,5 × 200 + 0,5 × 0 = 100, et non 0,5 × 200 + 0,5 × (−85) = 57,5.
    attendreReference(janvier.besoinNetAssole, 100);
  });
});

describe('⚠️ MOTEUR-SOUS-PRESSION.md §3 — pas de plafonnement au mois, mais dans les totaux', () => {
  const resultat = calculerBesoinsEauSousPression({
    at: 10,
    ea: 90,
    mois: moisUniformes().map((mois, index) => ({
      ...mois,
      kc: 1,
      // Un seul mois excédentaire : 1 × 5 × 30 = 150 mm, pluie 250 mm → −100.
      pe: index === 8 ? 250 : 0,
    })),
  });

  it('le besoin mensuel conserve sa valeur négative (excédent de pluie)', () => {
    const septembre = resultat.resultats.parMois[8];
    expect(septembre).toBeDefined();
    if (septembre === undefined) return;
    attendreReference(septembre.ben, -100);
    expect(septembre.excedentaire).toBe(true);
    // Le besoin brut mensuel suit, lui aussi non plafonné.
    attendreReference(septembre.beb, -100 / 0.9);
  });

  it('mais la somme du cycle plafonne ce mois à 0', () => {
    // 11 mois à 150 mm + 1 mois plafonné à 0.
    attendreReference(resultat.resultats.bEnTotal, 11 * 150);
    // Le total « méthode du classeur » conserve le négatif, pour comparaison.
    attendreReference(resultat.resultats.bEnTotalClasseur, 11 * 150 - 100);
    expect(resultat.resultats.bEnTotal).toBeGreaterThan(resultat.resultats.bEnTotalClasseur);
  });

  it('et la recherche du mois de pointe ignore les mois excédentaires', () => {
    // Si le mois excédentaire était le seul « extremum », la pointe serait fausse.
    const excedentSeul = calculerBesoinsEauSousPression({
      at: 10,
      ea: 90,
      mois: moisUniformes().map((mois, index) => ({
        ...mois,
        kc: index === 8 ? 1 : 0,
        pe: index === 8 ? 250 : 0,
      })),
    }).resultats;
    // Tous les mois valent 0 sauf septembre à −100 : la pointe reste 0, pas −100.
    expect(excedentSeul.besoinNetDePointe).toBe(0);
    expect(excedentSeul.bEnTotal).toBe(0);
  });

  it('signale explicitement les mois excédentaires à l’utilisateur', () => {
    const codes = resultat.avertissements.map((a) => a.code);
    expect(codes).toContain('MOIS_EXCEDENTAIRES');
    const message = resultat.avertissements.find((a) => a.code === 'MOIS_EXCEDENTAIRES')?.message;
    expect(message).toContain('pluie');
  });
});

describe('⚠️ MOTEUR-SOUS-PRESSION.md §4 — IC ≤ 0 refuse le calcul', () => {
  it('refuse un cycle nul ou négatif avec un message explicite', () => {
    // Dose nette faible devant le besoin de pointe → ESP < 1 j → IC ≤ 0.
    const erreur = attraperErreurMoteur(() =>
      calculerIrrigationsSousPression({
        dnRetenue: 3,
        bEnTotal: 500,
        besoinNetDePointe: 186,
        joursMoisDePointe: 31,
      }),
    );

    expect(erreur.code).toBe('CYCLE_IRRIGATION_NON_PHYSIQUE');
    expect(erreur.categorie).toBe('CALCUL_IMPOSSIBLE');
    expect(erreur.champ).toBe('dnRetenue');
    attendreMessageMetierFrancais(erreur);
    // Le message doit dire quoi faire, pas seulement constater.
    expect(erreur.message).toMatch(/dose nette/i);
  });

  it('refuse aussi le cas limite exact IC = 0 (ESP = 1 jour)', () => {
    // Ben = 6 mm/j sur 30 j = 180 mm ; Dn = 6 mm → ESP = 1 j → IC = 0.
    const erreur = attraperErreurMoteur(() =>
      calculerIrrigationsSousPression({
        dnRetenue: 6,
        bEnTotal: 500,
        besoinNetDePointe: 180,
        joursMoisDePointe: 30,
      }),
    );
    expect(erreur.code).toBe('CYCLE_IRRIGATION_NON_PHYSIQUE');
  });

  it('avertit — sans refuser — lorsque 0 < IC < 1', () => {
    // Ben = 6 mm/j ; Dn = 9 mm → ESP = 1,5 j → IC = 0,5 j.
    const resultat = calculerIrrigationsSousPression({
      dnRetenue: 9,
      bEnTotal: 500,
      besoinNetDePointe: 180,
      joursMoisDePointe: 30,
    });
    attendreReference(resultat.resultats.ic, 0.5);
    expect(resultat.avertissements.map((a) => a.code)).toContain('CYCLE_INFERIEUR_A_UN_JOUR');
  });

  it('ne plafonne PAS silencieusement à 1 jour, contrairement au gravitaire', () => {
    const resultat = calculerIrrigationsSousPression({
      dnRetenue: 9,
      bEnTotal: 500,
      besoinNetDePointe: 180,
      joursMoisDePointe: 30,
    }).resultats;
    expect(resultat.ic).toBeLessThan(1);
  });
});

describe('⚠️ MOTEUR-GRAVITAIRE.md §9 — Manning : le tirant d’eau est résolu numériquement', () => {
  const entrees = { qCible: 0.09, natureParoi: 'TERRE_LISSE', b: 0.3, m: 1, i: 0.001 };

  it('converge et annule pratiquement l’écart résiduel du classeur', () => {
    const resultat = calculerCanalManning(entrees).resultats;

    expect(resultat.sourceH).toBe('RESOLU');
    expect(resultat.convergence).toBe(true);
    expect(resultat.iterations).toBeGreaterThan(0);
    // Le classeur, ajusté à la main, laissait −0,000285 m³/s d'écart. La
    // résolution numérique descend sous 10⁻⁹ en relatif.
    expect(Math.abs(resultat.ecartRelatif)).toBeLessThan(1e-9);
    // Le tirant d'eau reste très proche de celui trouvé à la main (0,29639 m).
    expect(Math.abs(resultat.h - 0.29639)).toBeLessThan(1e-3);
  });

  it('expose toujours l’écart résiduel, même quand il est nul', () => {
    const resultat = calculerCanalManning(entrees).resultats;
    expect(typeof resultat.ecart).toBe('number');
    expect(Number.isFinite(resultat.ecart)).toBe(true);
    attendreReference(resultat.qCalcule - 0.09, resultat.ecart);
  });

  it('converge sur une large gamme de géométries et de débits', () => {
    // Q(h) est strictement croissante : la dichotomie doit converger partout.
    for (const qCible of [0.001, 0.01, 0.09, 1, 12, 100]) {
      for (const b of [0, 0.3, 2]) {
        for (const m of [0, 1, 2.5]) {
          if (b === 0 && m === 0) continue;
          const resultat = calculerCanalManning({
            qCible,
            natureParoi: 'TERRE_LISSE',
            b,
            m,
            i: 0.001,
          }).resultats;
          expect(
            resultat.convergence,
            `non convergé pour Q=${qCible} b=${b} m=${m} (écart relatif ${resultat.ecartRelatif})`,
          ).toBe(true);
          expect(Math.abs(resultat.ecartRelatif)).toBeLessThan(1e-9);
          expect(resultat.h).toBeGreaterThan(0);
        }
      }
    }
  });

  it('signale une résolution non convergée plutôt que de rendre un résultat muet', () => {
    // Une seule itération de dichotomie ne peut pas atteindre la tolérance :
    // le résultat doit être marqué non convergé ET porter un avertissement.
    const resultat = calculerCanalManning({ ...entrees, iterationsMax: 1 });
    expect(resultat.resultats.convergence).toBe(false);
    expect(resultat.avertissements.map((a) => a.code)).toContain('RESOLUTION_NON_CONVERGEE');
  });

  it('ne calcule pas la revanche là où la source ne donne pas de coefficient', () => {
    // Savva et Frenken ne donnent C que pour Q ≤ 0,5 et Q > 80 m³/s.
    const intermediaire = calculerCanalManning({
      qCible: 10,
      natureParoi: 'TERRE_LISSE',
      b: 2,
      m: 1,
      i: 0.001,
    });
    expect(intermediaire.resultats.revanche).toBeNull();
    expect(intermediaire.avertissements.map((a) => a.code)).toContain('REVANCHE_NON_DEFINIE');
  });
});

describe('⚠️ MOTEUR-SOUS-PRESSION.md §10 — Christiansen : plage et valeurs illisibles', () => {
  it('refuse d’interpoler hors de la plage 5 ≤ n ≤ 100 et renvoie vers la formule continue', () => {
    for (const n of [1, 4, 101, 500]) {
      const erreur = attraperErreurMoteur(() =>
        calculerChristiansen({ n, materiau: 'PLASTIQUE', position: 'F1' }),
      );
      expect(erreur.code).toBe('HORS_PLAGE_INTERPOLATION');
      attendreMessageMetierFrancais(erreur);
      expect(erreur.message).toMatch(/formule continue/i);
    }
  });

  it('n’invente jamais une valeur « n.d. » de la table', () => {
    // n = 2 et n = 3 sont illisibles sur la source pour le plastique.
    for (const n of [2, 3]) {
      const erreur = attraperErreurMoteur(() =>
        calculerChristiansen({ n, materiau: 'PLASTIQUE', position: 'F1' }),
      );
      expect(erreur.code).toBe('VALEUR_TABULEE_INDISPONIBLE');
      expect(erreur.message).toMatch(/formule continue/i);
    }
    // Aluminium, position F2 : illisible pour n = 2 et n = 3 également.
    const aluminium = attraperErreurMoteur(() =>
      calculerChristiansen({ n: 2, materiau: 'ALUMINIUM', position: 'F2' }),
    );
    expect(aluminium.code).toBe('VALEUR_TABULEE_INDISPONIBLE');
  });

  it('lit les valeurs de la table qui sont, elles, lisibles hors plage d’interpolation', () => {
    // Aluminium F1 à n = 2 vaut 0,64 dans la source : c'est une lecture, pas une
    // interpolation, elle est donc légitime.
    const resultat = calculerChristiansen({ n: 2, materiau: 'ALUMINIUM', position: 'F1' })
      .resultats;
    attendreReference(resultat.f, 0.64);
    expect(resultat.source).toBe('TABULEE');
  });

  it('interpole linéairement entre deux lignes de la table', () => {
    // n = 7 entre 5 (0,469) et 10 (0,415) : 0,469 + (7−5)/(10−5) × (0,415−0,469).
    const resultat = calculerChristiansen({ n: 7, materiau: 'PLASTIQUE', position: 'F1' });
    attendreReference(resultat.resultats.f, 0.469 + (2 / 5) * (0.415 - 0.469));
    expect(resultat.resultats.source).toBe('INTERPOLEE');
    expect(resultat.avertissements.map((a) => a.code)).toContain('VALEUR_INTERPOLEE');
  });

  it('la table reproduit fidèlement la source, `n.d.` compris', () => {
    const lignes = lignesChristiansen();
    expect(lignes.map((ligne) => ligne.n)).toEqual([2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 100]);
    // Les cases illisibles sont bien `null`, jamais une valeur inventée.
    expect(lignes[0]?.PLASTIQUE).toEqual({ F1: null, F2: null, F3: null });
    expect(lignes[1]?.ALUMINIUM.F2).toBeNull();
    expect(lignes[5]?.PLASTIQUE.F1).toBe(0.389);
    expect(lignes[10]?.ALUMINIUM.F3).toBe(0.352);
  });

  it('reste une aide de contrôle : le calcul du réseau garde la formule continue', () => {
    const resultat = calculerChristiansen({ n: 20, materiau: 'PLASTIQUE', position: 'F1' });
    expect(resultat.avertissements.map((a) => a.code)).toContain('AIDE_DE_CONTROLE');
  });
});
