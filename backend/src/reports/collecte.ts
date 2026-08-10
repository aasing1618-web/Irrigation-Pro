/**
 * Collecte des données d'un rapport.
 *
 * Moitié « lecture » du générateur : elle interroge la base et le moteur, et
 * produit un `ContenuRapport` (voir `types.ts`) que `document.ts` se contente
 * ensuite de dessiner. Aucune ligne de `pdfkit` ici.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ISOLATION
 * ═══════════════════════════════════════════════════════════════════════════
 *  `ownerId` est un paramètre obligatoire de toutes les fonctions qui touchent
 *  la base, et il est transmis tel quel aux dépôts, qui le mettent dans leur
 *  `WHERE`. La vérification « ce calcul appartient bien à ce projet » n'est pas
 *  faite en mémoire après coup : elle est faite **en SQL**, par
 *  `getProjectData(id, projectId, ownerId)`. Un calcul appartenant au projet
 *  d'un autre client ne remonte pas, et la route répond 404.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Deux points méritent l'attention du lecteur :
 *
 *  1. **Les avertissements ne sont pas archivés.** La table `project_data`
 *     conserve les entrées, les résultats et la version du moteur — pas les
 *     avertissements. On les régénère donc en rejouant le module sur les
 *     entrées archivées, ce qui est licite : le moteur est une fonction pure,
 *     sans base ni entrée/sortie. Si le rejeu échoue (entrées devenues
 *     invalides, module retiré), on ne fait pas silence : une **remarque
 *     visible** est ajoutée au document. Le contrat interdit d'omettre un
 *     avertissement ; il interdit tout autant de faire croire qu'il n'y en a
 *     pas alors qu'on n'a pas pu les obtenir.
 *
 *  2. **Les résultats affichés viennent de l'archive, pas du rejeu.** Si le
 *     moteur a changé de version depuis, le document doit montrer les valeurs
 *     sur lesquelles le bureau d'études a travaillé, et signaler l'écart de
 *     version. Recalculer les résultats reviendrait à modifier une étude déjà
 *     rendue.
 */

import { ENGINE_VERSION, calculer, listerModules, listerReferences } from '../engine/index.js';
import type {
  ChampSaisie,
  ChampSortie,
  DescriptionModule,
  ResultatMoteur,
} from '../engine/types.js';
import { getProjectData, listProjectData } from '../db/repositories/project-data.repo.js';
import type { ProjectDataRow } from '../db/repositories/project-data.repo.js';
import type { ProjectRow } from '../db/repositories/projects.repo.js';
import { formaterNombre, tronquer } from './texte.js';
import type {
  AvertissementRapport,
  BlocCalcul,
  ContenuRapport,
  LigneValeur,
  TableauDonnees,
} from './types.js';

/** Au-delà, un rapport n'est plus un document mais un listing. */
const MAXIMUM_CALCULS = 40;

/** Lignes conservées dans une saisie répétée (calendrier, tronçons…). */
const MAXIMUM_LIGNES_TABLEAU = 400;

const VALEUR_ABSENTE = '—';

// ---------------------------------------------------------------------------
// Sélection des calculs à reprendre
// ---------------------------------------------------------------------------

export interface SelectionCalculs {
  readonly projectId: string;
  readonly ownerId: string;
  /** Facultatif : à défaut, le dernier calcul de chaque module du projet. */
  readonly calculIds?: readonly string[] | null;
}

/**
 * Rassemble les calculs qui alimenteront le rapport.
 *
 * Renvoie `null` — et non un tableau partiel — dès qu'un identifiant demandé ne
 * correspond pas à un calcul de **ce** projet appartenant à **ce** compte. La
 * route traduit ce `null` en `404`. Répondre avec les calculs valides et taire
 * les autres produirait un document incomplet sans que personne ne le sache.
 */
export async function selectionnerCalculs(
  selection: SelectionCalculs,
): Promise<ProjectDataRow[] | null> {
  const { projectId, ownerId, calculIds } = selection;

  if (calculIds && calculIds.length > 0) {
    const retenus: ProjectDataRow[] = [];
    for (const calculId of calculIds) {
      // Appartenance vérifiée en SQL : calcul → projet → propriétaire.
      const ligne = await getProjectData(calculId, projectId, ownerId);
      if (!ligne) return null;
      retenus.push(ligne);
    }
    return retenus;
  }

  // À défaut : le dernier calcul de chaque module (contrat, § 1).
  const historique = await listProjectData(projectId, ownerId, { limit: 500 });
  const derniers = new Map<string, ProjectDataRow>();
  for (const ligne of historique) {
    const connu = derniers.get(ligne.module);
    if (!connu || dateDe(ligne.computed_at) > dateDe(connu.computed_at)) {
      derniers.set(ligne.module, ligne);
    }
  }
  return [...derniers.values()].sort(
    (a, b) => dateDe(a.computed_at).getTime() - dateDe(b.computed_at).getTime(),
  );
}

/** Le driver `pg` renvoie des `Date` ; les faux dépôts, parfois des chaînes. */
function dateDe(valeur: Date | string): Date {
  return valeur instanceof Date ? valeur : new Date(valeur);
}

// ---------------------------------------------------------------------------
// Construction du contenu
// ---------------------------------------------------------------------------

export interface AuteurRapport {
  readonly fullName: string;
  readonly company: string | null;
  readonly email: string;
}

export interface DemandeContenu {
  readonly projet: ProjectRow;
  readonly auteur: AuteurRapport;
  readonly reference: string;
  readonly genereLe: Date;
  readonly calculs: readonly ProjectDataRow[];
  readonly notes?: string | null;
}

/** Assemble le modèle de contenu complet du document. */
export async function construireContenu(demande: DemandeContenu): Promise<ContenuRapport> {
  const catalogue = indexerCatalogue();

  const blocs: BlocCalcul[] = [];
  for (const ligne of demande.calculs.slice(0, MAXIMUM_CALCULS)) {
    blocs.push(await construireBloc(ligne, catalogue.get(ligne.module)));
  }

  return {
    entete: {
      reference: demande.reference,
      genereLe: demande.genereLe,
      projetNom: demande.projet.name,
      clientFinal: demande.projet.client_name,
      localisation: demande.projet.location,
      descriptionProjet: demande.projet.description,
      auteurNom: demande.auteur.fullName,
      auteurSociete: demande.auteur.company,
      auteurEmail: demande.auteur.email,
    },
    calculs: blocs,
    notes: demande.notes ?? null,
    moteurVersion: ENGINE_VERSION,
  };
}

/** Catalogue du moteur, indexé par code de module. */
function indexerCatalogue(): Map<string, DescriptionModule> {
  const index = new Map<string, DescriptionModule>();
  try {
    for (const description of listerModules()) {
      index.set(description.code, description);
    }
  } catch {
    // Un catalogue indisponible ne doit pas empêcher de produire le document :
    // il sera simplement moins bien libellé.
  }
  return index;
}

async function construireBloc(
  ligne: ProjectDataRow,
  description: DescriptionModule | undefined,
): Promise<BlocCalcul> {
  const entrees = objetOuVide(ligne.inputs);
  const resultatsBruts = objetOuVide(ligne.results);

  const { hypotheses, tableaux } = construireHypotheses(entrees, description);
  const resultats = construireResultats(resultatsBruts, description);
  const { avertissements, remarques } = await recupererAvertissements(ligne, description);

  return {
    id: ligne.id,
    module: ligne.module,
    nom: description?.nom ?? ligne.module,
    description: description?.description ?? null,
    calculeLe: dateDe(ligne.computed_at),
    engineVersion: ligne.engine_version,
    hypotheses,
    tableauxHypotheses: tableaux,
    resultats,
    avertissements,
    remarques,
  };
}

// ---------------------------------------------------------------------------
// Hypothèses
// ---------------------------------------------------------------------------

/**
 * Traduit les entrées archivées en lignes lisibles.
 *
 * Le catalogue du moteur fournit le libellé et l'unité de chaque champ ; c'est
 * ce qui rend le tableau compréhensible par le client final (« Superficie
 * totale — 12 — ha » plutôt que « at: 12 »).
 *
 * Les clés présentes dans les entrées mais absentes du catalogue sont tout de
 * même affichées, sous leur nom technique. Un rapport doit dire sur quoi il
 * repose : masquer une entrée parce qu'on ne sait pas la nommer reviendrait à
 * cacher une hypothèse.
 */
function construireHypotheses(
  entrees: Record<string, unknown>,
  description: DescriptionModule | undefined,
): { hypotheses: LigneValeur[]; tableaux: TableauDonnees[] } {
  const hypotheses: LigneValeur[] = [];
  const tableaux: TableauDonnees[] = [];
  const traites = new Set<string>();

  for (const champ of description?.entrees ?? []) {
    traites.add(champ.champ);
    const valeur = entrees[champ.champ];

    if (Array.isArray(valeur)) {
      const tableau = construireTableauDonnees(champ.libelle, valeur);
      if (tableau) tableaux.push(tableau);
      else hypotheses.push(ligneValeur(champ.libelle, VALEUR_ABSENTE, champ.unite));
      continue;
    }

    if (valeur === undefined || valeur === null) {
      // Un champ facultatif non renseigné n'encombre pas le document ; un champ
      // obligatoire absent, si : son absence est en soi une hypothèse.
      if (champ.obligatoire) {
        hypotheses.push(ligneValeur(champ.libelle, 'Non renseigné', champ.unite));
      }
      continue;
    }

    hypotheses.push(ligneValeur(champ.libelle, formaterEntree(valeur, champ), champ.unite));
  }

  for (const [cle, valeur] of Object.entries(entrees)) {
    if (traites.has(cle)) continue;
    if (Array.isArray(valeur)) {
      const tableau = construireTableauDonnees(cle, valeur);
      if (tableau) tableaux.push(tableau);
      continue;
    }
    if (valeur === null || valeur === undefined) continue;
    if (typeof valeur === 'object') continue;
    hypotheses.push(ligneValeur(cle, formaterScalaire(valeur), null));
  }

  return { hypotheses, tableaux };
}

/**
 * Met en forme une valeur d'entrée.
 *
 * Pour un champ de type liste, la clé stockée (`PVC`, `RIZ`) est remplacée par
 * son libellé (`PVC`, `Riz irrigué`) via la table de référence du moteur —
 * laquelle ne publie que des couples `{ cle, libelle }`, jamais le coefficient
 * associé. Le document reste donc conforme à D-007.
 */
function formaterEntree(valeur: unknown, champ: ChampSaisie): string {
  if (champ.type === 'liste' && champ.table && typeof valeur === 'string') {
    const libelle = libelleDeReference(champ.table, valeur);
    if (libelle) return libelle;
  }
  return formaterScalaire(valeur);
}

function libelleDeReference(table: string, cle: string): string | null {
  try {
    for (const entree of listerReferences(table)) {
      if (entree.cle === cle) return entree.libelle;
    }
  } catch {
    // Table inconnue du moteur : on garde la clé brute, c'est déjà lisible.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------

/**
 * Traduit les résultats archivés en lignes lisibles.
 *
 * Les grandeurs affichées sont **celles que le catalogue décrit** (`sorties`).
 * C'est la vue publique et curée du module ; y déverser toute la structure
 * interne du résultat exposerait des grandeurs intermédiaires qui n'ont pas
 * été pensées pour un client final. Quand le module est inconnu du catalogue
 * (moteur plus ancien, module retiré), on se rabat sur les grandeurs scalaires
 * de premier niveau pour ne rien perdre.
 */
function construireResultats(
  resultats: Record<string, unknown>,
  description: DescriptionModule | undefined,
): LigneValeur[] {
  if (!description) {
    return Object.entries(resultats)
      .filter(([, valeur]) => valeur !== null && typeof valeur !== 'object')
      .map(([cle, valeur]) => ligneValeur(cle, formaterScalaire(valeur), null));
  }

  const lignes: LigneValeur[] = [];
  for (const sortie of description.sorties) {
    const valeur = lireChemin(resultats, sortie.champ);
    if (valeur === undefined || valeur === null) continue;
    if (typeof valeur === 'object') continue;
    lignes.push(ligneSortie(sortie, formaterScalaire(valeur)));
  }
  return lignes;
}

// ---------------------------------------------------------------------------
// Avertissements
// ---------------------------------------------------------------------------

/**
 * Récupère les avertissements métier du calcul.
 *
 * Voir l'en-tête du fichier : ils ne sont pas archivés, on rejoue donc le
 * module sur les entrées enregistrées. Tout échec est signalé au lecteur.
 */
async function recupererAvertissements(
  ligne: ProjectDataRow,
  description: DescriptionModule | undefined,
): Promise<{ avertissements: AvertissementRapport[]; remarques: string[] }> {
  const remarques: string[] = [];

  if (ligne.engine_version !== ENGINE_VERSION) {
    remarques.push(
      `Ce calcul a été produit avec la version ${ligne.engine_version} du moteur, ` +
        `alors que la version en service est la ${ENGINE_VERSION}. Les valeurs ci-dessus ` +
        'sont celles qui ont été archivées ; elles n’ont pas été recalculées.',
    );
  }

  if (!description) {
    remarques.push(
      'Le module correspondant n’est plus décrit par le moteur en service : les ' +
        'avertissements techniques de ce calcul n’ont pas pu être régénérés.',
    );
    return { avertissements: [], remarques };
  }

  try {
    const rejeu = (await calculer(ligne.module, objetOuVide(ligne.inputs))) as ResultatMoteur<unknown>;
    const avertissements = Array.isArray(rejeu?.avertissements) ? rejeu.avertissements : [];
    return {
      avertissements: avertissements.map((avertissement) => ({
        code: String(avertissement.code ?? ''),
        message: String(avertissement.message ?? ''),
        gravite: avertissement.gravite === 'attention' ? 'attention' : 'info',
      })),
      remarques,
    };
  } catch {
    remarques.push(
      'Les avertissements techniques de ce calcul n’ont pas pu être régénérés à partir ' +
        'des données enregistrées. Reprenez le calcul dans l’application avant de ' +
        'transmettre ce rapport.',
    );
    return { avertissements: [], remarques };
  }
}

// ---------------------------------------------------------------------------
// Petits utilitaires de conversion
// ---------------------------------------------------------------------------

function ligneValeur(libelle: string, valeur: string, unite: string | null): LigneValeur {
  return { libelle, valeur, unite: unite ?? '' };
}

function ligneSortie(sortie: ChampSortie, valeur: string): LigneValeur {
  return {
    libelle: sortie.libelle,
    valeur,
    unite: sortie.unite ?? '',
    principal: sortie.principal === true,
  };
}

/** `jsonb` peut remonter n'importe quoi : on n'accepte qu'un objet simple. */
function objetOuVide(valeur: unknown): Record<string, unknown> {
  if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) return {};
  return valeur as Record<string, unknown>;
}

/** Lit `revanche.hauteurTotale` dans un résultat imbriqué. */
function lireChemin(source: Record<string, unknown>, chemin: string): unknown {
  let courant: unknown = source;
  for (const segment of chemin.split('.')) {
    if (courant === null || typeof courant !== 'object') return undefined;
    courant = (courant as Record<string, unknown>)[segment];
  }
  return courant;
}

/** Nombre, booléen ou texte → chaîne affichable. */
function formaterScalaire(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return VALEUR_ABSENTE;
  if (typeof valeur === 'number') return formaterNombre(valeur);
  if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
  if (typeof valeur === 'string') {
    const propre = valeur.trim();
    return propre.length === 0 ? VALEUR_ABSENTE : tronquer(propre, 300);
  }
  return VALEUR_ABSENTE;
}

/**
 * Transforme une saisie répétée en tableau affichable.
 *
 * Les colonnes sont l'union des clés rencontrées, dans leur ordre d'apparition :
 * une ligne de calendrier climatique à laquelle il manque « percolation » ne
 * doit pas décaler les colonnes des onze autres.
 */
function construireTableauDonnees(titre: string, valeurs: readonly unknown[]): TableauDonnees | null {
  if (valeurs.length === 0) return null;

  const objets = valeurs.filter(
    (valeur): valeur is Record<string, unknown> =>
      valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur),
  );

  // Tableau de valeurs simples : une seule colonne, numérotée.
  if (objets.length === 0) {
    return {
      titre,
      colonnes: ['N°', 'Valeur'],
      lignes: valeurs
        .slice(0, MAXIMUM_LIGNES_TABLEAU)
        .map((valeur, index) => [String(index + 1), formaterScalaire(valeur)]),
    };
  }

  const cles: string[] = [];
  for (const objet of objets) {
    for (const cle of Object.keys(objet)) {
      if (!cles.includes(cle)) cles.push(cle);
    }
  }

  return {
    titre,
    colonnes: ['N°', ...cles],
    lignes: objets
      .slice(0, MAXIMUM_LIGNES_TABLEAU)
      .map((objet, index) => [
        String(index + 1),
        ...cles.map((cle) => {
          const valeur = objet[cle];
          return Array.isArray(valeur) || (valeur !== null && typeof valeur === 'object')
            ? `${Array.isArray(valeur) ? valeur.length : Object.keys(valeur as object).length} valeurs`
            : formaterScalaire(valeur);
        }),
      ]),
  };
}
