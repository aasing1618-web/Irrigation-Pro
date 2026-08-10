/**
 * Routes de calcul — **Vague 2**.
 *
 * Implémentation littérale de `docs/API-VAGUE-2.md` § 3 :
 *
 *   GET  /api/calculs/modules            catalogue des modules et de leurs champs
 *   GET  /api/calculs/references/:table  listes déroulantes (clés + libellés)
 *   POST /api/calculs/:module            calculer sans enregistrer
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  CE QUI SORT D'ICI, ET CE QUI N'EN SORT JAMAIS (décision D-007)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Le moteur s'exécute exclusivement côté serveur. Ce fichier ne contient
 *  AUCUNE formule : il valide une entrée, appelle `engine/`, et met en forme
 *  la sortie.
 *
 *  Le catalogue sert à l'application à **construire ses formulaires sans
 *  connaître les formules** : champ, libellé, unité, plage admise, valeur par
 *  défaut, aide. Il ne contient aucun coefficient métier. Un utilisateur
 *  choisit « PVC » dans une liste ; que le C de Hazen-Williams vaille 150 pour
 *  ce matériau ne quitte jamais le serveur. Idem pour les tables de référence :
 *  `{ cle, libelle }`, jamais la valeur associée.
 *
 *  C'est le moteur qui garantit cette propriété sur les structures qu'il
 *  expose ; ce routeur les relaie sans les enrichir. Il ne va pas chercher une
 *  valeur de coefficient pour l'ajouter à la réponse — et personne ne doit
 *  l'ajouter ici plus tard.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, type Request } from 'express';
import { z } from 'zod';

import {
  CategorieErreur,
  calculer,
  estErreurMoteur,
  listerModules,
  listerReferences,
  listerTablesDeReference,
} from '../engine/index.js';
import { AppError, ErrorCode, notFound } from '../errors.js';
import { logActivity } from '../db/repositories/activity-logs.repo.js';
import { getAuthenticatedUser, requireAuth } from '../middleware/require-auth.js';
import { getValidated, validate } from '../middleware/validate.js';

export const calculsRouter: Router = Router();

/** Aucune route de calcul n'est publique. */
calculsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// Adaptation du moteur → HTTP
// ---------------------------------------------------------------------------

/**
 * Un code de module est un identifiant technique, pas du texte libre.
 * Le motif est restrictif volontairement : il écarte tout de suite ce qui
 * n'est pas un code, avant même d'interroger le moteur.
 */
const schemaCodeModule = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Code de module invalide.');

/** Même forme pour le nom d'une table de référence. */
const schemaNomTable = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Table de référence invalide.');

/**
 * Les entrées d'un module sont un objet libre : c'est le moteur qui les valide,
 * lui seul connaît les champs de chaque module. On vérifie ici uniquement qu'il
 * s'agit bien d'un objet JSON — un tableau ou une chaîne n'a aucun sens.
 */
const schemaEntrees = z.record(z.string(), z.unknown()).default({});

/** Le module demandé existe-t-il ? Le catalogue du moteur fait foi. */
export function moduleExiste(code: string): boolean {
  return listerModules().some((description) => description.code === code);
}

/**
 * Traduit une erreur du moteur en erreur HTTP.
 *
 * Le moteur porte un discriminant `categorie` prévu pour ça :
 *   `VALIDATION`         → 400 VALIDATION_ERROR, avec le champ fautif ;
 *   `CALCUL_IMPOSSIBLE`  → 422 CALCUL_IMPOSSIBLE.
 *
 * Le message du moteur est repris **tel quel** : il est déjà rédigé en français
 * pour un ingénieur agronome, c'est précisément sa valeur.
 *
 * En revanche, le champ `details` du moteur n'est PAS relayé : on n'en publie
 * que le `code` et le `champ`. C'est ce dont l'application a besoin pour
 * surligner une saisie, et cela garantit qu'aucune structure interne du moteur
 * ne parte vers le client par inadvertance.
 *
 * Renvoie `null` si l'erreur n'est pas une erreur du moteur : ce serait alors
 * un vrai défaut, qui doit remonter en 500 et non être maquillé en 422.
 */
export function traduireErreurMoteur(erreur: unknown): AppError | null {
  if (!estErreurMoteur(erreur)) return null;

  const details = {
    codeMoteur: erreur.code,
    ...(erreur.champ ? { champ: erreur.champ } : {}),
  };

  if (erreur.categorie === CategorieErreur.VALIDATION) {
    return new AppError(erreur.message, 400, ErrorCode.VALIDATION_ERROR, details);
  }
  return new AppError(erreur.message, 422, 'CALCUL_IMPOSSIBLE', details);
}

/** Résultat d'un calcul, mis en forme pour l'API. */
export type CalculExecute = {
  resultats: unknown;
  avertissements: unknown;
  engineVersion: string;
};

/**
 * Exécute un module et convertit toute erreur du moteur en `AppError`.
 *
 * Point d'entrée unique du moteur pour l'ensemble de l'API : la route
 * « calculer sans enregistrer » et la route « calculer et archiver » passent
 * toutes les deux par ici. Elles se comportent donc identiquement face à une
 * saisie invalide ou à un calcul impossible — sans quoi les deux chemins
 * finiraient par diverger.
 */
export async function executerCalcul(
  module: string,
  entrees: Record<string, unknown>,
): Promise<CalculExecute> {
  try {
    const resultat = await calculer(module, entrees);
    return {
      resultats: resultat.resultats,
      avertissements: resultat.avertissements,
      engineVersion: resultat.engineVersion,
    };
  } catch (erreur) {
    const traduite = traduireErreurMoteur(erreur);
    if (traduite) throw traduite;
    throw erreur;
  }
}

/** Contexte d'audit : jamais le corps de la requête, jamais un jeton. */
function contexteDeRequete(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET /api/calculs/modules — catalogue
// ---------------------------------------------------------------------------

/**
 * Catalogue des modules disponibles et de leurs champs de saisie.
 *
 * C'est ce que l'application consomme pour bâtir ses formulaires : ajouter un
 * module côté moteur doit suffire à le faire apparaître dans l'application,
 * sans toucher une ligne de code client.
 */
calculsRouter.get('/modules', (_req, res) => {
  res.status(200).json({ modules: listerModules() });
});

// ---------------------------------------------------------------------------
// GET /api/calculs/references/:table — listes déroulantes
// ---------------------------------------------------------------------------

/**
 * Sert une table de référence sous forme de couples `{ cle, libelle }`.
 *
 * Le client renvoie ensuite la `cle` choisie dans ses entrées de calcul ; le
 * coefficient correspondant reste sur le serveur. C'est exactement ce que
 * demande le contrat : « les libellés et les clés, jamais les coefficients ».
 *
 * Une table inconnue renvoie `404` : c'est une ressource, pas une saisie.
 */
calculsRouter.get(
  '/references/:table',
  validate({ params: z.object({ table: schemaNomTable }) }),
  (_req, res) => {
    const { table } = getValidated<{ table: string }>(res, 'params');

    if (!listerTablesDeReference().includes(table)) {
      throw notFound('Table de référence inconnue.');
    }

    res.status(200).json({ table, valeurs: listerReferences(table) });
  },
);

// ---------------------------------------------------------------------------
// POST /api/calculs/:module — calculer sans enregistrer
// ---------------------------------------------------------------------------

/**
 * Lance un calcul sans rien archiver : l'application envoie des paramètres,
 * reçoit des résultats et des avertissements.
 *
 * Les `avertissements` sont les contrôles métier non bloquants (vitesse hors
 * plage, risque de ruissellement…). Ils remontent toujours, y compris quand le
 * calcul aboutit : c'est la valeur ajoutée par rapport à un tableur, et le
 * contrat interdit de les rendre silencieux.
 */
calculsRouter.post(
  '/:module',
  validate({
    params: z.object({ module: schemaCodeModule }),
    body: schemaEntrees,
  }),
  async (req, res) => {
    const { module } = getValidated<{ module: string }>(res, 'params');
    const entrees = getValidated<Record<string, unknown>>(res, 'body');
    const utilisateur = getAuthenticatedUser(res);

    if (!moduleExiste(module)) {
      throw notFound('Module de calcul inconnu.');
    }

    const calcul = await executerCalcul(module, entrees);

    // Journal : le module employé, jamais les entrées (elles peuvent être
    // volumineuses et n'ont pas leur place dans un journal d'audit).
    await logActivity({
      userId: utilisateur.id,
      action: 'CALCUL_RUN',
      entityType: 'project',
      entityId: null,
      ...contexteDeRequete(req),
      metadata: { module, engineVersion: calcul.engineVersion },
    });

    res.status(200).json({
      resultats: calcul.resultats,
      avertissements: calcul.avertissements,
      engineVersion: calcul.engineVersion,
    });
  },
);
