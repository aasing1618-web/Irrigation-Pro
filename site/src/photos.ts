/**
 * Les photographies du site, déclarées à un seul endroit.
 *
 * ## Pourquoi un registre plutôt que des `<img>` éparpillés
 *
 * Le texte alternatif est le seul contenu du site qu'un voyant ne relit jamais.
 * Le regrouper ici le rend relisible d'un coup d'œil par le propriétaire, au
 * même titre que `contenu.ts` pour les textes visibles.
 *
 * ## Ce que ces fichiers sont, et ne sont pas
 *
 * Ce sont des **photographies d'illustration** fournies par le propriétaire.
 * Ce ne sont pas des captures d'écran du logiciel : il n'y en a aucune sur ce
 * site, et il ne faut pas en fabriquer (`CLAUDE.md`). Une capture inventée
 * serait un mensonge commercial.
 *
 * ## Deux contraintes techniques à connaître avant d'en ajouter
 *
 * 1. **Rien ne vient d'un serveur tiers.** La politique de sécurité de la page
 *    est `default-src 'self'` : une image hébergée ailleurs serait purement et
 *    simplement bloquée par le navigateur. Les fichiers vivent dans
 *    `site/public/photos/`.
 * 2. **Elles font toutes 736 px de large environ.** C'est la résolution des
 *    sources. Sur un grand écran, une photo affichée en pleine largeur est donc
 *    agrandie et perd en netteté. D'où le parti pris : elles servent de **fond
 *    voilé** derrière du texte, ou s'affichent dans des cadres étroits — jamais
 *    en pleine largeur nette. Le jour où des versions 2000 px seront
 *    disponibles, il n'y aura qu'à remplacer les fichiers.
 */

export interface Photo {
  /** Chemin servi par l'hébergeur, depuis `site/public/`. */
  readonly src: string;
  /**
   * Description pour qui ne voit pas l'image.
   *
   * Vide (`''`) lorsque la photo est purement décorative : elle porte alors
   * `aria-hidden` et un lecteur d'écran doit l'ignorer. Décrire un fond voilé
   * n'apprendrait rien à personne et allongerait la lecture pour rien.
   */
  readonly alt: string;
  /** Dimensions réelles du fichier, pour réserver la place et éviter les sauts. */
  readonly width: number;
  readonly height: number;
}

/** Pompage vers un canal en terre, au milieu des rizières. Format paysage. */
export const CANAL_POMPAGE: Photo = {
  src: '/photos/canal-pompage.jpg',
  alt: '',
  width: 736,
  height: 414,
};

/** Micro-asperseurs sur une rampe, gouttes en suspension. Format portrait. */
export const RAMPE_ASPERSION: Photo = {
  src: '/photos/rampe-aspersion.jpg',
  alt: 'Micro-asperseurs en fonctionnement sur une rampe posée entre deux rangs de culture.',
  width: 736,
  height: 1308,
};

/** Technicien relevant des données sur sa tablette, en fin de journée. */
export const INGENIEUR_PARCELLE: Photo = {
  src: '/photos/ingenieur-parcelle.jpg',
  alt: 'Technicien consultant une tablette au bord d’une parcelle cultivée, au coucher du soleil.',
  width: 736,
  height: 736,
};

/** Réseau de micro-aspersion sur planches maraîchères. */
export const RESEAU_PLANCHES: Photo = {
  src: '/photos/reseau-planches.jpg',
  alt: 'Ligne de micro-aspersion desservant des planches maraîchères.',
  width: 736,
  height: 1308,
};

/** Aspersion sur rangs, lumière rasante. */
export const ASPERSION_PARCELLE: Photo = {
  src: '/photos/aspersion-parcelle.jpg',
  alt: 'Aspersion en cours sur une parcelle de plein champ, en lumière rasante.',
  width: 736,
  height: 1104,
};

/** Asperseur vu de près, sur une rampe basse. */
export const ASPERSEUR_RAMPE: Photo = {
  src: '/photos/asperseur-rampe.jpg',
  alt: 'Asperseur en fonctionnement sur une rampe basse, entre deux rangs.',
  width: 736,
  height: 736,
};

/** Tracteur traitant une parcelle en lisière de forêt. */
export const TRACTEUR_PARCELLE: Photo = {
  src: '/photos/tracteur-parcelle.jpg',
  alt: 'Tracteur équipé d’une rampe traversant une parcelle cultivée.',
  width: 501,
  height: 626,
};
