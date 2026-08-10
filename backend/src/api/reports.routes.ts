/**
 * Routes des rapports PDF — **Vague 3**.
 *
 * Implémentation littérale de `docs/API-VAGUE-3.md` § 1 :
 *
 *   POST   /api/projects/:id/reports   générer un rapport
 *   GET    /api/projects/:id/reports   lister les rapports d'un projet
 *   GET    /api/reports/:id/fichier    télécharger le PDF
 *   DELETE /api/reports/:id            supprimer un rapport
 *
 * Les deux familles de chemins vivent dans le même routeur, monté à la racine
 * de `/api` : un rapport est une sous-ressource d'un projet quand on le crée ou
 * qu'on le liste, mais une ressource de plein droit quand on le télécharge —
 * l'application n'a alors que son identifiant en main.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ISOLATION — TROIS APPARTENANCES, TOUTES VÉRIFIÉES EN SQL
 * ═══════════════════════════════════════════════════════════════════════════
 *   1. le **projet** appartient au compte connecté           (`getProject`)
 *   2. chaque **calcul** demandé appartient à ce projet-là    (`getProjectData`,
 *      appelé par `selectionnerCalculs` — jointure `project_data → projects`)
 *   3. le **rapport** appartient au compte connecté           (`getReport`,
 *      `deleteReport` — `owner_id` dans le `WHERE`, plus la jointure sur
 *      `projects` qui exige la concordance des deux colonnes)
 *
 *  Aucune de ces trois vérifications n'est faite en mémoire après coup, et
 *  aucune ne suppose qu'une autre couche l'a déjà faite. Un échec, quel qu'il
 *  soit, donne **`404`** : le rapport d'un concurrent doit être indiscernable
 *  d'un identifiant inventé. Un `403` apprendrait qu'il existe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, type Request } from 'express';
import { z } from 'zod';

import { logActivity } from '../db/repositories/activity-logs.repo.js';
import { getProject, projectBelongsToOwner } from '../db/repositories/projects.repo.js';
import {
  createReport,
  deleteReport,
  getReport,
  listReports,
  setReportFilePath,
  type ReportRow,
} from '../db/repositories/reports.repo.js';
import { badRequest, conflict, internal, isAppError, notFound } from '../errors.js';
import { logger } from '../logger.js';
import { getAuthenticatedUser, requireAuth } from '../middleware/require-auth.js';
import { getValidated, validate } from '../middleware/validate.js';
import { construireContenu, selectionnerCalculs } from '../reports/collecte.js';
import { genererPdfRapport } from '../reports/document.js';
import {
  cheminRelatifRapport,
  ecrireRapport,
  effacerRapport,
  lireManifeste,
  lireRapport,
} from '../reports/stockage.js';
import { assainirNomFichier, enteteContentDisposition } from '../reports/texte.js';
import type { ManifesteRapport } from '../reports/types.js';

export const reportsRouter: Router = Router();

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Un seul et même message pour « ce projet n'existe pas » et « ce projet est
 * celui d'un autre ». Deux messages distincts rétabliraient, côté texte, la
 * fuite que le `404` vient d'éviter.
 */
const MESSAGE_PROJET_INTROUVABLE = 'Ce projet est introuvable.';
const MESSAGE_RAPPORT_INTROUVABLE = 'Ce rapport est introuvable.';
const MESSAGE_CALCUL_INTROUVABLE =
  'Un des calculs demandés est introuvable dans ce projet.';

/**
 * Message distinct, et ce n'est pas une fuite : on n'arrive ici qu'**après**
 * avoir établi que le rapport appartient bien au compte connecté. Lui dire
 * franchement que le fichier a disparu du serveur vaut mieux que de lui laisser
 * croire que son rapport n'a jamais existé.
 */
const MESSAGE_FICHIER_ABSENT =
  'Le fichier de ce rapport n’est plus disponible sur le serveur. Générez un nouveau rapport.';

// ---------------------------------------------------------------------------
// Schémas de validation
// ---------------------------------------------------------------------------

/** Un `:id` mal formé est un `400`, pas une erreur de cast `uuid` en 500. */
const schemaParams = z.object({ id: z.string().uuid() });

/**
 * `calculIds` est facultatif — à défaut, le rapport reprend le dernier calcul de
 * chaque module (contrat § 1). Le plafond de 40 borne à la fois la taille du
 * document et le nombre de requêtes déclenchées par un seul appel.
 */
const schemaGeneration = z.object({
  calculIds: z.array(z.string().uuid()).min(1).max(40).optional(),
  notes: z
    .union([z.string().trim().max(4000), z.null()])
    .optional()
    .transform((valeur) => (valeur === '' ? null : valeur)),
});

const schemaListe = z.object({
  limite: z.coerce.number().int().min(1).max(200).optional(),
  depuis: z.coerce.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Le driver `pg` renvoie des `Date` ; les faux dépôts, parfois des chaînes. */
function enIso(valeur: Date | string): string {
  return valeur instanceof Date ? valeur.toISOString() : new Date(valeur).toISOString();
}

function dateDe(valeur: Date | string): Date {
  return valeur instanceof Date ? valeur : new Date(valeur);
}

/** Contexte d'audit : jamais le corps de la requête, jamais un jeton. */
function contexteDeRequete(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return { ipAddress: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

/**
 * Nom de fichier proposé au téléchargement.
 *
 * Il contient le nom du projet, donc du texte saisi par l'utilisateur :
 * `assainirNomFichier` en retire les séparateurs de chemin et les caractères de
 * contrôle, et `enteteContentDisposition` percent-encode la forme UTF-8. Un
 * projet nommé `Barrage\nSet-Cookie: x` ne peut ni sortir du dossier, ni couper
 * l'en-tête HTTP en deux.
 */
function nomFichierRapport(reference: string, nomProjet: string): string {
  return assainirNomFichier(`Rapport ${reference} - ${nomProjet}`);
}

/**
 * Chemin de stockage d'un rapport dont on ne sait pas s'il a été écrit.
 * Sert au nettoyage après un échec de génération ; `null` si les identifiants
 * ne sont pas des UUID, auquel cas rien n'a pu être écrit de toute façon.
 */
function cheminEventuel(ownerId: string, reportId: string): string | null {
  try {
    return cheminRelatifRapport(ownerId, reportId);
  } catch {
    return null;
  }
}

/** Vue publique d'un rapport (contrat § 1). */
function vueRapport(ligne: ReportRow, nombreCalculs: number | null): Record<string, unknown> {
  return {
    id: ligne.id,
    reference: ligne.reference,
    genereLe: enIso(ligne.generated_at),
    nombreCalculs: nombreCalculs ?? 0,
    // Ajout au contrat, jamais un écart : permet à l'application de griser le
    // bouton « télécharger » plutôt que de proposer un fichier absent.
    fichierDisponible: ligne.file_path !== null && nombreCalculs !== null,
  };
}

// ---------------------------------------------------------------------------
// POST /api/projects/:id/reports — générer
// ---------------------------------------------------------------------------

/**
 * Produit le rapport et l'archive.
 *
 * Ordre imposé, et chaque étape a sa raison :
 *
 *  1. le projet est relu pour le compte connecté — il alimente la page de garde
 *     **et** vaut vérification d'appartenance ;
 *  2. les calculs sont sélectionnés ; un identifiant qui ne désigne pas un
 *     calcul de **ce** projet fait échouer l'ensemble (`null`) plutôt que de
 *     produire un document amputé sans que personne ne le sache ;
 *  3. la ligne `reports` est créée — c'est elle qui attribue la référence, que
 *     le document doit porter : on ne peut pas dessiner avant ;
 *  4. le PDF est composé, puis écrit sur disque, puis seulement `file_path` est
 *     renseigné. Si l'une de ces étapes échoue, la ligne est retirée : mieux
 *     vaut aucun rapport qu'un rapport qui promet un fichier inexistant.
 */
reportsRouter.post(
  '/projects/:id/reports',
  requireAuth,
  validate({ params: schemaParams, body: schemaGeneration }),
  async (req, res) => {
    const utilisateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');
    const corps = getValidated<z.infer<typeof schemaGeneration>>(res, 'body');

    const projet = await getProject(id, utilisateur.id);
    if (!projet) throw notFound(MESSAGE_PROJET_INTROUVABLE);

    const calculs = await selectionnerCalculs({
      projectId: id,
      ownerId: utilisateur.id,
      calculIds: corps.calculIds ?? null,
    });
    if (calculs === null) throw notFound(MESSAGE_CALCUL_INTROUVABLE);

    // Un rapport sans aucun résultat n'est pas un document défendable devant un
    // client final ; on refuse de le produire plutôt que de livrer des pages
    // vides sous une référence.
    if (calculs.length === 0) {
      throw badRequest(
        'Ce projet ne contient encore aucun calcul : lancez au moins un module avant de générer un rapport.',
      );
    }

    const ligne = await createReport(id, utilisateur.id);
    if (!ligne) {
      throw conflict('Ce projet a été supprimé pendant la génération du rapport.');
    }

    try {
      const contenu = await construireContenu({
        projet,
        auteur: {
          fullName: utilisateur.fullName,
          company: utilisateur.company,
          email: utilisateur.email,
        },
        reference: ligne.reference,
        genereLe: dateDe(ligne.generated_at),
        calculs,
        notes: corps.notes ?? null,
      });

      const pdf = await genererPdfRapport(contenu);

      const manifeste: ManifesteRapport = {
        reference: ligne.reference,
        genereLe: enIso(ligne.generated_at),
        projectId: id,
        calculIds: calculs.map((calcul) => calcul.id),
        nombreCalculs: calculs.length,
        moteurVersion: contenu.moteurVersion,
        nomFichier: nomFichierRapport(ligne.reference, projet.name),
      };

      const cheminRelatif = await ecrireRapport(utilisateur.id, ligne.id, pdf, manifeste);
      await setReportFilePath(ligne.id, utilisateur.id, cheminRelatif);

      await logActivity({
        userId: utilisateur.id,
        action: 'REPORT_GENERATED',
        entityType: 'report',
        entityId: ligne.id,
        ...contexteDeRequete(req),
        // Des repères d'audit, pas le contenu de l'étude du client.
        metadata: {
          projectId: id,
          reference: ligne.reference,
          nombreCalculs: calculs.length,
          moteurVersion: contenu.moteurVersion,
          octets: pdf.length,
        },
      });

      res.status(201).json({
        rapport: {
          id: ligne.id,
          reference: ligne.reference,
          genereLe: enIso(ligne.generated_at),
        },
      });
    } catch (err) {
      // La référence est consommée mais le document n'existe pas : on retire la
      // ligne pour ne pas laisser un rapport fantôme dans la liste du client.
      await deleteReport(ligne.id, utilisateur.id).catch(() => null);
      await effacerRapport(cheminEventuel(utilisateur.id, ligne.id));

      // Une erreur volontaire (404, 409…) garde son sens ; tout le reste est un
      // défaut interne, dont le détail ne sort pas du serveur.
      if (isAppError(err)) throw err;
      logger.error({ err, reportId: ligne.id }, 'Génération du rapport impossible');
      throw internal('La génération du rapport a échoué.');
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/projects/:id/reports — lister
// ---------------------------------------------------------------------------

/**
 * Liste les rapports d'un projet.
 *
 * Le projet est vérifié explicitement : sans cela, un projet inexistant et un
 * projet sans rapport renverraient tous deux une liste vide, et l'application
 * ne pourrait pas les distinguer.
 *
 * `nombreCalculs` est relu dans le manifeste écrit à côté de chaque PDF : la
 * table `reports` ne mémorise pas la composition du document (voir
 * `reports/stockage.ts`). Un manifeste illisible donne `fichierDisponible:
 * false` plutôt qu'un chiffre inventé.
 */
reportsRouter.get(
  '/projects/:id/reports',
  requireAuth,
  validate({ params: schemaParams, query: schemaListe }),
  async (_req, res) => {
    const utilisateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');
    const filtres = getValidated<z.infer<typeof schemaListe>>(res, 'query');

    if (!(await projectBelongsToOwner(id, utilisateur.id))) {
      throw notFound(MESSAGE_PROJET_INTROUVABLE);
    }

    const lignes = await listReports(id, utilisateur.id, {
      limit: filtres.limite ?? 100,
      offset: filtres.depuis ?? 0,
    });

    const rapports = await Promise.all(
      lignes.map(async (ligne) => {
        const manifeste = await lireManifeste(ligne.file_path);
        return vueRapport(ligne, manifeste?.nombreCalculs ?? null);
      }),
    );

    res.status(200).json({ rapports });
  },
);

// ---------------------------------------------------------------------------
// GET /api/reports/:id/fichier — télécharger
// ---------------------------------------------------------------------------

/**
 * Renvoie le PDF.
 *
 * Le fichier est servi depuis un tampon en mémoire plutôt qu'en flux : le
 * document pèse quelques dizaines de kilo-octets, et un flux qui échoue en
 * cours de route laisse une réponse HTTP à moitié envoyée, impossible à
 * transformer en erreur propre.
 *
 * `Cache-Control: private, no-store` est explicite : un rapport contient les
 * données d'un client final, il n'a rien à faire dans un cache partagé.
 */
reportsRouter.get(
  '/reports/:id/fichier',
  requireAuth,
  validate({ params: schemaParams }),
  async (req, res) => {
    const utilisateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');

    const ligne = await getReport(id, utilisateur.id);
    if (!ligne) throw notFound(MESSAGE_RAPPORT_INTROUVABLE);

    const pdf = await lireRapport(ligne.file_path);
    if (!pdf || pdf.length === 0) throw notFound(MESSAGE_FICHIER_ABSENT);

    await logActivity({
      userId: utilisateur.id,
      action: 'REPORT_DOWNLOADED',
      entityType: 'report',
      entityId: ligne.id,
      ...contexteDeRequete(req),
      metadata: { projectId: ligne.project_id, reference: ligne.reference },
    });

    const nomFichier = nomFichierRapport(ligne.reference, ligne.project_name);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', enteteContentDisposition(nomFichier));
    res.setHeader('Content-Length', String(pdf.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).end(pdf);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/reports/:id — supprimer
// ---------------------------------------------------------------------------

/**
 * Supprime un rapport, puis son fichier.
 *
 * Dans cet ordre : la ligne est la source de vérité. Effacer le fichier
 * d'abord, puis échouer sur la base, laisserait une entrée qui promet un
 * document introuvable. L'inverse ne laisse qu'un fichier orphelin, invisible
 * et sans conséquence fonctionnelle.
 */
reportsRouter.delete(
  '/reports/:id',
  requireAuth,
  validate({ params: schemaParams }),
  async (req, res) => {
    const utilisateur = getAuthenticatedUser(res);
    const { id } = getValidated<{ id: string }>(res, 'params');

    const ligne = await deleteReport(id, utilisateur.id);
    if (!ligne) throw notFound(MESSAGE_RAPPORT_INTROUVABLE);

    await effacerRapport(ligne.file_path);

    await logActivity({
      userId: utilisateur.id,
      action: 'REPORT_DELETED',
      entityType: 'report',
      entityId: ligne.id,
      ...contexteDeRequete(req),
      metadata: { projectId: ligne.project_id, reference: ligne.reference },
    });

    res.status(204).end();
  },
);
