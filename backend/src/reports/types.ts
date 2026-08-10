/**
 * Modèle de contenu d'un rapport.
 *
 * Ce fichier est la **frontière** entre les deux moitiés du générateur :
 *
 *   collecte.ts  ──▶  ContenuRapport  ──▶  document.ts
 *   (base + moteur)   (données pures)      (dessin PDF)
 *
 * `ContenuRapport` ne contient que du texte déjà mis en forme et des valeurs
 * déjà converties. Conséquence utile : `document.ts` ne connaît ni la base de
 * données, ni le moteur de calcul, et se teste avec un objet littéral ;
 * `collecte.ts` ne connaît pas `pdfkit`.
 *
 * Conséquence importante pour la décision **D-007** : aucune formule, aucun
 * coefficient métier ne peut se glisser dans le document, puisque seul ce
 * modèle-là y entre — et qu'il ne comporte aucun champ pour en accueillir.
 */

/** Une grandeur affichée : intitulé, valeur mise en forme, unité. */
export interface LigneValeur {
  readonly libelle: string;
  readonly valeur: string;
  readonly unite: string;
  /** Grandeur de synthèse : mise en évidence dans le tableau des résultats. */
  readonly principal?: boolean;
}

/** Une saisie répétée (calendrier climatique, liste de tronçons, assolement). */
export interface TableauDonnees {
  readonly titre: string;
  readonly colonnes: readonly string[];
  readonly lignes: ReadonlyArray<readonly string[]>;
}

/** Un avertissement métier, repris tel quel du moteur. */
export interface AvertissementRapport {
  readonly code: string;
  readonly message: string;
  readonly gravite: 'info' | 'attention';
}

/** Tout ce que le document dit d'un calcul archivé. */
export interface BlocCalcul {
  readonly id: string;
  readonly module: string;
  readonly nom: string;
  readonly description: string | null;
  readonly calculeLe: Date;
  readonly engineVersion: string;
  readonly hypotheses: readonly LigneValeur[];
  readonly tableauxHypotheses: readonly TableauDonnees[];
  readonly resultats: readonly LigneValeur[];
  readonly avertissements: readonly AvertissementRapport[];
  /**
   * Remarques de traçabilité destinées au lecteur : version du moteur
   * différente de celle en service, avertissements non reproductibles…
   * Elles sont affichées, jamais tues.
   */
  readonly remarques: readonly string[];
}

/** L'en-tête administratif du document (page de garde). */
export interface EnteteRapport {
  readonly reference: string;
  readonly genereLe: Date;
  readonly projetNom: string;
  readonly clientFinal: string | null;
  readonly localisation: string | null;
  readonly descriptionProjet: string | null;
  readonly auteurNom: string;
  readonly auteurSociete: string | null;
  readonly auteurEmail: string;
}

/** Le contenu complet, prêt à dessiner. */
export interface ContenuRapport {
  readonly entete: EnteteRapport;
  readonly calculs: readonly BlocCalcul[];
  readonly notes: string | null;
  /** Version du moteur en service au moment de la génération (pied de page). */
  readonly moteurVersion: string;
}

/** Ce que l'on conserve à côté du PDF pour savoir ce qu'il contient. */
export interface ManifesteRapport {
  readonly reference: string;
  readonly genereLe: string;
  readonly projectId: string;
  readonly calculIds: readonly string[];
  readonly nombreCalculs: number;
  readonly moteurVersion: string;
  readonly nomFichier: string;
}
