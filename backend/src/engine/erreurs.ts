/**
 * Erreurs du moteur de calcul.
 *
 * Deux familles, volontairement distinctes, parce qu'elles n'appellent pas la
 * même réaction côté interface :
 *
 *  - `ErreurValidation` — la **saisie** est invalide (champ manquant, hors
 *    plage, type incorrect). L'utilisateur doit corriger un champ précis.
 *    L'API doit répondre **400**.
 *
 *  - `ErreurCalculImpossible` — la saisie est formellement acceptable mais le
 *    calcul n'a **pas de sens physique** (division par zéro, cycle d'irrigation
 *    négatif, résolution numérique non convergée). L'API doit répondre **422**.
 *
 * Les deux dérivent de `ErreurCalcul`, qui porte le discriminant `categorie`.
 * Une couche HTTP peut donc se contenter de tester `categorie`.
 *
 * **Tous les messages sont en français et destinés à un ingénieur agronome**,
 * pas à un développeur : « la superficie irriguée par jour est nulle : vérifiez
 * le cycle d'irrigation », jamais « division by zero in capacite.ts:42 ».
 */

/** Discriminant stable, utilisable par la couche HTTP pour choisir le statut. */
export const CategorieErreur = {
  /** Saisie invalide → 400. */
  VALIDATION: 'VALIDATION',
  /** Calcul sans signification physique → 422. */
  CALCUL_IMPOSSIBLE: 'CALCUL_IMPOSSIBLE',
} as const;

export type CategorieErreurValue = (typeof CategorieErreur)[keyof typeof CategorieErreur];

/** Erreur de base du moteur. Ne pas lever directement : utiliser les sous-classes. */
export class ErreurCalcul extends Error {
  /** `VALIDATION` (→ 400) ou `CALCUL_IMPOSSIBLE` (→ 422). */
  readonly categorie: CategorieErreurValue;

  /** Code machine stable, en MAJUSCULES_SNAKE. L'interface peut s'y fier. */
  readonly code: string;

  /** Champ de saisie fautif, quand il est identifiable (`champ` du formulaire). */
  readonly champ: string | undefined;

  /** Détails structurés éventuels (liste d'erreurs zod, bornes attendues…). */
  readonly details: unknown;

  /** Marqueur robuste, y compris à travers les frontières de modules. */
  readonly estErreurMoteur = true as const;

  constructor(
    message: string,
    options: {
      categorie: CategorieErreurValue;
      code: string;
      champ?: string | undefined;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = 'ErreurCalcul';
    this.categorie = options.categorie;
    this.code = options.code;
    this.champ = options.champ;
    this.details = options.details;
    Error.captureStackTrace?.(this, ErreurCalcul);
  }
}

/** Saisie invalide → l'utilisateur doit corriger un champ. Statut HTTP 400. */
export class ErreurValidation extends ErreurCalcul {
  constructor(
    message: string,
    options: { code?: string; champ?: string | undefined; details?: unknown } = {},
  ) {
    super(message, {
      categorie: CategorieErreur.VALIDATION,
      code: options.code ?? 'SAISIE_INVALIDE',
      champ: options.champ,
      details: options.details,
    });
    this.name = 'ErreurValidation';
  }
}

/** Calcul sans signification physique. Statut HTTP 422. */
export class ErreurCalculImpossible extends ErreurCalcul {
  constructor(
    message: string,
    options: { code?: string; champ?: string | undefined; details?: unknown } = {},
  ) {
    super(message, {
      categorie: CategorieErreur.CALCUL_IMPOSSIBLE,
      code: options.code ?? 'CALCUL_IMPOSSIBLE',
      champ: options.champ,
      details: options.details,
    });
    this.name = 'ErreurCalculImpossible';
  }
}

/** Reconnaît une erreur du moteur sans dépendre de `instanceof`. */
export function estErreurMoteur(erreur: unknown): erreur is ErreurCalcul {
  return (
    erreur instanceof ErreurCalcul ||
    (typeof erreur === 'object' &&
      erreur !== null &&
      (erreur as { estErreurMoteur?: unknown }).estErreurMoteur === true)
  );
}

/**
 * Garde-fou de division.
 *
 * Toute division dont le dénominateur peut être nul passe par ici : c'est la
 * garantie qu'aucune formule du moteur ne renvoie `Infinity` ou `NaN`.
 */
export function diviser(
  numerateur: number,
  denominateur: number,
  contexte: { message: string; code: string; champ?: string },
): number {
  if (!Number.isFinite(denominateur) || denominateur === 0) {
    throw new ErreurCalculImpossible(contexte.message, {
      code: contexte.code,
      champ: contexte.champ,
    });
  }
  const resultat = numerateur / denominateur;
  if (!Number.isFinite(resultat)) {
    throw new ErreurCalculImpossible(contexte.message, {
      code: contexte.code,
      champ: contexte.champ,
    });
  }
  return resultat;
}

/**
 * Filet de sécurité final : vérifie qu'un résultat est un nombre fini.
 *
 * Appelé sur les grandeurs publiées par les modules. Si une combinaison
 * d'entrées imprévue produit `NaN` ou `Infinity`, l'utilisateur reçoit une
 * erreur métier plutôt qu'un résultat aberrant affiché dans un rapport PDF.
 */
export function exigerFini(valeur: number, libelle: string, champ?: string): number {
  if (!Number.isFinite(valeur)) {
    throw new ErreurCalculImpossible(
      `Le calcul de « ${libelle} » n'aboutit pas à une valeur exploitable : vérifiez les données saisies.`,
      { code: 'RESULTAT_NON_FINI', champ },
    );
  }
  return valeur;
}
