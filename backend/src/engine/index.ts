/**
 * Point d'entrée unique du moteur de calcul d'Irrigation Pro.
 *
 * **Ce dossier ne quitte jamais le serveur** (décision D-007). L'application
 * cliente envoie des paramètres et reçoit des résultats ; aucune formule, aucun
 * coefficient métier ne transite.
 *
 * Trois surfaces publiques, et rien d'autre :
 *
 *  - `calculer(module, entrees)` — exécute un module. **Synchrone** : le moteur
 *    est fait de fonctions pures, sans base de données ni entrée/sortie.
 *  - `listerModules()` — catalogue des modules et de leurs champs, pour que
 *    l'application construise ses formulaires **sans connaître les formules**.
 *  - `listerReferences(table)` / `listerTablesDeReference()` — listes
 *    déroulantes, sous forme de couples `{ cle, libelle }` **uniquement**.
 *
 * Les erreurs sont de deux natures, distinguées par `ErreurCalcul.categorie` :
 * `VALIDATION` (→ 400) et `CALCUL_IMPOSSIBLE` (→ 422).
 */

import { ErreurValidation, type ErreurCalcul } from './erreurs.js';
import type { ChampSaisie, ChampSortie, DescriptionModule, ResultatMoteur } from './types.js';

import { CODE_MODULE_DOSES, calculerDoses } from './commun/doses.js';
import {
  CODE_MODULE_BESOINS_EAU_GRAVITAIRE,
  CODE_MODULE_BESOINS_EAU_SOUS_PRESSION,
  calculerBesoinsEauGravitaire,
  calculerBesoinsEauSousPression,
} from './commun/besoins-eau.js';
import {
  CODE_MODULE_IRRIGATIONS_GRAVITAIRE,
  CODE_MODULE_IRRIGATIONS_SOUS_PRESSION,
  calculerIrrigationsGravitaire,
  calculerIrrigationsSousPression,
} from './commun/irrigations.js';
import { CODE_MODULE_CAPACITE, calculerCapacite } from './commun/capacite.js';
import { CODE_MODULE_EFFICIENCES, calculerEfficiences } from './commun/efficiences.js';
import { CODE_MODULE_CANAL_MANNING, calculerCanalManning } from './gravitaire/canaux-manning.js';
import { CODE_MODULE_DFC_DMP, calculerDfcDmp } from './gravitaire/dfc-dmp.js';
import { CODE_MODULE_ASPERSION, calculerAspersion } from './sous-pression/aspersion.js';
import {
  CODE_MODULE_GOUTTE_A_GOUTTE,
  calculerGoutteAGoutte,
} from './sous-pression/goutte-a-goutte.js';
import {
  CODE_MODULE_HAZEN_WILLIAMS,
  calculerReseauHazenWilliams,
} from './sous-pression/hazen-williams.js';
import { CODE_MODULE_POMPE, calculerPompe } from './sous-pression/pompe.js';
import {
  CODE_MODULE_CHRISTIANSEN,
  calculerChristiansen,
} from './sous-pression/christiansen.js';

import {
  LIBELLES_ENRACINEMENT,
  listerCultures,
  listerTypesSol,
} from './tables/sols-cultures.js';
import {
  listerCulturesDesign,
  listerLongueursCanal,
  listerMethodesApplication,
  listerRevetementsCanal,
  listerTechniquesSurface,
} from './tables/efficiences.js';
import {
  MAINS_D_EAU_USUELLES,
  PERTES_CANAUX_NON_REVETUS,
  listerNaturesParoi,
} from './tables/canaux.js';
import {
  DEBITS_GOUTTEURS_USUELS,
  DIAMETRES_COMMERCIAUX_MM,
  listerClassesVent,
  listerClimats,
  listerMateriauxConduite,
  listerMethodesSousPression,
  listerTypesConduite,
} from './tables/sous-pression.js';
import {
  listerMateriauxRampe,
  listerPositionsOrifice,
} from './tables/christiansen.js';

// ---------------------------------------------------------------------------
//  Réexports publics
// ---------------------------------------------------------------------------

export { ENGINE_VERSION } from './version.js';
export {
  CategorieErreur,
  ErreurCalcul,
  ErreurCalculImpossible,
  ErreurValidation,
  estErreurMoteur,
} from './erreurs.js';
export type {
  Avertissement,
  ChampSaisie,
  ChampSortie,
  DescriptionModule,
  ResultatMoteur,
  TypeChamp,
} from './types.js';

// ---------------------------------------------------------------------------
//  Registre des modules
// ---------------------------------------------------------------------------

/** Signature commune à tous les modules : une entrée non typée, un résultat. */
type FonctionCalcul = (entree: unknown) => ResultatMoteur<unknown>;

interface EntreeRegistre {
  readonly description: DescriptionModule;
  readonly calculer: FonctionCalcul;
}

// --- Petits constructeurs de descripteurs, pour garder le catalogue lisible.

function champNombre(
  champ: string,
  libelle: string,
  unite: string | null,
  options: Partial<ChampSaisie> = {},
): ChampSaisie {
  return { champ, libelle, type: 'nombre', unite, obligatoire: true, ...options };
}

function champListe(
  champ: string,
  libelle: string,
  table: string,
  options: Partial<ChampSaisie> = {},
): ChampSaisie {
  return { champ, libelle, type: 'liste', unite: null, obligatoire: true, table, ...options };
}

function champBooleen(
  champ: string,
  libelle: string,
  options: Partial<ChampSaisie> = {},
): ChampSaisie {
  return {
    champ,
    libelle,
    type: 'booleen',
    unite: null,
    obligatoire: false,
    defaut: false,
    ...options,
  };
}

function champTableau(champ: string, libelle: string, aide: string): ChampSaisie {
  return { champ, libelle, type: 'tableau', unite: null, obligatoire: true, aide };
}

function sortie(
  champ: string,
  libelle: string,
  unite: string | null,
  options: Partial<ChampSortie> = {},
): ChampSortie {
  return { champ, libelle, unite, principal: false, ...options };
}

const REGISTRE: ReadonlyArray<EntreeRegistre> = Object.freeze([
  // ------------------------------------------------------------------ Module 1
  {
    description: {
      code: CODE_MODULE_DOSES,
      nom: 'Doses d’irrigation (nette et brute)',
      famille: 'COMMUN',
      origine: 'Feuille 1_Doses (classeurs gravitaire et sous pression)',
      description:
        'Détermine la dose nette à apporter à chaque arrosage, par lecture de table ou par la formule de la réserve facilement utilisable, puis la dose brute en tenant compte de l’efficience.',
      entrees: [
        champListe('variante', 'Type de réseau', 'variantes', { defaut: 'GRAVITAIRE' }),
        champListe('culture', 'Culture', 'cultures', {
          obligatoire: false,
          aide: 'Détermine la profondeur d’enracinement (méthode rapide).',
        }),
        champListe('typeSol', 'Type de sol', 'types-sol', { obligatoire: false }),
        champNombre('p', 'Facteur de tarissement p', null, {
          obligatoire: false,
          min: 0,
          max: 1,
          pas: 0.05,
          aide: 'Méthode détaillée. Valeurs usuelles FAO 56 : 0,3 à 0,7.',
        }),
        champNombre('thetaCc', 'Humidité à la capacité au champ', 'cm³/cm³', {
          obligatoire: false,
          min: 0,
          max: 1,
          pas: 0.01,
        }),
        champNombre('thetaPf', 'Humidité au point de flétrissement', 'cm³/cm³', {
          obligatoire: false,
          min: 0,
          max: 1,
          pas: 0.01,
        }),
        champNombre('profondeurRacinaire', 'Profondeur racinaire Z', 'cm', {
          obligatoire: false,
          min: 0,
        }),
        champListe('sourceDnRetenue', 'Origine de la dose nette retenue', 'sources-dose', {
          defaut: 'TABLE',
        }),
        champNombre('dnSaisie', 'Dose nette imposée', 'mm', { obligatoire: false, min: 0 }),
        champListe('typeEfficience', 'Efficience utilisée', 'types-efficience', {
          defaut: 'Ea',
        }),
        champNombre('valeurEfficience', 'Valeur de l’efficience', '%', {
          obligatoire: false,
          min: 0,
          max: 100,
          aide: 'En gravitaire : à reprendre du module Efficiences. En sous pression : déduite de la méthode d’irrigation si elle est laissée vide.',
        }),
        champListe('methodeIrrigation', 'Méthode d’irrigation', 'methodes-sous-pression', {
          obligatoire: false,
        }),
      ],
      sorties: [
        sortie('dnRetenue', 'Dose nette retenue', 'mm', { principal: true, groupe: 'Doses' }),
        sortie('db', 'Dose brute', 'mm', { principal: true, groupe: 'Doses' }),
        sortie('dnSuggere', 'Dose nette suggérée par la table', 'mm', { groupe: 'Doses' }),
        sortie('ru', 'Réserve utile du sol', 'mm', { groupe: 'Méthode détaillée' }),
        sortie('dnMethodeB', 'Dose nette calculée (formule RFU)', 'mm', {
          groupe: 'Méthode détaillée',
        }),
        sortie('efficienceUtilisee', 'Efficience appliquée', '%', { groupe: 'Doses' }),
        sortie('libelleCategorieEnracinement', 'Catégorie d’enracinement', null, {
          groupe: 'Méthode rapide',
        }),
      ],
    },
    calculer: calculerDoses,
  },

  // ------------------------------------------------------- Module 2 gravitaire
  {
    description: {
      code: CODE_MODULE_BESOINS_EAU_GRAVITAIRE,
      nom: 'Besoins en eau des cultures — assolement (gravitaire)',
      famille: 'GRAVITAIRE',
      origine: 'Feuille 2_Besoins_eau (classeur gravitaire)',
      description:
        'Calcule le besoin net mensuel de chaque culture par la méthode FAO, puis le besoin net assolé du périmètre, le mois de pointe et le besoin total du cycle.',
      entrees: [
        champNombre('at', 'Superficie totale du périmètre', 'ha', { min: 0 }),
        champBooleen('irrigationLocalisee', 'Irrigation localisée'),
        champNombre('kr', 'Coefficient de réduction Kr', null, {
          obligatoire: false,
          min: 0,
          max: 1,
          pas: 0.05,
        }),
        champTableau(
          'cultures',
          'Assolement',
          'Une à deux cultures : nom, surface en hectares, et les 12 coefficients culturaux Kc.',
        ),
        champTableau(
          'mois',
          'Calendrier climatique',
          '12 mois : nombre de jours, ETO (mm/j), pluie efficace (mm/mois), percolation (mm/mois), contribution des eaux souterraines (mm/mois).',
        ),
        champBooleen('diviserParEfficience', 'Diviser le besoin assolé par l’efficience', {
          aide: 'Désactivé par défaut : le classeur d’origine ne divise pas, malgré son en-tête.',
        }),
        champNombre('efficience', 'Efficience E', '%', { obligatoire: false, min: 0, max: 100 }),
      ],
      sorties: [
        sortie('besoinNetDePointe', 'Besoin net mensuel de pointe', 'mm/mois', {
          principal: true,
          groupe: 'Synthèse',
        }),
        sortie('bEnTotal', 'Besoin net total du cycle', 'mm', {
          principal: true,
          groupe: 'Synthèse',
        }),
        sortie('moisDePointe', 'Rang du mois de pointe', null, { groupe: 'Synthèse' }),
        sortie('joursMoisDePointe', 'Jours du mois de pointe', 'j', { groupe: 'Synthèse' }),
        sortie('volumeTotalM3', 'Volume annuel', 'm³', { groupe: 'Synthèse' }),
      ],
    },
    calculer: calculerBesoinsEauGravitaire,
  },

  // --------------------------------------------------- Module 2 sous pression
  {
    description: {
      code: CODE_MODULE_BESOINS_EAU_SOUS_PRESSION,
      nom: 'Besoins en eau des cultures (sous pression)',
      famille: 'SOUS_PRESSION',
      origine: 'Feuille 2_Besoins_eau (classeur sous pression)',
      description:
        'Calcule le besoin net et le besoin brut mensuels d’une culture unique, le mois de pointe et le besoin total du cycle. Les mois excédentaires en pluie sont signalés puis ramenés à zéro dans les totaux.',
      entrees: [
        champNombre('at', 'Superficie totale', 'ha', { min: 0 }),
        champListe('culture', 'Culture', 'cultures', { obligatoire: false }),
        champBooleen('irrigationLocalisee', 'Irrigation localisée'),
        champNombre('kr', 'Coefficient de réduction Kr', null, {
          obligatoire: false,
          min: 0,
          max: 1,
          pas: 0.05,
          aide: 'Kr vaut 1 en aspersion (couverture totale).',
        }),
        champNombre('ea', 'Efficience d’application Ea', '%', { min: 0, max: 100 }),
        champTableau(
          'mois',
          'Calendrier climatique',
          '12 mois : nombre de jours, ETO (mm/j), Kc, pluie efficace (mm/mois), percolation (mm/mois), contribution des eaux souterraines (mm/mois).',
        ),
      ],
      sorties: [
        sortie('besoinNetDePointe', 'Besoin net mensuel de pointe', 'mm/mois', {
          principal: true,
          groupe: 'Synthèse',
        }),
        sortie('bEnTotal', 'Besoin net total du cycle', 'mm', {
          principal: true,
          groupe: 'Synthèse',
          aide: 'Somme des besoins mensuels, excédents de pluie ramenés à zéro.',
        }),
        sortie('bEnTotalClasseur', 'Besoin net total — méthode du classeur', 'mm', {
          groupe: 'Synthèse',
          aide: 'Somme incluant les valeurs négatives. Fournie pour comparaison avec le tableur ; ne pas dimensionner sur cette valeur.',
        }),
        sortie('bEbTotal', 'Besoin brut total du cycle', 'mm', { groupe: 'Synthèse' }),
        sortie('moisDePointe', 'Rang du mois de pointe', null, { groupe: 'Synthèse' }),
        sortie('joursMoisDePointe', 'Jours du mois de pointe', 'j', { groupe: 'Synthèse' }),
        sortie('volumeTotalM3', 'Volume total', 'm³', { groupe: 'Synthèse' }),
      ],
    },
    calculer: calculerBesoinsEauSousPression,
  },

  // ------------------------------------------------------- Module 3 gravitaire
  {
    description: {
      code: CODE_MODULE_IRRIGATIONS_GRAVITAIRE,
      nom: 'Nombre d’irrigations, espacement et cycle (gravitaire)',
      famille: 'GRAVITAIRE',
      origine: 'Feuille 3_Nb_Irrig_ESP_IC (classeur gravitaire)',
      description:
        'Détermine le nombre d’arrosages du cycle, puis mois par mois l’espacement entre deux arrosages. Le mois le plus exigeant fixe le cycle d’irrigation retenu pour le design.',
      entrees: [
        champNombre('dnRetenue', 'Dose nette retenue', 'mm', { min: 0 }),
        champNombre('bEnTotal', 'Besoin net total du cycle', 'mm', { min: 0 }),
        champTableau(
          'mois',
          'Besoins mensuels',
          '12 mois : nombre de jours et besoin net assolé (mm/mois), repris du module des besoins en eau.',
        ),
      ],
      sorties: [
        sortie('icRetenu', 'Cycle d’irrigation retenu', 'j', {
          principal: true,
          groupe: 'Synthèse',
        }),
        sortie('niArrondi', 'Nombre d’arrosages (planification)', null, {
          principal: true,
          groupe: 'Synthèse',
        }),
        sortie('ni', 'Nombre d’irrigations théorique', null, { groupe: 'Synthèse' }),
        sortie('espMini', 'Espacement minimal', 'j', { groupe: 'Synthèse' }),
        sortie('moisEspMini', 'Mois le plus exigeant', null, { groupe: 'Synthèse' }),
      ],
    },
    calculer: calculerIrrigationsGravitaire,
  },

  // --------------------------------------------------- Module 3 sous pression
  {
    description: {
      code: CODE_MODULE_IRRIGATIONS_SOUS_PRESSION,
      nom: 'Nombre d’irrigations, espacement et cycle (sous pression)',
      famille: 'SOUS_PRESSION',
      origine: 'Feuille 3_Nb_Irrig_ESP_IC (classeur sous pression)',
      description:
        'Version compacte : tout est calculé sur le seul mois de pointe. Un cycle nul ou négatif est refusé, car il n’a pas de sens physique.',
      entrees: [
        champNombre('dnRetenue', 'Dose nette retenue', 'mm', { min: 0 }),
        champNombre('bEnTotal', 'Besoin net total du cycle', 'mm'),
        champNombre('besoinNetDePointe', 'Besoin net du mois de pointe', 'mm/mois', { min: 0 }),
        champNombre('joursMoisDePointe', 'Jours du mois de pointe', 'j', { min: 1, max: 31 }),
      ],
      sorties: [
        sortie('ic', 'Cycle d’irrigation', 'j', { principal: true, groupe: 'Synthèse' }),
        sortie('niArrondi', 'Nombre d’arrosages (planification)', null, {
          principal: true,
          groupe: 'Synthèse',
        }),
        sortie('ni', 'Nombre d’irrigations théorique', null, { groupe: 'Synthèse' }),
        sortie('esp', 'Espacement entre arrosages', 'j', { groupe: 'Synthèse' }),
        sortie('benParJour', 'Besoin net journalier de pointe', 'mm/j', { groupe: 'Synthèse' }),
      ],
    },
    calculer: calculerIrrigationsSousPression,
  },

  // ------------------------------------------------------------------ Module 4
  {
    description: {
      code: CODE_MODULE_CAPACITE,
      nom: 'Capacité / débit du système',
      famille: 'COMMUN',
      origine: 'Feuilles 4_Capacite_Systeme et 4_Debit_Systeme',
      description:
        'Détermine le débit que doit fournir le système. Les besoins n’interviennent que par le cycle d’irrigation : c’est la dose brute qui dimensionne.',
      entrees: [
        champListe('variante', 'Type de réseau', 'variantes', { defaut: 'GRAVITAIRE' }),
        champNombre('at', 'Superficie totale', 'ha', { min: 0 }),
        champNombre('ic', 'Cycle d’irrigation', 'j', { min: 0 }),
        champNombre('db', 'Dose brute', 'mm', { min: 0 }),
        champNombre('t', 'Durée d’irrigation par jour', 'h', { min: 0, max: 24 }),
        champNombre('et', 'Efficience de transport Et', null, {
          obligatoire: false,
          min: 0,
          max: 1,
          pas: 0.05,
          aide: 'Fraction entre 0 et 1. Bloc de sensibilité propre au réseau gravitaire.',
        }),
      ],
      sorties: [
        sortie('qLitresParSeconde', 'Débit du système', 'l/s', {
          principal: true,
          groupe: 'Débit',
        }),
        sortie('qM3ParHeure', 'Débit du système', 'm³/h', { principal: true, groupe: 'Débit' }),
        sortie('qM3ParSeconde', 'Débit du système', 'm³/s', { groupe: 'Débit' }),
        sortie('a', 'Superficie irriguée par jour', 'ha/j', { groupe: 'Bases' }),
        sortie('v', 'Volume prélevé par jour', 'm³/j', { groupe: 'Bases' }),
        sortie('debitDisponible', 'Débit disponible en aval', 'l/s', { groupe: 'Transport' }),
      ],
    },
    calculer: calculerCapacite,
  },

  // ------------------------------------------------------------------ Module 5
  {
    description: {
      code: CODE_MODULE_EFFICIENCES,
      nom: 'Calculateur d’efficiences',
      famille: 'GRAVITAIRE',
      origine: 'Feuille 5_Efficiences (classeur gravitaire)',
      description:
        'Combine les efficiences de transport, de bloc et d’application pour obtenir les efficiences de distribution, d’irrigation et de projet, avec contrôles de cohérence.',
      entrees: [
        champNombre('et', 'Efficience de transport Et', '%', { min: 0, max: 100 }),
        champNombre('eb', 'Efficience des canaux du bloc Eb', '%', { min: 0, max: 100 }),
        champNombre('ea', 'Efficience d’application Ea', '%', {
          obligatoire: false,
          min: 0,
          max: 100,
          aide: 'Laissez vide pour la déduire de la méthode d’irrigation.',
        }),
        champListe('methodeApplication', 'Méthode d’irrigation', 'methodes-application', {
          obligatoire: false,
        }),
      ],
      sorties: [
        sortie('ep', 'Efficience de projet Ep', '%', { principal: true, groupe: 'Efficiences' }),
        sortie('ed', 'Efficience de distribution Ed', '%', { groupe: 'Efficiences' }),
        sortie('ei', 'Efficience d’irrigation Ei', '%', { groupe: 'Efficiences' }),
        sortie('epFraction', 'Efficience de projet (fraction)', null, { groupe: 'Efficiences' }),
        sortie('controles.coherent', 'Contrôles de cohérence', null, { groupe: 'Contrôles' }),
      ],
    },
    calculer: calculerEfficiences,
  },

  // ------------------------------------------------------------------ Module 6
  {
    description: {
      code: CODE_MODULE_CANAL_MANNING,
      nom: 'Canal trapézoïdal (Manning-Strickler)',
      famille: 'GRAVITAIRE',
      origine: 'Feuille 6_Canaux_Manning (classeur gravitaire)',
      description:
        'Détermine le tirant d’eau qui fait passer le débit cible dans un canal trapézoïdal, puis contrôle la vitesse, calcule la revanche et rappelle la pente recommandée.',
      entrees: [
        champNombre('qCible', 'Débit cible', 'm³/s', { min: 0 }),
        champListe('natureParoi', 'Nature de la paroi', 'natures-paroi', { obligatoire: false }),
        champNombre('n', 'Coefficient de rugosité imposé', null, { obligatoire: false, min: 0 }),
        champNombre('b', 'Largeur au fond b', 'm', { min: 0 }),
        champNombre('m', 'Fruit des talus m', null, {
          min: 0,
          aide: 'Rapport horizontal / vertical. 0 = canal rectangulaire.',
        }),
        champNombre('i', 'Pente longitudinale I', 'm/m', { min: 0, pas: 0.0001 }),
        champNombre('h', 'Tirant d’eau imposé', 'm', {
          obligatoire: false,
          min: 0,
          aide: 'Laissez vide pour que le tirant d’eau soit résolu numériquement.',
        }),
      ],
      sorties: [
        sortie('h', 'Tirant d’eau', 'm', { principal: true, groupe: 'Section' }),
        sortie('vitesse', 'Vitesse d’écoulement', 'm/s', { principal: true, groupe: 'Contrôles' }),
        sortie('qCalcule', 'Débit obtenu', 'm³/s', { groupe: 'Vérification' }),
        sortie('ecart', 'Écart au débit cible', 'm³/s', { groupe: 'Vérification' }),
        sortie('s', 'Section mouillée', 'm²', { groupe: 'Section' }),
        sortie('p', 'Périmètre mouillé', 'm', { groupe: 'Section' }),
        sortie('r', 'Rayon hydraulique', 'm', { groupe: 'Section' }),
        sortie('ks', 'Coefficient de Strickler', null, { groupe: 'Section' }),
        sortie('revanche.j', 'Revanche', 'm', { groupe: 'Ouvrage' }),
        sortie('revanche.hauteurTotale', 'Hauteur totale du canal', 'm', { groupe: 'Ouvrage' }),
        sortie('penteRecommandee', 'Pente recommandée', null, { groupe: 'Ouvrage' }),
      ],
    },
    calculer: calculerCanalManning,
  },

  // ------------------------------------------------------------------ Module 7
  {
    description: {
      code: CODE_MODULE_DFC_DMP,
      nom: 'Débit fictif continu, débit de pointe et quartiers',
      famille: 'GRAVITAIRE',
      origine: 'Feuille 7_DFC_DMP (classeur gravitaire)',
      description:
        'Exprime la capacité du système en débit spécifique par hectare, pour découper le périmètre en quartiers hydrauliques.',
      entrees: [
        champNombre('qmPointe', 'Besoin net mensuel de pointe', 'mm/mois', { min: 0 }),
        champNombre('joursMoisDePointe', 'Jours du mois de pointe', 'j', { min: 1, max: 31 }),
        champNombre('epPourcent', 'Efficience de projet Ep', '%', { min: 0, max: 100 }),
        champNombre('k', 'Coefficient de pointe K', null, {
          obligatoire: false,
          min: 1,
          pas: 0.05,
          defaut: 1.2,
          aide: 'De 1,1 à 1,3 ; valeur courante 1,2.',
        }),
        champNombre('mainDEau', 'Main d’eau', 'l/s', { min: 0 }),
        champNombre('at', 'Superficie totale', 'ha', { min: 0 }),
        champNombre('bEnTotal', 'Besoin net total du cycle', 'mm', { min: 0 }),
        champNombre('dnRetenue', 'Dose nette retenue', 'mm', { min: 0 }),
      ],
      sorties: [
        sortie('dmp', 'Débit maximal de pointe', 'l/s/ha', {
          principal: true,
          groupe: 'Débits spécifiques',
        }),
        sortie('nombreQuartiers', 'Nombre de quartiers', null, {
          principal: true,
          groupe: 'Découpage',
        }),
        sortie('dfcNet', 'Débit fictif continu net', 'l/s/ha', { groupe: 'Débits spécifiques' }),
        sortie('dfcBrut', 'Débit fictif continu brut', 'l/s/ha', { groupe: 'Débits spécifiques' }),
        sortie('w', 'Superficie par main d’eau', 'ha', { groupe: 'Découpage' }),
        sortie('nombreArrosages', 'Nombre d’arrosages du cycle', null, { groupe: 'Découpage' }),
      ],
    },
    calculer: calculerDfcDmp,
  },

  // ---------------------------------------------------- Module 5 sous pression
  {
    description: {
      code: CODE_MODULE_ASPERSION,
      nom: 'Réseau d’aspersion',
      famille: 'SOUS_PRESSION',
      origine: 'Feuille 5_Aspersion (classeur sous pression)',
      description:
        'Détermine l’espacement des arroseurs selon le vent, la pluviométrie de l’installation, le nombre d’arroseurs simultanés et la durée d’arrosage par position. Vérifie automatiquement que le réseau couvre bien la surface sur le cycle.',
      entrees: [
        champNombre('dm', 'Diamètre mouillé de l’arroseur', 'm', { min: 0 }),
        champListe('classeVent', 'Classe de vent', 'classes-vent'),
        champNombre('q', 'Débit d’un arroseur', 'l/h', { min: 0 }),
        champNombre('ki', 'Vitesse d’infiltration du sol', 'mm/h', { obligatoire: false, min: 0 }),
        champNombre('qSystemeLitresParSeconde', 'Débit du système', 'l/s', { min: 0 }),
        champNombre('db', 'Dose brute', 'mm', { min: 0 }),
        champNombre('t', 'Durée d’irrigation par jour', 'h', { min: 0, max: 24 }),
        champNombre('at', 'Superficie totale', 'ha', { obligatoire: false, min: 0 }),
        champNombre('ic', 'Cycle d’irrigation', 'j', { obligatoire: false, min: 0 }),
      ],
      sorties: [
        sortie('pr', 'Pluviométrie de l’installation', 'mm/h', {
          principal: true,
          groupe: 'Disposition',
        }),
        sortie('dureeParPosition', 'Durée par position', 'h', {
          principal: true,
          groupe: 'Fonctionnement',
        }),
        sortie('se', 'Espacement entre rampes Se', 'm', { groupe: 'Disposition' }),
        sortie('sl', 'Espacement entre arroseurs Sl', 'm', { groupe: 'Disposition' }),
        sortie('surfaceParArroseur', 'Surface par arroseur', 'm²', { groupe: 'Disposition' }),
        sortie('nArroseurs', 'Arroseurs simultanés', null, { groupe: 'Fonctionnement' }),
        sortie('surfaceSimultanee', 'Surface irriguée simultanément', 'ha', {
          groupe: 'Fonctionnement',
        }),
        sortie('positionsParJour', 'Positions par jour', null, { groupe: 'Fonctionnement' }),
        sortie('verificationCouverture.conforme', 'Couverture du cycle vérifiée', null, {
          groupe: 'Contrôles',
        }),
      ],
    },
    calculer: calculerAspersion,
  },

  // ---------------------------------------------------- Module 6 sous pression
  {
    description: {
      code: CODE_MODULE_GOUTTE_A_GOUTTE,
      nom: 'Réseau goutte-à-goutte',
      famille: 'SOUS_PRESSION',
      origine: 'Feuille 6_Goutte_a_goutte (classeur sous pression)',
      description:
        'Calcule le débit par plant, le pourcentage de surface mouillée, le découpage en secteurs et la durée d’arrosage par poste.',
      entrees: [
        champNombre('sp', 'Espacement entre plants Sp', 'm', { min: 0 }),
        champNombre('sr', 'Espacement entre rampes Sr', 'm', { min: 0 }),
        champNombre('ne', 'Goutteurs par plant Ne', null, { min: 1, pas: 1 }),
        champNombre('qa', 'Débit d’un goutteur', 'l/h', { min: 0 }),
        champNombre('dw', 'Diamètre du bulbe mouillé Dw', 'm', { min: 0 }),
        champListe('climat', 'Climat', 'climats'),
        champNombre('qSystemeLitresParSeconde', 'Débit du système', 'l/s', { min: 0 }),
        champNombre('at', 'Superficie totale', 'ha', { min: 0 }),
        champNombre('db', 'Dose brute', 'mm', { min: 0 }),
      ],
      sorties: [
        sortie('pw', 'Surface mouillée', '%', { principal: true, groupe: 'Contrôles' }),
        sortie('dureeParPoste', 'Durée par poste', 'h', {
          principal: true,
          groupe: 'Fonctionnement',
        }),
        sortie('qp', 'Débit par plant', 'l/h', { groupe: 'Émetteurs' }),
        sortie('pwMini', 'Surface mouillée minimale recommandée', '%', { groupe: 'Contrôles' }),
        sortie('plantsParHa', 'Densité de plantation', 'plants/ha', { groupe: 'Émetteurs' }),
        sortie('debitParHa', 'Débit par hectare', 'l/h/ha', { groupe: 'Émetteurs' }),
        sortie('surfaceSimultanee', 'Surface irrigable simultanément', 'ha', {
          groupe: 'Fonctionnement',
        }),
        sortie('nombreDeSecteurs', 'Nombre de secteurs', null, { groupe: 'Fonctionnement' }),
        sortie('volumeParPlant', 'Volume par plant et par arrosage', 'L', {
          groupe: 'Fonctionnement',
        }),
      ],
    },
    calculer: calculerGoutteAGoutte,
  },

  // ---------------------------------------------------- Module 7 sous pression
  {
    description: {
      code: CODE_MODULE_HAZEN_WILLIAMS,
      nom: 'Réseau — pertes de charge (Hazen-Williams)',
      famille: 'SOUS_PRESSION',
      origine: 'Feuille 7_Reseau_Hazen_Williams (classeur sous pression)',
      description:
        'Calcule la perte de charge de chaque tronçon du réseau, applique le facteur de Christiansen aux conduites à sorties multiples, contrôle les vitesses et agrège les pertes pour le calcul de la pompe.',
      entrees: [
        champTableau(
          'troncons',
          'Tronçons du réseau',
          'Un tronçon par ligne : nom, type (rampe, porte-rampe, secondaire, principale, refoulement), matériau, diamètre intérieur (mm), débit (l/s), longueur (m), nombre de sorties.',
        ),
      ],
      sorties: [
        sortie('deltaHTotal', 'Pertes de charge linéaires totales', 'm', {
          principal: true,
          groupe: 'Réseau',
        }),
        sortie('vitesseMaximale', 'Vitesse maximale du réseau', 'm/s', {
          principal: true,
          groupe: 'Contrôles',
        }),
        sortie('tronconsHorsPlage', 'Tronçons hors plage de vitesse', null, {
          groupe: 'Contrôles',
        }),
      ],
    },
    calculer: calculerReseauHazenWilliams,
  },

  // ---------------------------------------------------- Module 8 sous pression
  {
    description: {
      code: CODE_MODULE_POMPE,
      nom: 'Hauteur manométrique et puissance de pompage',
      famille: 'SOUS_PRESSION',
      origine: 'Feuille 8_HMT_Pompe (classeur sous pression)',
      description:
        'Additionne la hauteur géométrique, la pression de service et les pertes de charge pour obtenir la hauteur manométrique totale, puis en déduit les puissances hydraulique et absorbée.',
      entrees: [
        champNombre('hg', 'Hauteur géométrique Hg', 'm', { min: 0 }),
        champNombre('pressionServiceBar', 'Pression de service', 'bar', { min: 0, pas: 0.1 }),
        champNombre('deltaHLineaire', 'Pertes de charge linéaires', 'm', { min: 0 }),
        champNombre('pourcentSingulieres', 'Pertes singulières', '%', {
          obligatoire: false,
          min: 0,
          max: 100,
          defaut: 10,
          aide: 'En pourcentage des pertes linéaires : coudes, vannes, filtres.',
        }),
        champNombre('qM3ParSeconde', 'Débit de la pompe', 'm³/s', { min: 0 }),
        champNombre('rendement', 'Rendement global η', null, {
          min: 0,
          max: 1,
          pas: 0.05,
          aide: 'Fraction entre 0 et 1, pompe et moteur réunis.',
        }),
      ],
      sorties: [
        sortie('hmt', 'Hauteur manométrique totale', 'm', { principal: true, groupe: 'Pompe' }),
        sortie('pa', 'Puissance absorbée', 'kW', { principal: true, groupe: 'Pompe' }),
        sortie('paCv', 'Puissance absorbée', 'CV', { groupe: 'Pompe' }),
        sortie('ph', 'Puissance hydraulique', 'kW', { groupe: 'Pompe' }),
        sortie('pressionServiceM', 'Pression de service', 'mCE', { groupe: 'Charges' }),
        sortie('deltaHSingulieres', 'Pertes de charge singulières', 'm', { groupe: 'Charges' }),
      ],
    },
    calculer: calculerPompe,
  },

  // ---------------------------------------------------- Module 9 sous pression
  {
    description: {
      code: CODE_MODULE_CHRISTIANSEN,
      nom: 'Facteur de Christiansen (table)',
      famille: 'SOUS_PRESSION',
      origine: 'Feuille 9_Coeff_Fn_Rampe (classeur sous pression)',
      description:
        'Lit ou interpole le facteur de réduction de perte de charge d’une rampe à sorties multiples, et le compare à la formule continue utilisée par le module des pertes de charge.',
      entrees: [
        champNombre('n', 'Nombre de sorties sur la rampe', null, { min: 1, pas: 1 }),
        champListe('materiau', 'Matériau de la rampe', 'materiaux-rampe'),
        champListe('position', 'Position du premier orifice', 'positions-orifice'),
      ],
      sorties: [
        sortie('f', 'Facteur de Christiansen (table)', null, {
          principal: true,
          groupe: 'Facteur',
        }),
        sortie('fFormuleContinue', 'Facteur de Christiansen (formule continue)', null, {
          principal: true,
          groupe: 'Facteur',
        }),
        sortie('ecartRelatifAvecFormule', 'Écart relatif table / formule', null, {
          groupe: 'Contrôles',
        }),
        sortie('source', 'Origine de la valeur', null, { groupe: 'Facteur' }),
      ],
    },
    calculer: calculerChristiansen,
  },
]);

const INDEX_MODULES = new Map(REGISTRE.map((entree) => [entree.description.code, entree]));

/** Catalogue complet des modules. Aucun coefficient métier n'y figure. */
export function listerModules(): readonly DescriptionModule[] {
  return REGISTRE.map((entree) => entree.description);
}

/** Fiche d'un module, ou `undefined` s'il n'existe pas. */
export function decrireModule(code: string): DescriptionModule | undefined {
  return INDEX_MODULES.get(code)?.description;
}

/** `true` si le code correspond à un module du registre. */
export function estModuleConnu(code: string): boolean {
  return INDEX_MODULES.has(code);
}

/**
 * Exécute un module. **Synchrone** — le moteur ne fait aucune entrée/sortie.
 *
 * Lève une `ErreurValidation` (→ 400) si le module est inconnu ou si la saisie
 * est invalide, une `ErreurCalculImpossible` (→ 422) si le calcul n'a pas de
 * sens physique.
 */
export function calculer(module: string, entrees: unknown): ResultatMoteur<unknown> {
  const entree = INDEX_MODULES.get(module);
  if (entree === undefined) {
    throw new ErreurValidation(
      `Le module de calcul « ${module} » n’existe pas.`,
      { code: 'MODULE_INCONNU', champ: 'module' },
    );
  }
  return entree.calculer(entrees);
}

// ---------------------------------------------------------------------------
//  Tables de référence — listes déroulantes
// ---------------------------------------------------------------------------

/** Une entrée de liste déroulante. **Jamais de coefficient métier.** */
export interface EntreeReference {
  readonly cle: string;
  readonly libelle: string;
}

function listeDeNombres(valeurs: readonly number[], unite: string): EntreeReference[] {
  return valeurs.map((valeur) => ({
    cle: String(valeur),
    libelle: `${String(valeur).replace('.', ',')} ${unite}`,
  }));
}

const TABLES_REFERENCE: Readonly<Record<string, () => readonly EntreeReference[]>> = Object.freeze({
  cultures: () => listerCultures(),
  'types-sol': () => listerTypesSol(),
  enracinements: () =>
    (Object.keys(LIBELLES_ENRACINEMENT) as Array<keyof typeof LIBELLES_ENRACINEMENT>).map(
      (cle) => ({ cle, libelle: LIBELLES_ENRACINEMENT[cle] }),
    ),
  'methodes-application': () => listerMethodesApplication(),
  'methodes-sous-pression': () => listerMethodesSousPression(),
  'techniques-surface': () => listerTechniquesSurface(),
  'longueurs-canal': () => listerLongueursCanal(),
  'revetements-canal': () => listerRevetementsCanal(),
  'cultures-design': () => listerCulturesDesign(),
  'natures-paroi': () => listerNaturesParoi(),
  'mains-eau': () => listeDeNombres(MAINS_D_EAU_USUELLES, 'l/s'),
  'materiaux-conduite': () => listerMateriauxConduite(),
  'diametres-commerciaux': () => listeDeNombres(DIAMETRES_COMMERCIAUX_MM, 'mm'),
  'types-conduite': () => listerTypesConduite(),
  'classes-vent': () => listerClassesVent(),
  climats: () => listerClimats(),
  'debits-goutteurs': () => listeDeNombres(DEBITS_GOUTTEURS_USUELS, 'l/h'),
  'materiaux-rampe': () => listerMateriauxRampe(),
  'positions-orifice': () => listerPositionsOrifice(),
  // Table H : documentaire seule, jamais branchée dans un calcul. Les valeurs
  // font partie de l'aide affichée à l'utilisateur, ce n'est pas un savoir-faire.
  'pertes-canaux': () =>
    PERTES_CANAUX_NON_REVETUS.map((ligne) => ({
      cle: ligne.cle,
      libelle: `${ligne.libelle} — ${String(ligne.mini).replace('.', ',')} à ${String(ligne.maxi).replace('.', ',')} m³/m²`,
    })),
  variantes: () => [
    { cle: 'GRAVITAIRE', libelle: 'Gravitaire (à surface libre)' },
    { cle: 'SOUS_PRESSION', libelle: 'Sous pression' },
  ],
  'sources-dose': () => [
    { cle: 'TABLE', libelle: 'Table (culture + type de sol)' },
    { cle: 'FORMULE', libelle: 'Calcul détaillé (réserve facilement utilisable)' },
    { cle: 'SAISIE', libelle: 'Valeur saisie librement' },
  ],
  'types-efficience': () => [
    { cle: 'Ea', libelle: 'Ea — efficience d’application' },
    { cle: 'Eb', libelle: 'Eb — efficience des canaux du bloc' },
    { cle: 'Ep', libelle: 'Ep — efficience de projet' },
  ],
});

/** Noms des tables de référence servies par `listerReferences()`. */
export function listerTablesDeReference(): readonly string[] {
  return Object.keys(TABLES_REFERENCE).sort();
}

/**
 * Contenu d'une table de référence : **clés et libellés seulement**.
 * Lève une `ErreurValidation` si la table n'existe pas.
 */
export function listerReferences(table: string): readonly EntreeReference[] {
  const fournisseur = TABLES_REFERENCE[table];
  if (fournisseur === undefined) {
    throw new ErreurValidation(`La table de référence « ${table} » n’existe pas.`, {
      code: 'TABLE_REFERENCE_INCONNUE',
      champ: 'table',
    });
  }
  return fournisseur();
}

/** Type utilitaire : une erreur du moteur, quelle que soit sa catégorie. */
export type ErreurMoteur = ErreurCalcul;
