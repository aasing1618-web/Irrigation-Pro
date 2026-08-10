/**
 * Filet de sécurité générique : **aucun module du moteur ne renvoie `NaN` ni
 * `Infinity`**, quelles que soient les entrées.
 *
 * Ce fichier ne teste pas une formule en particulier : il balaie **tous les
 * modules du registre**, chacun avec un jeu d'entrées valides dont on dégrade
 * un champ à la fois (zéro, négatif, minuscule, démesuré, hors plage). Pour
 * chaque exécution, une seule chose est exigée :
 *
 *  - soit le module renvoie un résultat dont **toutes** les valeurs numériques
 *    sont finies — y compris dans les tableaux mensuels et les listes de
 *    tronçons ;
 *  - soit il lève une **erreur métier lisible en français**.
 *
 * Jamais `Infinity` dans un rapport PDF remis à un client, jamais `NaN` dans un
 * dimensionnement. C'est cette règle qui a révélé le débordement de `√(1 + m²)`
 * dans le périmètre mouillé du canal trapézoïdal.
 *
 * Un module ajouté au registre sans jeu d'entrées dans `aide-moteur.ts` fait
 * échouer le premier test : c'est délibéré, c'est ce qui étend automatiquement
 * le filet aux modules futurs.
 */

import { describe, expect, it } from 'vitest';

import { calculer, listerModules, listerReferences, listerTablesDeReference } from '../../src/engine/index.js';
import { estErreurMoteur } from '../../src/engine/erreurs.js';

import {
  ENTREES_VALIDES,
  attendreMessageMetierFrancais,
  feuillesNonFinies,
} from './aide-moteur.js';

/** Valeurs dégradées appliquées à chaque champ, une à la fois. */
const VALEURS_DEGRADEES: readonly unknown[] = [
  0,
  -1,
  -0.0001,
  1e-12,
  1e12,
  1e300,
  0.5,
  101,
  32,
  Number.MAX_SAFE_INTEGER,
];

/** Champs numériques d'un tronçon de réseau, testés séparément. */
const CHAMPS_TRONCON = ['diametreMm', 'debitLitresParSeconde', 'longueurM', 'nombreSorties', 'c'];

/** Champs numériques d'un mois de calendrier climatique. */
const CHAMPS_MOIS = ['jours', 'eto', 'pe', 'perc', 'r', 'kc', 'besoinNetAssole'];

interface Execution {
  readonly etiquette: string;
  readonly module: string;
  readonly entree: unknown;
}

/** Exécute un module et vérifie l'invariant. Renvoie `true` si un calcul a abouti. */
function verifierInvariant({ etiquette, module, entree }: Execution): boolean {
  try {
    const resultat = calculer(module, entree);
    const fautives = feuillesNonFinies(resultat.resultats);
    expect(fautives, `${etiquette} → valeurs non finies : ${fautives.join(', ')}`).toEqual([]);
    return true;
  } catch (erreur) {
    if (!estErreurMoteur(erreur)) {
      throw new Error(`${etiquette} → erreur non métier : ${String(erreur)}`);
    }
    attendreMessageMetierFrancais(erreur);
    return false;
  }
}

describe('filet de sécurité — couverture du registre', () => {
  it('chaque module du registre dispose d’un jeu d’entrées valides', () => {
    const sansFixture = listerModules()
      .map((description) => description.code)
      .filter((code) => ENTREES_VALIDES[code] === undefined);

    expect(
      sansFixture,
      `Modules sans jeu d’entrées dans tests/engine/aide-moteur.ts : ${sansFixture.join(', ')}. ` +
        'Ajoutez-le, sinon le module échappe au filet de sécurité.',
    ).toEqual([]);
  });

  it('chaque jeu d’entrées valides produit bien un résultat entièrement fini', () => {
    for (const description of listerModules()) {
      const entree = ENTREES_VALIDES[description.code];
      const resultat = calculer(description.code, entree);
      expect(
        feuillesNonFinies(resultat.resultats),
        `${description.code} : le cas nominal produit des valeurs non finies`,
      ).toEqual([]);
      expect(resultat.module).toBe(description.code);
      expect(resultat.engineVersion).toMatch(/\d/);
    }
  });
});

describe('filet de sécurité — champs de premier niveau', () => {
  it('aucun module ne renvoie NaN ou Infinity, quelle que soit la valeur dégradée', () => {
    let executions = 0;
    let calculsAboutis = 0;

    for (const description of listerModules()) {
      const base = ENTREES_VALIDES[description.code];
      if (base === undefined) continue;

      for (const champ of Object.keys(base)) {
        for (const valeur of VALEURS_DEGRADEES) {
          executions += 1;
          const aAbouti = verifierInvariant({
            etiquette: `${description.code}.${champ} = ${String(valeur)}`,
            module: description.code,
            entree: { ...base, [champ]: valeur },
          });
          if (aAbouti) calculsAboutis += 1;
        }
      }
    }

    // Garde-fou du garde-fou : si tout échouait en validation, le balayage ne
    // prouverait rien. On exige qu'une part significative des cas aboutisse.
    expect(executions).toBeGreaterThan(500);
    expect(calculsAboutis).toBeGreaterThan(executions / 10);
  });

  it('aucun module ne renvoie NaN ou Infinity sur une valeur non numérique', () => {
    for (const description of listerModules()) {
      const base = ENTREES_VALIDES[description.code];
      if (base === undefined) continue;

      for (const champ of Object.keys(base)) {
        for (const valeur of [null, 'abc', Number.NaN, Number.POSITIVE_INFINITY, {}, []]) {
          verifierInvariant({
            etiquette: `${description.code}.${champ} = ${String(valeur)}`,
            module: description.code,
            entree: { ...base, [champ]: valeur },
          });
        }
      }
    }
  });
});

describe('filet de sécurité — champs imbriqués', () => {
  it('les tronçons du réseau ne produisent jamais de valeur non finie', () => {
    const base = ENTREES_VALIDES.RESEAU_HAZEN_WILLIAMS as { troncons: Record<string, unknown>[] };
    const modele = base.troncons[0] as Record<string, unknown>;

    for (const champ of CHAMPS_TRONCON) {
      for (const valeur of VALEURS_DEGRADEES) {
        verifierInvariant({
          etiquette: `tronçon.${champ} = ${String(valeur)}`,
          module: 'RESEAU_HAZEN_WILLIAMS',
          entree: { troncons: [{ ...modele, [champ]: valeur }] },
        });
      }
    }
  });

  it('les calendriers mensuels ne produisent jamais de valeur non finie', () => {
    const modules = [
      'BESOINS_EAU_GRAVITAIRE',
      'BESOINS_EAU_SOUS_PRESSION',
      'IRRIGATIONS_GRAVITAIRE',
    ];

    for (const module of modules) {
      const base = ENTREES_VALIDES[module] as Record<string, unknown>;
      const mois = base.mois as Record<string, unknown>[];
      const modele = mois[0] as Record<string, unknown>;

      for (const champ of CHAMPS_MOIS) {
        if (!(champ in modele)) continue;
        for (const valeur of VALEURS_DEGRADEES) {
          verifierInvariant({
            etiquette: `${module}.mois.${champ} = ${String(valeur)}`,
            module,
            entree: {
              ...base,
              mois: mois.map((element) => ({ ...element, [champ]: valeur })),
            },
          });
        }
      }
    }
  });

  it('l’assolement gravitaire ne produit jamais de valeur non finie', () => {
    const base = ENTREES_VALIDES.BESOINS_EAU_GRAVITAIRE as Record<string, unknown>;
    const cultures = base.cultures as Array<Record<string, unknown>>;

    for (const valeur of VALEURS_DEGRADEES) {
      verifierInvariant({
        etiquette: `culture.surface = ${String(valeur)}`,
        module: 'BESOINS_EAU_GRAVITAIRE',
        entree: {
          ...base,
          cultures: cultures.map((culture) => ({ ...culture, surface: valeur })),
        },
      });
      verifierInvariant({
        etiquette: `culture.kc = ${String(valeur)}`,
        module: 'BESOINS_EAU_GRAVITAIRE',
        entree: {
          ...base,
          cultures: cultures.map((culture) => ({
            ...culture,
            kc: Array.from({ length: 12 }, () => valeur),
          })),
        },
      });
    }
  });
});

describe('filet de sécurité — surface publique du moteur', () => {
  it('refuse un module inconnu avec un message en français', () => {
    let echec: unknown;
    try {
      calculer('MODULE_IMAGINAIRE', {});
    } catch (erreur) {
      echec = erreur;
    }
    expect(estErreurMoteur(echec)).toBe(true);
    if (!estErreurMoteur(echec)) return;
    expect(echec.code).toBe('MODULE_INCONNU');
    attendreMessageMetierFrancais(echec);
  });

  it('refuse une table de référence inconnue avec un message en français', () => {
    let echec: unknown;
    try {
      listerReferences('table-imaginaire');
    } catch (erreur) {
      echec = erreur;
    }
    expect(estErreurMoteur(echec)).toBe(true);
    if (!estErreurMoteur(echec)) return;
    expect(echec.code).toBe('TABLE_REFERENCE_INCONNUE');
  });

  it('les tables de référence n’exposent que des couples clé / libellé', () => {
    // Décision D-007 : aucun coefficient métier ne sort du serveur.
    for (const table of listerTablesDeReference()) {
      for (const entree of listerReferences(table)) {
        expect(Object.keys(entree).sort()).toEqual(['cle', 'libelle']);
        expect(typeof entree.cle).toBe('string');
        expect(typeof entree.libelle).toBe('string');
      }
    }
  });

  it('le catalogue des modules ne contient aucun coefficient métier', () => {
    // Les descripteurs ne portent que des métadonnées d'affichage : le nom des
    // tables, jamais leur contenu.
    for (const description of listerModules()) {
      for (const champ of description.entrees) {
        if (champ.type !== 'liste') continue;
        expect(champ.table).toBeDefined();
        expect(listerTablesDeReference()).toContain(champ.table);
      }
    }
  });
});
