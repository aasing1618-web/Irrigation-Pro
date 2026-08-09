/**
 * Validation des entrées.
 *
 * Règle non négociable du projet : aucune donnée venant du client n'est utilisée
 * sans avoir été validée côté serveur. Ce helper branche un schéma `zod` sur le
 * corps, les paramètres d'URL et/ou la chaîne de requête, et refuse la requête
 * avec un 400 listant précisément les champs fautifs.
 *
 * Les valeurs validées (donc typées et nettoyées) sont déposées dans
 * `res.locals.validated` — et non dans `req.query`, qui n'est plus modifiable
 * dans Express 5.
 */

import type { RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

import { AppError, ErrorCode } from '../errors.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/** Un champ refusé, décrit en clair pour l'interface. */
export interface ChampInvalide {
  champ: string;
  message: string;
}

export interface DonnéesValidées {
  body?: unknown;
  params?: unknown;
  query?: unknown;
}

const SOURCES = ['body', 'params', 'query'] as const;

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, res, next) => {
    const champsInvalides: ChampInvalide[] = [];
    const validées: DonnéesValidées = {};

    for (const source of SOURCES) {
      const schéma = schemas[source];
      if (!schéma) continue;

      const résultat = schéma.safeParse(req[source]);

      if (résultat.success) {
        validées[source] = résultat.data;
        continue;
      }

      for (const problème of résultat.error.issues) {
        champsInvalides.push({
          champ: [source, ...problème.path].join('.'),
          message: problème.message,
        });
      }
    }

    if (champsInvalides.length > 0) {
      next(
        new AppError('Les données envoyées sont invalides.', 400, ErrorCode.VALIDATION_ERROR, {
          champs: champsInvalides,
        }),
      );
      return;
    }

    // `req.body` est modifiable : on y remet la version validée pour que les
    // handlers existants continuent de fonctionner naturellement.
    if (validées.body !== undefined) {
      req.body = validées.body;
    }

    res.locals.validated = validées;
    next();
  };
}

/**
 * Relit les données validées de façon typée dans un handler.
 *
 * ```ts
 * const { email } = getValidated<z.infer<typeof schémaConnexion>>(res, 'body');
 * ```
 * Le type est fourni par l'appelant : il doit correspondre au schéma passé à
 * `validate()` sur la même route.
 */
export function getValidated<T>(res: Response, source: (typeof SOURCES)[number]): T {
  const validées = (res.locals.validated ?? {}) as DonnéesValidées;
  return validées[source] as T;
}

/** Raccourci de typage pour dériver le type d'un schéma. */
export type Infer<S extends ZodTypeAny> = z.infer<S>;
