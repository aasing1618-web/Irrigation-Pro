/**
 * Types partagés du moteur : enveloppe de résultat et description des modules.
 *
 * Deux besoins distincts, volontairement séparés :
 *
 *  1. **L'enveloppe de résultat** (`ResultatMoteur`) — ce que renvoie chaque
 *     fonction de calcul. Elle porte les valeurs **brutes** (nombres nus), la
 *     version du moteur, et les avertissements métier. Les nombres restent nus
 *     parce qu'ils doivent pouvoir être rechaînés d'un module à l'autre, stockés
 *     en base, et réutilisés tels quels par la génération de PDF en Vague 3.
 *
 *  2. **Le catalogue** (`DescriptionModule`) — la description des champs de
 *     saisie *et des sorties* (libellé, unité, plage, aide). C'est lui qui
 *     permet à l'application de construire ses formulaires et d'afficher chaque
 *     résultat avec son unité, **sans jamais recevoir un seul coefficient
 *     métier** (décision D-007).
 *
 * Le catalogue ne contient donc que des métadonnées d'affichage. Aucune valeur
 * de table de référence (n de Manning, C de Hazen-Williams, Dn par type de sol…)
 * n'y figure : ces tables ne sortent du serveur que sous forme de couples
 * `{ cle, libelle }` via `listerReferences()`.
 */

import { ENGINE_VERSION } from './version.js';

/** Enveloppe standard de tout résultat produit par le moteur. */
export interface ResultatMoteur<T> {
  /** Code du module ayant produit le résultat. */
  readonly module: string;
  /** Version du moteur — à archiver en base avec le calcul. */
  readonly engineVersion: string;
  /** Valeurs calculées, nombres nus (unités décrites par le catalogue). */
  readonly resultats: T;
  /** Messages métier à mettre en évidence (contrôles hors plage, hypothèses…). */
  readonly avertissements: Avertissement[];
}

/** Un avertissement métier. Ce n'est pas une erreur : le calcul a abouti. */
export interface Avertissement {
  /** Code machine stable. */
  readonly code: string;
  /** Message en français, affichable tel quel. */
  readonly message: string;
  /** `info` : information ; `attention` : à vérifier avant de dimensionner. */
  readonly gravite: 'info' | 'attention';
}

/** Fabrique un avertissement `attention` (contrôle hors plage, incohérence). */
export function attention(code: string, message: string): Avertissement {
  return { code, message, gravite: 'attention' };
}

/** Fabrique un avertissement `info` (hypothèse retenue, rappel de méthode). */
export function info(code: string, message: string): Avertissement {
  return { code, message, gravite: 'info' };
}

/** Enveloppe un résultat de module. */
export function envelopper<T>(
  module: string,
  resultats: T,
  avertissements: Avertissement[] = [],
): ResultatMoteur<T> {
  return { module, engineVersion: ENGINE_VERSION, resultats, avertissements };
}

/**
 * Types de champ reconnus par le moteur de formulaire de l'application.
 *
 * `tableau` signale une saisie répétée (12 mois de climat, liste de tronçons,
 * assolement) : elle demande une grille dédiée, pas un simple champ. L'aide
 * (`aide`) décrit alors la structure attendue.
 */
export type TypeChamp = 'nombre' | 'texte' | 'liste' | 'booleen' | 'tableau';

/** Description d'un champ de saisie, pour construire un formulaire. */
export interface ChampSaisie {
  /** Nom technique du champ, tel qu'attendu dans l'objet d'entrée. */
  readonly champ: string;
  readonly libelle: string;
  readonly type: TypeChamp;
  /** Unité affichée (`mm`, `l/s`, `%`, `m³/s`…). `null` si sans dimension. */
  readonly unite: string | null;
  readonly obligatoire: boolean;
  readonly min?: number;
  readonly max?: number;
  /** Pas de saisie suggéré pour un champ numérique. */
  readonly pas?: number;
  readonly defaut?: number | string | boolean;
  /** Nom de la table de référence alimentant la liste (`type: 'liste'`). */
  readonly table?: string;
  readonly aide?: string;
}

/** Description d'une grandeur de sortie, pour l'afficher avec son unité. */
export interface ChampSortie {
  /** Chemin de la valeur dans `resultats` (notation pointée si imbriquée). */
  readonly champ: string;
  readonly libelle: string;
  /** Unité affichée. `null` si sans dimension (nombre d'arrosages, ratio…). */
  readonly unite: string | null;
  /** `true` pour les 2-3 grandeurs qui résument le module. */
  readonly principal: boolean;
  /** Regroupement d'affichage (« Dose », « Contrôles », « Pompe »…). */
  readonly groupe?: string;
  readonly aide?: string;
}

/**
 * Fiche complète d'un module, servie par `listerModules()`.
 *
 * Les noms de champs suivent `docs/API-VAGUE-2.md` §3 (`code`, `famille`, `nom`,
 * `entrees`). `origine`, `description` et `sorties` sont des ajouts : la fiche
 * est un sur-ensemble du contrat, jamais un écart.
 */
export interface DescriptionModule {
  readonly code: string;
  /** Intitulé affiché du module. */
  readonly nom: string;
  readonly famille: 'GRAVITAIRE' | 'SOUS_PRESSION' | 'COMMUN';
  /** Numéro de la feuille d'origine dans le classeur (traçabilité). */
  readonly origine: string;
  readonly description: string;
  readonly entrees: readonly ChampSaisie[];
  /**
   * Sorties scalaires principales. Les structures imbriquées (tableau mensuel,
   * liste de tronçons) ne sont pas décrites ici : elles ont leur propre
   * présentation dans l'application.
   */
  readonly sorties: readonly ChampSortie[];
}
