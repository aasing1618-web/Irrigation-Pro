/**
 * Primitives de mise en page pour `pdfkit`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *  `pdfkit` est une bibliothèque de **dessin**, pas de mise en page. Elle sait
 *  écrire du texte à des coordonnées ; elle ne connaît ni tableau, ni encadré,
 *  ni saut de page. Un générateur écrit à coordonnées fixes fonctionne sur le
 *  premier jeu de données et casse au deuxième : une ligne un peu plus longue,
 *  et le tableau déborde en bas de page, coupé en deux, sans en-tête.
 *
 *  Ce fichier isole donc un petit vocabulaire de mise en page — titre, filet,
 *  paragraphe, tableau, encadré — que le document assemble ensuite sans jamais
 *  manipuler une seule coordonnée.
 *
 *  Le point délicat est le **saut de page**. Il est traité explicitement à deux
 *  endroits :
 *   - `assurerPlace(h)` refuse d'ouvrir un bloc dont l'amorce ne tient pas ;
 *   - `tableau()` mesure CHAQUE ligne avant de la dessiner et, si elle ne tient
 *     pas, ouvre une page **puis redessine la ligne d'en-tête**. Un tableau de
 *     douze mois qui s'étale sur trois pages reste lisible sur chacune.
 *
 *  L'en-tête courant et le pied de page numéroté sont dessinés à la toute fin,
 *  page par page (`bufferPages`), parce que « Page 3 / 7 » suppose de connaître
 *  le nombre total de pages — qu'on ignore tant que le contenu n'est pas posé.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import PDFDocument from 'pdfkit';

import { assainirTexte, tronquer } from './texte.js';

// ---------------------------------------------------------------------------
// Charte graphique — sobre, imprimable en noir et blanc
// ---------------------------------------------------------------------------

/**
 * Une palette réduite, à dominante grise, avec un seul bleu ardoise comme
 * accent. C'est un document technique remis à un client : il doit survivre à
 * une photocopie et ne jamais ressembler à une plaquette commerciale.
 */
export const COULEURS = {
  texte: '#1b1f24',
  attenue: '#5d6874',
  trait: '#c9cfd6',
  traitFin: '#e3e7eb',
  fondEntete: '#eceff3',
  fondAlterne: '#f6f8fa',
  accent: '#12506e',
  attention: '#7a4f00',
  fondAttention: '#fbf3e2',
  bordAttention: '#d9b872',
  fondInfo: '#eef2f6',
  bordInfo: '#b9c6d2',
} as const;

export const POLICES = {
  normale: 'Helvetica',
  grasse: 'Helvetica-Bold',
  italique: 'Helvetica-Oblique',
} as const;

/**
 * Marges. La marge haute est généreuse (92 pt) : elle loge l'en-tête courant
 * sans que celui-ci ne chevauche jamais le contenu.
 */
export const MARGES = { top: 92, bottom: 68, left: 56, right: 56 } as const;

/** Hauteur minimale d'une ligne de tableau, pour que les tableaux respirent. */
const HAUTEUR_LIGNE_MINI = 17;
const PADDING_CELLULE_X = 5;
const PADDING_CELLULE_Y = 4.5;

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export type Alignement = 'left' | 'right' | 'center';

export interface ColonneTableau {
  readonly titre: string;
  /** Poids relatif : les largeurs sont réparties au prorata de ces valeurs. */
  readonly poids: number;
  readonly alignement?: Alignement;
}

export interface SpecTableau {
  readonly colonnes: readonly ColonneTableau[];
  readonly lignes: ReadonlyArray<readonly string[]>;
  /** Alterne un fond très clair une ligne sur deux. */
  readonly zebre?: boolean;
}

export type TonEncadre = 'attention' | 'info';

export interface OptionsDocument {
  /** Titre répété en tête de chaque page (le nom du projet). */
  readonly titreCourant: string;
  /** Repère répété à droite de l'en-tête courant (la référence du rapport). */
  readonly repereCourant: string;
  /** Mention du pied de page : version du moteur et date. */
  readonly mentionPied: string;
  /** Métadonnées du fichier PDF. */
  readonly titreFichier: string;
  readonly auteur: string;
  /**
   * Compression des flux du PDF. Activée par défaut. Les tests la désactivent
   * pour relire le texte du document sans dépendre de `zlib`.
   */
  readonly compresser?: boolean;
}

// ---------------------------------------------------------------------------
// Disposition
// ---------------------------------------------------------------------------

export class Disposition {
  readonly doc: PDFKit.PDFDocument;

  private readonly options: OptionsDocument;
  private readonly morceaux: Buffer[] = [];
  private readonly termine: Promise<Buffer>;
  private finalise = false;

  constructor(options: OptionsDocument) {
    this.options = options;

    this.doc = new PDFDocument({
      size: 'A4',
      margins: { ...MARGES },
      bufferPages: true,
      autoFirstPage: true,
      compress: options.compresser ?? true,
      info: {
        Title: assainirTexte(options.titreFichier),
        Author: assainirTexte(options.auteur),
        Creator: 'Irrigation Pro',
        Producer: 'Irrigation Pro',
      },
    });

    this.termine = new Promise<Buffer>((resolve, reject) => {
      this.doc.on('data', (morceau: Buffer) => this.morceaux.push(Buffer.from(morceau)));
      this.doc.on('end', () => resolve(Buffer.concat(this.morceaux)));
      this.doc.on('error', reject);
    });
  }

  // --- Géométrie -----------------------------------------------------------

  get gauche(): number {
    return this.doc.page.margins.left;
  }

  get largeurUtile(): number {
    return this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right;
  }

  /** Ordonnée au-delà de laquelle plus rien ne doit être dessiné. */
  get limiteBasse(): number {
    return this.doc.page.height - this.doc.page.margins.bottom;
  }

  get hauteurUtile(): number {
    return this.limiteBasse - this.doc.page.margins.top;
  }

  /** Descend de `hauteur` points. */
  espace(hauteur: number): void {
    this.doc.y += hauteur;
  }

  nouvellePage(): void {
    this.doc.addPage();
  }

  /**
   * Ouvre une page si `hauteur` points ne tiennent pas sur celle en cours.
   *
   * Sert d'amorce : on ne demande pas la place du bloc entier (un tableau de
   * cent lignes ne tiendrait jamais), mais celle de son en-tête et de ses
   * premières lignes. Un titre de section seul en bas de page est une faute de
   * mise en page classique — c'est ce que cette fonction évite.
   */
  assurerPlace(hauteur: number): void {
    if (this.doc.y + hauteur > this.limiteBasse) this.nouvellePage();
  }

  // --- Blocs de texte ------------------------------------------------------

  /** Titre de la page de garde. */
  titreDocument(texte: string): void {
    this.doc
      .font(POLICES.grasse)
      .fontSize(24)
      .fillColor(COULEURS.texte)
      .text(assainirTexte(texte), this.gauche, this.doc.y, {
        width: this.largeurUtile,
        lineGap: 2,
      });
  }

  /** Sur-titre discret, en capitales espacées, au-dessus du titre principal. */
  surTitre(texte: string): void {
    this.doc
      .font(POLICES.grasse)
      .fontSize(9)
      .fillColor(COULEURS.accent)
      .text(assainirTexte(texte.toUpperCase()), this.gauche, this.doc.y, {
        width: this.largeurUtile,
        characterSpacing: 1.6,
      });
  }

  /** Titre de section numéroté, précédé d'un filet fin. */
  titreSection(texte: string): void {
    this.assurerPlace(64);
    this.espace(6);

    const y = this.doc.y;
    this.doc
      .save()
      .lineWidth(1.4)
      .strokeColor(COULEURS.accent)
      .moveTo(this.gauche, y)
      .lineTo(this.gauche + 34, y)
      .stroke()
      .restore();

    this.doc.y = y + 7;
    this.doc
      .font(POLICES.grasse)
      .fontSize(14)
      .fillColor(COULEURS.texte)
      .text(assainirTexte(texte), this.gauche, this.doc.y, { width: this.largeurUtile });
    this.espace(6);
  }

  /** Intertitre à l'intérieur d'une section. */
  sousTitre(texte: string): void {
    this.assurerPlace(46);
    this.espace(4);
    this.doc
      .font(POLICES.grasse)
      .fontSize(9.5)
      .fillColor(COULEURS.accent)
      .text(assainirTexte(texte.toUpperCase()), this.gauche, this.doc.y, {
        width: this.largeurUtile,
        characterSpacing: 0.9,
      });
    this.espace(3);
  }

  /** Paragraphe courant. */
  paragraphe(
    texte: string,
    options: { taille?: number; couleur?: string; italique?: boolean } = {},
  ): void {
    this.assurerPlace(24);
    this.doc
      .font(options.italique ? POLICES.italique : POLICES.normale)
      .fontSize(options.taille ?? 9.5)
      .fillColor(options.couleur ?? COULEURS.texte)
      .text(assainirTexte(texte), this.gauche, this.doc.y, {
        width: this.largeurUtile,
        align: 'left',
        lineGap: 2.2,
      });
    this.espace(4);
  }

  /** Filet horizontal pleine largeur. */
  filet(couleur: string = COULEURS.trait): void {
    this.assurerPlace(10);
    const y = this.doc.y;
    this.doc
      .save()
      .lineWidth(0.7)
      .strokeColor(couleur)
      .moveTo(this.gauche, y)
      .lineTo(this.gauche + this.largeurUtile, y)
      .stroke()
      .restore();
    this.doc.y = y + 8;
  }

  /**
   * Liste « libellé → valeur » sur deux colonnes, pour la page de garde.
   * Le libellé est en petites capitales grises, la valeur en gras.
   */
  fiche(entrees: ReadonlyArray<readonly [string, string]>): void {
    const largeurLibelle = Math.min(150, this.largeurUtile * 0.32);
    const largeurValeur = this.largeurUtile - largeurLibelle - 12;

    for (const [libelle, valeur] of entrees) {
      this.doc.font(POLICES.grasse).fontSize(10);
      const hauteurValeur = this.doc.heightOfString(assainirTexte(valeur), {
        width: largeurValeur,
      });
      const hauteur = Math.max(hauteurValeur, 14) + 7;

      this.assurerPlace(hauteur + 4);
      const y = this.doc.y;

      this.doc
        .font(POLICES.normale)
        .fontSize(8)
        .fillColor(COULEURS.attenue)
        .text(assainirTexte(libelle.toUpperCase()), this.gauche, y + 2, {
          width: largeurLibelle,
          characterSpacing: 0.7,
          lineBreak: false,
          ellipsis: true,
        });

      this.doc
        .font(POLICES.grasse)
        .fontSize(10)
        .fillColor(COULEURS.texte)
        .text(assainirTexte(valeur), this.gauche + largeurLibelle + 12, y, {
          width: largeurValeur,
        });

      this.doc.y = y + hauteur;

      this.doc
        .save()
        .lineWidth(0.5)
        .strokeColor(COULEURS.traitFin)
        .moveTo(this.gauche, this.doc.y - 3)
        .lineTo(this.gauche + this.largeurUtile, this.doc.y - 3)
        .stroke()
        .restore();
    }
    this.espace(6);
  }

  // --- Encadré -------------------------------------------------------------

  /**
   * Encadré à filet et fond léger — le véhicule des **avertissements métier**.
   *
   * Il se scinde proprement : si les lignes ne tiennent pas sur la page en
   * cours, l'encadré est refermé et un second s'ouvre sur la page suivante,
   * avec un titre suffixé « (suite) ». On ne dessine jamais un fond qui déborde
   * de la zone imprimable.
   */
  encadre(titre: string, lignes: readonly string[], ton: TonEncadre = 'attention'): void {
    const fond = ton === 'attention' ? COULEURS.fondAttention : COULEURS.fondInfo;
    const bord = ton === 'attention' ? COULEURS.bordAttention : COULEURS.bordInfo;
    const encre = ton === 'attention' ? COULEURS.attention : COULEURS.texte;

    const paddingX = 12;
    const paddingY = 10;
    const largeurTexte = this.largeurUtile - 2 * paddingX - 12;

    const restantes = lignes.map((ligne) => assainirTexte(ligne));
    let premier = true;

    while (restantes.length > 0) {
      const intitule = assainirTexte(premier ? titre : `${titre} (suite)`);

      this.doc.font(POLICES.grasse).fontSize(9.5);
      const hauteurTitre = this.doc.heightOfString(intitule, { width: largeurTexte }) + 5;

      // Un encadré qui s'ouvre à trois lignes du bas n'a pas de sens : on
      // exige la place du titre et d'au moins une ligne.
      this.assurerPlace(hauteurTitre + 30);

      const disponible = this.limiteBasse - this.doc.y - 2 * paddingY - hauteurTitre - 6;

      this.doc.font(POLICES.normale).fontSize(9);
      const retenues: string[] = [];
      let hauteurCorps = 0;

      while (restantes.length > 0) {
        const ligne = restantes[0] as string;
        const h = this.doc.heightOfString(`•  ${ligne}`, { width: largeurTexte }) + 4;
        if (retenues.length > 0 && hauteurCorps + h > disponible) break;
        retenues.push(ligne);
        hauteurCorps += h;
        restantes.shift();
      }

      const hauteurTotale = hauteurTitre + hauteurCorps + 2 * paddingY;
      const yCadre = this.doc.y;

      this.doc
        .save()
        .roundedRect(this.gauche, yCadre, this.largeurUtile, hauteurTotale, 3)
        .fillAndStroke(fond, bord)
        .restore();

      // Bande verticale d'accent à gauche : repère visuel fort, sans couleur vive.
      this.doc
        .save()
        .rect(this.gauche, yCadre, 3, hauteurTotale)
        .fill(bord)
        .restore();

      this.doc
        .font(POLICES.grasse)
        .fontSize(9.5)
        .fillColor(encre)
        .text(intitule, this.gauche + paddingX, yCadre + paddingY, { width: largeurTexte });

      let y = yCadre + paddingY + hauteurTitre;
      this.doc.font(POLICES.normale).fontSize(9).fillColor(COULEURS.texte);
      for (const ligne of retenues) {
        const h = this.doc.heightOfString(`•  ${ligne}`, { width: largeurTexte }) + 4;
        this.doc.text(`•  ${ligne}`, this.gauche + paddingX, y, {
          width: largeurTexte,
          lineGap: 1.5,
        });
        y += h;
      }

      this.doc.y = yCadre + hauteurTotale + 10;
      premier = false;
    }
  }

  // --- Tableau -------------------------------------------------------------

  /**
   * Tableau à colonnes, **avec report de l'en-tête à chaque page**.
   *
   * C'est le piège classique de `pdfkit` : rien ne surveille le bas de page.
   * Chaque ligne est donc mesurée avant d'être écrite ; si elle ne tient pas,
   * on ouvre une page et on redessine la ligne d'en-tête avant de continuer.
   * Une ligne isolée plus haute qu'une page entière est tronquée plutôt que
   * de déborder indéfiniment.
   */
  tableau(spec: SpecTableau): void {
    const { colonnes, lignes } = spec;
    if (colonnes.length === 0) return;

    const poidsTotal = colonnes.reduce((somme, colonne) => somme + colonne.poids, 0) || 1;
    const largeurs = colonnes.map((colonne) => (colonne.poids / poidsTotal) * this.largeurUtile);

    const abscisses: number[] = [];
    let curseur = this.gauche;
    for (const largeur of largeurs) {
      abscisses.push(curseur);
      curseur += largeur;
    }

    const hauteurEntete = this.mesurerHauteurEntete(colonnes, largeurs);

    // Amorce : en-tête + une ligne, sinon on commence sur la page suivante.
    this.assurerPlace(hauteurEntete + HAUTEUR_LIGNE_MINI + 6);
    this.dessinerEntete(colonnes, largeurs, abscisses, hauteurEntete);

    let rang = 0;
    for (const ligne of lignes) {
      const cellules = colonnes.map((_, index) => assainirTexte(ligne[index] ?? ''));

      this.doc.font(POLICES.normale).fontSize(8.5);
      let hauteur = this.mesurerHauteurLigne(cellules, largeurs);

      // Garde-fou : une cellule démesurée ne doit pas boucler à l'infini.
      const hauteurMaxi = this.hauteurUtile - hauteurEntete - 4;
      if (hauteur > hauteurMaxi) {
        for (let i = 0; i < cellules.length; i += 1) {
          cellules[i] = tronquer(cellules[i] ?? '', 400);
        }
        hauteur = Math.min(this.mesurerHauteurLigne(cellules, largeurs), hauteurMaxi);
      }

      if (this.doc.y + hauteur > this.limiteBasse) {
        this.nouvellePage();
        this.dessinerEntete(colonnes, largeurs, abscisses, hauteurEntete);
      }

      const y = this.doc.y;

      if (spec.zebre !== false && rang % 2 === 1) {
        this.doc
          .save()
          .rect(this.gauche, y, this.largeurUtile, hauteur)
          .fill(COULEURS.fondAlterne)
          .restore();
      }

      this.doc.font(POLICES.normale).fontSize(8.5).fillColor(COULEURS.texte);
      cellules.forEach((cellule, index) => {
        const largeur = largeurs[index] ?? 0;
        const x = abscisses[index] ?? this.gauche;
        this.doc.text(cellule, x + PADDING_CELLULE_X, y + PADDING_CELLULE_Y, {
          width: Math.max(largeur - 2 * PADDING_CELLULE_X, 1),
          align: colonnes[index]?.alignement ?? 'left',
          height: Math.max(hauteur - 2, 1),
          lineGap: 1,
        });
      });

      this.doc
        .save()
        .lineWidth(0.4)
        .strokeColor(COULEURS.traitFin)
        .moveTo(this.gauche, y + hauteur)
        .lineTo(this.gauche + this.largeurUtile, y + hauteur)
        .stroke()
        .restore();

      this.doc.y = y + hauteur;
      rang += 1;
    }

    // Filet de clôture, plus marqué que les séparateurs de lignes.
    const yFin = this.doc.y;
    this.doc
      .save()
      .lineWidth(0.8)
      .strokeColor(COULEURS.trait)
      .moveTo(this.gauche, yFin)
      .lineTo(this.gauche + this.largeurUtile, yFin)
      .stroke()
      .restore();
    this.doc.y = yFin + 12;
  }

  private mesurerHauteurEntete(
    colonnes: readonly ColonneTableau[],
    largeurs: readonly number[],
  ): number {
    this.doc.font(POLICES.grasse).fontSize(8.5);
    const hauteurs = colonnes.map((colonne, index) =>
      this.doc.heightOfString(assainirTexte(colonne.titre), {
        width: Math.max((largeurs[index] ?? 0) - 2 * PADDING_CELLULE_X, 1),
      }),
    );
    return Math.max(...hauteurs, 11) + 2 * PADDING_CELLULE_Y;
  }

  private mesurerHauteurLigne(
    cellules: readonly string[],
    largeurs: readonly number[],
  ): number {
    const hauteurs = cellules.map((cellule, index) =>
      this.doc.heightOfString(cellule, {
        width: Math.max((largeurs[index] ?? 0) - 2 * PADDING_CELLULE_X, 1),
        lineGap: 1,
      }),
    );
    return Math.max(Math.max(...hauteurs, 0) + 2 * PADDING_CELLULE_Y, HAUTEUR_LIGNE_MINI);
  }

  private dessinerEntete(
    colonnes: readonly ColonneTableau[],
    largeurs: readonly number[],
    abscisses: readonly number[],
    hauteur: number,
  ): void {
    const y = this.doc.y;

    this.doc
      .save()
      .rect(this.gauche, y, this.largeurUtile, hauteur)
      .fill(COULEURS.fondEntete)
      .restore();

    this.doc.font(POLICES.grasse).fontSize(8.5).fillColor(COULEURS.texte);
    colonnes.forEach((colonne, index) => {
      const largeur = largeurs[index] ?? 0;
      const x = abscisses[index] ?? this.gauche;
      this.doc.text(assainirTexte(colonne.titre), x + PADDING_CELLULE_X, y + PADDING_CELLULE_Y, {
        width: Math.max(largeur - 2 * PADDING_CELLULE_X, 1),
        align: colonne.alignement ?? 'left',
      });
    });

    this.doc
      .save()
      .lineWidth(0.8)
      .strokeColor(COULEURS.trait)
      .moveTo(this.gauche, y + hauteur)
      .lineTo(this.gauche + this.largeurUtile, y + hauteur)
      .stroke()
      .restore();

    this.doc.y = y + hauteur;
  }

  // --- Habillage et clôture ------------------------------------------------

  /**
   * Dessine l'en-tête courant et le pied de page sur toutes les pages, puis
   * clôt le document.
   *
   * L'opération a lieu **après** le contenu, et pas pendant : « Page 3 / 7 »
   * exige de connaître le total. `bufferPages: true` conserve les pages en
   * mémoire pour permettre ce second passage.
   *
   * La page de garde ne reçoit pas d'en-tête courant : elle porte déjà le titre
   * en grand. Elle reçoit en revanche le pied de page, qui porte la version du
   * moteur — information contractuelle qui doit figurer partout.
   */
  async finaliser(): Promise<Buffer> {
    if (this.finalise) return this.termine;
    this.finalise = true;

    const plage = this.doc.bufferedPageRange();
    const total = plage.count;

    for (let index = 0; index < total; index += 1) {
      this.doc.switchToPage(plage.start + index);

      const gauche = this.doc.page.margins.left;
      const largeur = this.doc.page.width - gauche - this.doc.page.margins.right;

      // --- En-tête courant (toutes les pages sauf la garde) ---
      if (index > 0) {
        const yEntete = 44;
        this.doc
          .font(POLICES.normale)
          .fontSize(8)
          .fillColor(COULEURS.attenue)
          .text(assainirTexte(tronquer(this.options.titreCourant, 70)), gauche, yEntete, {
            width: largeur * 0.68,
            lineBreak: false,
            ellipsis: true,
          })
          .text(assainirTexte(this.options.repereCourant), gauche + largeur * 0.68, yEntete, {
            width: largeur * 0.32,
            align: 'right',
            lineBreak: false,
          });

        this.doc
          .save()
          .lineWidth(0.6)
          .strokeColor(COULEURS.trait)
          .moveTo(gauche, yEntete + 13)
          .lineTo(gauche + largeur, yEntete + 13)
          .stroke()
          .restore();
      }

      // --- Pied de page (toutes les pages) ---
      const yPied = this.doc.page.height - 46;
      this.doc
        .save()
        .lineWidth(0.6)
        .strokeColor(COULEURS.trait)
        .moveTo(gauche, yPied - 8)
        .lineTo(gauche + largeur, yPied - 8)
        .stroke()
        .restore();

      this.doc
        .font(POLICES.normale)
        .fontSize(7.5)
        .fillColor(COULEURS.attenue)
        .text(assainirTexte(this.options.mentionPied), gauche, yPied, {
          width: largeur * 0.75,
          lineBreak: false,
          ellipsis: true,
        })
        .text(`Page ${index + 1} / ${total}`, gauche + largeur * 0.75, yPied, {
          width: largeur * 0.25,
          align: 'right',
          lineBreak: false,
        });
    }

    this.doc.flushPages();
    this.doc.end();
    return this.termine;
  }
}
