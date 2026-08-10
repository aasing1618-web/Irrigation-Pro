/**
 * Pont entre `zod` et les erreurs du moteur.
 *
 * Chaque module expose un schéma `zod`. Toute entrée passe par `analyser()`,
 * qui transforme un échec de validation en `ErreurValidation` portant le
 * **premier champ fautif** — c'est ce champ que l'application met en évidence.
 */

import { z } from 'zod';

import { ErreurValidation } from './erreurs.js';

/** Valide une entrée avec un schéma zod, ou lève une `ErreurValidation`. */
export function analyser<T extends z.ZodTypeAny>(schema: T, entree: unknown): z.infer<T> {
  const resultat = schema.safeParse(entree);
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
