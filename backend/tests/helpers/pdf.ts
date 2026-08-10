/**
 * Relecture d'un PDF produit par `pdfkit`, pour les tests de rapports.
 *
 * Ce n'est **pas** un lecteur de PDF général : c'est le minimum nécessaire pour
 * répondre en test aux trois questions qui comptent, et rien de plus.
 *
 *   1. Combien de pages le document fait-il ?
 *   2. Quel texte contient-il réellement ? (avertissements présents,
 *      en-têtes de tableau répétés, aucune formule métier…)
 *   3. Les accents ont-ils survécu à l'encodage ?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  COMMENT ÇA MARCHE, ET POURQUOI C'EST FIABLE
 * ═══════════════════════════════════════════════════════════════════════════
 *  Générés sans compression (`compresser: false`), les flux de contenu de
 *  `pdfkit` sont lisibles tels quels. Avec les polices standard (Helvetica),
 *  chaque fragment de texte est écrit sous la forme :
 *
 *      [<48656c6c6f> 40 <21>] TJ
 *
 *  soit une suite de chaînes **hexadécimales à un octet par caractère**, encodées
 *  en **WinAnsi**, séparées par des crénages numériques. Décoder revient donc à
 *  lire ces octets et à les passer dans la table WinAnsi.
 *
 *  Conséquence directe et voulue : ce décodeur voit **exactement** ce qu'un
 *  lecteur de PDF verrait. Si un « é » avait été perdu à l'encodage, il
 *  n'apparaîtrait pas ici non plus — le test des accents a donc une vraie
 *  valeur de preuve, il ne relit pas la chaîne d'entrée.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { inflateSync } from 'node:zlib';

/**
 * Les 27 positions où WinAnsi s'écarte de Latin-1 (plage 0x80–0x9F).
 * Ailleurs, WinAnsi et Latin-1 coïncident — d'où le décodage direct.
 */
const WINANSI_HAUT: Readonly<Record<number, string>> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

function octetWinAnsi(octet: number): string {
  return WINANSI_HAUT[octet] ?? String.fromCharCode(octet);
}

/** `<48656c6c6f>` → « Hello ». */
function decoderHexa(hexa: string): string {
  const propre = hexa.replace(/\s+/g, '');
  let sortie = '';
  for (let i = 0; i + 1 < propre.length; i += 2) {
    sortie += octetWinAnsi(Number.parseInt(propre.slice(i, i + 2), 16));
  }
  return sortie;
}

/** `(Hello \(monde\))` → « Hello (monde) ». Forme littérale, rare mais légale. */
function decoderLitteral(brut: string): string {
  let sortie = '';
  for (let i = 0; i < brut.length; i += 1) {
    const c = brut[i] as string;
    if (c !== '\\') {
      sortie += octetWinAnsi(c.charCodeAt(0) & 0xff);
      continue;
    }
    const suivant = brut[i + 1] ?? '';
    if (/[0-7]/.test(suivant)) {
      const octal = /^[0-7]{1,3}/.exec(brut.slice(i + 1))?.[0] ?? '0';
      sortie += octetWinAnsi(Number.parseInt(octal, 8));
      i += octal.length;
      continue;
    }
    const echappements: Record<string, string> = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      '(': '(',
      ')': ')',
      '\\': '\\',
    };
    sortie += echappements[suivant] ?? suivant;
    i += 1;
  }
  return sortie;
}

/** Nombre de pages du document, lu sur l'arbre des pages. */
export function nombreDePages(pdf: Buffer): number {
  const brut = pdf.toString('latin1');
  const compte = /\/Count\s+(\d+)/.exec(brut)?.[1];
  if (compte) return Number(compte);
  // Repli : compter les objets `/Type /Page` (et non `/Type /Pages`).
  return [...brut.matchAll(/\/Type\s*\/Page(?![s])/g)].length;
}

/**
 * Découpe le fichier en flux de contenu, **en décompressant ceux qui le sont**.
 *
 * `pdfkit` compresse ses flux par défaut (`/Filter /FlateDecode`), et c'est
 * ainsi que le serveur produit réellement les rapports. Le décodeur doit donc
 * savoir les décompresser : sans cela, les tests ne liraient que des documents
 * fabriqués exprès pour eux, jamais celui que le client télécharge.
 *
 * `latin1` fait correspondre un caractère à un octet : on repère les bornes
 * dans la chaîne, puis on découpe le `Buffer` d'origine, octet pour octet.
 */
function fluxDeContenu(pdf: Buffer): string[] {
  const brut = pdf.toString('latin1');
  const flux: string[] = [];

  // Le mot-clé de fermeture `endstream` contient lui aussi « stream » : sans
  // cette garde, chaque flux serait compté deux fois.
  const marqueur = /(?<!end)stream(\r\n|\n|\r)/g;
  let trouve: RegExpExecArray | null;

  while ((trouve = marqueur.exec(brut)) !== null) {
    const debut = trouve.index + trouve[0].length;

    // L'en-tête de l'objet précède immédiatement le mot-clé `stream`.
    const dictionnaire = brut.slice(Math.max(0, trouve.index - 400), trouve.index);
    const longueurDeclaree = /\/Length\s+(\d+)/.exec(dictionnaire)?.[1];

    const fin = longueurDeclaree
      ? debut + Number(longueurDeclaree)
      : brut.indexOf('endstream', debut);
    if (fin <= debut || fin > pdf.length) continue;

    const donnees = pdf.subarray(debut, fin);
    if (/\/FlateDecode/.test(dictionnaire)) {
      try {
        flux.push(inflateSync(donnees).toString('latin1'));
      } catch {
        // Flux illisible : on l'ignore plutôt que de faire échouer la lecture.
      }
    } else {
      flux.push(donnees.toString('latin1'));
    }
  }

  return flux;
}

/**
 * Texte du document, page par page.
 *
 * Chaque entrée correspond à un flux de contenu, c'est-à-dire à une page —
 * `pdfkit` en produit exactement un par page.
 */
export function textesParPage(pdf: Buffer): string[] {
  const pages: string[] = [];

  for (const contenu of fluxDeContenu(pdf)) {
    // Un flux sans opérateur de texte n'est pas une page de contenu.
    if (!contenu.includes('BT')) continue;

    let texte = '';
    const jetons = /<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\)])*)\)|\bET\b|\bTd\b|\bTm\b/g;
    let jeton: RegExpExecArray | null;
    while ((jeton = jetons.exec(contenu)) !== null) {
      if (jeton[1] !== undefined) texte += decoderHexa(jeton[1]);
      else if (jeton[2] !== undefined) texte += decoderLitteral(jeton[2]);
      else texte += ' ';
    }
    pages.push(texte);
  }

  return pages;
}

/** Tout le texte du document, pages concaténées. */
export function texteDuPdf(pdf: Buffer): string {
  return textesParPage(pdf).join('\n');
}

/**
 * Normalise un texte extrait pour une comparaison robuste : espaces réduits.
 *
 * Les coordonnées d'un PDF découpent une même phrase en plusieurs fragments ;
 * comparer sans normaliser rendrait les tests fragiles pour de mauvaises
 * raisons (une espace de crénage de plus ou de moins).
 */
export function normaliser(texte: string): string {
  return texte.replace(/\s+/g, ' ').trim();
}
