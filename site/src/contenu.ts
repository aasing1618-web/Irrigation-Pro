/**
 * Le contenu éditorial du site, en un seul endroit.
 *
 * Deux raisons de le séparer des composants :
 *
 *  1. **Il doit pouvoir être relu sans lire de code.** Le propriétaire, qui
 *     n'est pas développeur, doit pouvoir corriger une formulation ici sans
 *     ouvrir un fichier de mise en page.
 *  2. **Rien n'est inventé, et cela doit rester vérifiable.** Chaque liste
 *     ci-dessous provient d'une source du dépôt, citée en commentaire. Le jour
 *     où un module change de nom dans le moteur, on sait où regarder.
 */

/* --------------------------------------------------------------- Les modules
   Source : `backend/src/engine/index.ts` (registre des modules) et les
   spécifications `docs/MOTEUR-GRAVITAIRE.md` / `docs/MOTEUR-SOUS-PRESSION.md`.
   Les noms sont ceux affichés dans le logiciel ; les descriptions en sont un
   résumé fidèle. Aucun module absent du registre ne figure ici.
   -------------------------------------------------------------------------- */

export interface Module {
  readonly nom: string;
  readonly resume: string;
}

export interface FamilleDeModules {
  readonly id: string;
  readonly titre: string;
  readonly sousTitre: string;
  readonly modules: readonly Module[];
}

export const FAMILLES_DE_MODULES: readonly FamilleDeModules[] = [
  {
    id: 'commun',
    titre: 'Communs aux deux types de réseau',
    sousTitre: 'Le point de départ de toute étude, gravitaire ou sous pression.',
    modules: [
      {
        nom: 'Doses d’irrigation, nette et brute',
        resume:
          'Par lecture de table (culture et type de sol) ou par la formule de la réserve facilement utilisable, puis la dose brute selon l’efficience retenue.',
      },
      {
        nom: 'Capacité et débit du système',
        resume:
          'Le débit que l’installation doit fournir, déduit de la dose brute, du cycle d’irrigation et de la durée d’arrosage quotidienne.',
      },
    ],
  },
  {
    id: 'gravitaire',
    titre: 'Irrigation gravitaire, à surface libre',
    sousTitre: 'Périmètres en canaux : de l’assolement au tirant d’eau.',
    modules: [
      {
        nom: 'Besoins en eau des cultures — assolement',
        resume:
          'Besoin net mensuel de chaque culture par la méthode FAO, besoin assolé du périmètre, mois de pointe et besoin total du cycle.',
      },
      {
        nom: 'Nombre d’irrigations, espacement et cycle',
        resume:
          'Nombre d’arrosages du cycle et espacement mois par mois. Le mois le plus exigeant fixe le cycle retenu pour le design.',
      },
      {
        nom: 'Calculateur d’efficiences',
        resume:
          'Transport, canaux de bloc et application combinés en efficiences de distribution, d’irrigation et de projet, avec contrôles de cohérence.',
      },
      {
        nom: 'Canal trapézoïdal (Manning-Strickler)',
        resume:
          'Tirant d’eau qui fait passer le débit cible, contrôle de la vitesse, revanche et pente longitudinale recommandée.',
      },
      {
        nom: 'Débit fictif continu, débit de pointe et quartiers',
        resume:
          'La capacité exprimée en débit spécifique par hectare, pour découper le périmètre en quartiers hydrauliques.',
      },
    ],
  },
  {
    id: 'sous-pression',
    titre: 'Irrigation sous pression',
    sousTitre: 'Aspersion et goutte-à-goutte : du goutteur jusqu’à la pompe.',
    modules: [
      {
        nom: 'Besoins en eau des cultures',
        resume:
          'Besoin net et besoin brut mensuels, mois de pointe et besoin total du cycle. Les mois excédentaires en pluie sont signalés.',
      },
      {
        nom: 'Nombre d’irrigations, espacement et cycle',
        resume:
          'Version compacte, calculée sur le seul mois de pointe. Un cycle nul ou négatif est refusé plutôt qu’arrondi.',
      },
      {
        nom: 'Réseau d’aspersion',
        resume:
          'Espacement des arroseurs selon le vent, pluviométrie de l’installation, nombre d’arroseurs simultanés et durée d’arrosage par position.',
      },
      {
        nom: 'Réseau goutte-à-goutte',
        resume:
          'Débit par plant, pourcentage de surface mouillée, découpage en secteurs et durée d’arrosage par poste.',
      },
      {
        nom: 'Pertes de charge du réseau (Hazen-Williams)',
        resume:
          'Perte de charge de chaque tronçon, facteur de Christiansen sur les conduites à sorties multiples, contrôle des vitesses admissibles.',
      },
      {
        nom: 'Hauteur manométrique et puissance de pompage',
        resume:
          'Hauteur géométrique, pression de service et pertes de charge additionnées, puis puissances hydraulique et absorbée.',
      },
      {
        nom: 'Facteur de Christiansen',
        resume:
          'Lecture ou interpolation du facteur de réduction d’une rampe à sorties multiples, comparé à la formule continue.',
      },
    ],
  },
];

/** Nombre de modules réellement disponibles — compté, jamais écrit à la main. */
export const NOMBRE_DE_MODULES: number = FAMILLES_DE_MODULES.reduce(
  (total, famille) => total + famille.modules.length,
  0,
);

/* ------------------------------------------------------------- Le pipeline
   Source : `docs/MOTEUR-GRAVITAIRE.md`, § 1 « un pipeline, pas des
   formulaires ». C'est le principe d'architecture du produit, pas une image.
   -------------------------------------------------------------------------- */

export const ETAPES_DU_PIPELINE: readonly string[] = [
  'Doses',
  'Besoins en eau',
  'Nombre d’irrigations et cycle',
  'Capacité du système',
  'Canaux ou réseau sous pression',
  'Rapport PDF',
];

/* ------------------------------------------------- Ce que le classeur ne fait pas
   Colonne de gauche : les limites d'un classeur de calcul, telles que les
   connaît quiconque en a maintenu un. Colonne de droite : le comportement
   effectif du logiciel, chacun documenté dans `docs/`.
   -------------------------------------------------------------------------- */

export interface Comparaison {
  readonly classeur: string;
  readonly logiciel: string;
}

export const COMPARAISONS: readonly Comparaison[] = [
  {
    classeur: 'Les formules vivent dans les cellules. Un tri de colonne, une ligne insérée, et le résultat change sans prévenir.',
    logiciel:
      'Les formules s’exécutent sur le serveur. Elles ne descendent jamais dans le navigateur, et personne ne peut les déplacer par accident.',
  },
  {
    classeur: 'Une vitesse hors plage, une revanche insuffisante, un cycle impossible : la cellule affiche un nombre, et se tait.',
    logiciel:
      'Les contrôles métier sont affichés à l’écran et repris dans le rapport, y compris quand ils dérangent. Ils ne peuvent pas être masqués.',
  },
  {
    classeur: 'Une étude par fichier, dans un dossier, avec des noms de version qui finissent en « final_v3_ok ».',
    logiciel:
      'Une étude par projet, ses calculs archivés avec leurs hypothèses, et un accès réservé à leur seul auteur.',
  },
  {
    classeur: 'Une sortie à recopier et à remettre en forme avant de la présenter à un client.',
    logiciel:
      'Une note de calcul PDF numérotée, générée en une action, présentable telle quelle.',
  },
];

/* ------------------------------------------------------------------ Pour qui
   Source : `CLAUDE.md` — « ingénieurs agronomes, bureaux d'études et
   installateurs en irrigation ».
   -------------------------------------------------------------------------- */

export interface Public {
  readonly qui: string;
  readonly usage: string;
}

export const PUBLICS: readonly Public[] = [
  {
    qui: 'Ingénieurs agronomes',
    usage:
      'Dimensionner un périmètre, éprouver une hypothèse, et retrouver six mois plus tard le calcul exact qui a servi.',
  },
  {
    qui: 'Bureaux d’études',
    usage:
      'Produire une note de calcul défendable devant un confrère : les hypothèses y figurent, les avertissements aussi.',
  },
  {
    qui: 'Installateurs en irrigation',
    usage:
      'Choisir un goutteur, une rampe, un diamètre, une pompe — et pouvoir justifier chaque choix par écrit.',
  },
];

/* ------------------------------------------------------------- Le rapport PDF
   Source : `docs/VAGUE-3.md`, § « Le rapport PDF ». L'ordre est celui du
   document réellement produit.
   -------------------------------------------------------------------------- */

export interface PartieDuRapport {
  readonly titre: string;
  readonly detail: string;
}

export const PARTIES_DU_RAPPORT: readonly PartieDuRapport[] = [
  {
    titre: 'Page de garde',
    detail: 'Projet, client final, localisation, date, auteur et référence du document.',
  },
  {
    titre: 'Avertissements métier',
    detail: 'Encadrés en tête de document. Ils ne sont jamais omis, même quand ils gênent.',
  },
  {
    titre: 'Hypothèses retenues',
    detail: 'Chaque valeur d’entrée avec son unité, y compris la rugosité choisie.',
  },
  {
    titre: 'Résultats par module',
    detail: 'Les sorties de chaque calcul archivé dans le projet, groupées et libellées.',
  },
  {
    titre: 'Pied de page',
    detail: 'Version du moteur de calcul et pagination, sur chaque page.',
  },
];

/* --------------------------------------------------------- Comment l'obtenir
   Source : `CLAUDE.md`, § « Modèle commercial », et `docs/VAGUE-3.md`.
   Aucune étape n'est automatisée : c'est une décision produit, pas un manque.
   -------------------------------------------------------------------------- */

export interface EtapeAcces {
  readonly titre: string;
  readonly detail: string;
}

export const ETAPES_ACCES: readonly EtapeAcces[] = [
  {
    titre: 'Vous écrivez sur WhatsApp',
    detail:
      'Le bouton de cette page ouvre la conversation avec le propriétaire, avec un premier message déjà rédigé. Vous le complétez comme vous voulez.',
  },
  {
    titre: 'On regarde si le logiciel répond à votre besoin',
    detail:
      'Une conversation, pas un formulaire. Si Irrigation Pro ne convient pas à votre cas, autant le savoir tout de suite.',
  },
  {
    titre: 'Votre compte est créé à la main',
    detail:
      'Une fois l’accord trouvé, le propriétaire ouvre votre compte et vous transmet vos identifiants ainsi que le lien d’accès au logiciel.',
  },
  {
    titre: 'Vous choisissez votre mot de passe et vous travaillez',
    detail:
      'Le mot de passe de départ doit être remplacé à la première connexion. Tant que votre compte est actif, l’accès reste ouvert.',
  },
];
