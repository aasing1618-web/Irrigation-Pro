/**
 * Pont entre `zod` et les erreurs du moteur.
 *
 * Chaque module expose un schéma `zod`. Toute entrée passe par `analyser()`,
 * qui transforme un échec de validation en `ErreurValidation` portant le
 * **premier champ fautif** — c'est ce champ que l'application met en évidence.
 */

import { z } from 'zod';

import { ErreurValidation } from './erreurs.js';

/**
 * Traduction des messages par défaut de `zod`, qui sont en anglais.
 *
 * Sans elle, une saisie de type incorrect remonte jusqu'à l'utilisateur sous la
 * forme « Invalid enum value. Expected 'PLASTIQUE' | 'ALUMINIUM', received
 * 'BAMBOU' » : illisible pour un ingénieur agronome, et contraire à la règle
 * « tous les messages du moteur sont en français » (voir `erreurs.ts`).
 *
 * Les messages explicites déjà passés aux schémas (`nombrePositif`,
 * `joursDuMois`…) restent prioritaires : `zod` n'appelle cette carte que
 * lorsqu'aucun message n'a été fourni.
 */
const TYPES_EN_FRANCAIS: Readonly<Record<string, string>> = {
  string: 'du texte',
  number: 'un nombre',
  boolean: 'oui ou non',
  array: 'une liste',
  object: 'un ensemble de valeurs',
  date: 'une date',
  integer: 'un nombre entier',
};

export const carteErreursFrancaise: z.ZodErrorMap = (probleme, contexte) => {
  switch (probleme.code) {
    case z.ZodIssueCode.invalid_type:
      if (probleme.received === 'undefined' || probleme.received === 'null') {
        return { message: 'ce champ est obligatoire' };
      }
      return {
        message:
          TYPES_EN_FRANCAIS[probleme.expected] === undefined
            ? 'la valeur saisie n’est pas reconnue pour ce champ'
            : `doit être ${TYPES_EN_FRANCAIS[probleme.expected] as string}`,
      };

    case z.ZodIssueCode.invalid_enum_value:
      return {
        message: `valeur non reconnue : choisissez parmi ${probleme.options.join(', ')}`,
      };

    case z.ZodIssueCode.unrecognized_keys:
      return {
        message: `champ non attendu : ${probleme.keys.join(', ')}`,
      };

    case z.ZodIssueCode.too_small:
      if (probleme.type === 'array') {
        return { message: `doit compter au moins ${String(probleme.minimum)} élément(s)` };
      }
      if (probleme.type === 'string') {
        return { message: 'doit être renseigné' };
      }
      return {
        message: probleme.inclusive
          ? `ne peut pas être inférieur à ${String(probleme.minimum)}`
          : `doit être strictement supérieur à ${String(probleme.minimum)}`,
      };

    case z.ZodIssueCode.too_big:
      if (probleme.type === 'array') {
        return { message: `ne peut pas compter plus de ${String(probleme.maximum)} élément(s)` };
      }
      if (probleme.type === 'string') {
        return { message: `est trop long (${String(probleme.maximum)} caractères au maximum)` };
      }
      return {
        message: probleme.inclusive
          ? `ne peut pas dépasser ${String(probleme.maximum)}`
          : `doit être strictement inférieur à ${String(probleme.maximum)}`,
      };

    case z.ZodIssueCode.not_finite:
      return { message: 'doit être un nombre fini' };

    case z.ZodIssueCode.invalid_union:
      return { message: 'la valeur saisie ne correspond à aucun format attendu' };

    default:
      // Les messages explicites des schémas passent par ici, déjà en français.
      return { message: contexte.defaultError };
  }
};

/** Valide une entrée avec un schéma zod, ou lève une `ErreurValidation`. */
export function analyser<T extends z.ZodTypeAny>(schema: T, entree: unknown): z.infer<T> {
  const resultat = schema.safeParse(entree, { errorMap: carteErreursFrancaise });
  if (resultat.success) return resultat.data;

  const problemes = resultat.error.issues;
  const premier = problemes[0];
  const champ = premier === undefined ? undefined : premier.path.join('.') || undefined;
  const message =
    premier === undefined
      ? 'Les données saisies sont invalides.'
      : champ === undefined
        ? premier.message
        : `${champ} : ${premier.message}`;

  throw new ErreurValidation(message, {
    code: 'SAISIE_INVALIDE',
    champ,
    details: problemes.map((probleme) => ({
      champ: probleme.path.join('.') || null,
      message: probleme.message,
    })),
  });
}

/** Nombre fini quelconque (positif, négatif ou nul). */
export const nombreFini = z
  .number({ invalid_type_error: 'doit être un nombre' })
  .finite('doit être un nombre fini');

/** Nombre strictement positif. */
export const nombrePositif = nombreFini.gt(0, 'doit être strictement positif');

/** Nombre positif ou nul. */
export const nombrePositifOuNul = nombreFini.min(0, 'ne peut pas être négatif');

/**
 * Efficience exprimée en pourcentage.
 *
 * Bornes : `> 0` et `≤ 100`. Une efficience nulle rendrait la dose brute
 * infinie ; une efficience supérieure à 100 % signifierait qu'on récupère plus
 * d'eau qu'on n'en lâche.
 */
export const pourcentageEfficience = nombreFini
  .gt(0, 'doit être strictement supérieure à 0 %')
  .max(100, 'ne peut pas dépasser 100 % (une efficience est un rendement)');

/** Fraction dans [0, 1] — facteur de tarissement `p`, rendement de pompe… */
export const fractionZeroUn = nombreFini
  .min(0, 'doit être compris entre 0 et 1')
  .max(1, 'doit être compris entre 0 et 1');

/** Nombre de jours d'un mois. */
export const joursDuMois = nombreFini
  .int('doit être un nombre entier de jours')
  .min(0, 'ne peut pas être négatif')
  .max(31, 'ne peut pas dépasser 31 jours');

/** Un tableau de 12 mois, exactement. */
export function douzeMois<T extends z.ZodTypeAny>(element: T) {
  return z.array(element).length(12, 'doit contenir exactement 12 mois');
}
