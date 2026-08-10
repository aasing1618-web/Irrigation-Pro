/**
 * Outils de texte du générateur de rapports.
 *
 * Trois responsabilités, toutes purement textuelles et testables sans PDF :
 *
 *  1. **Assainissement typographique** — les polices standard de `pdfkit`
 *     (Helvetica, Times, Courier) sont encodées en **WinAnsi**. Tout caractère
 *     hors de cette table est écrit dans le PDF comme un glyphe absent : il
 *     disparaît silencieusement, sans erreur. Un document français est plein de
 *     caractères à risque (« é è à ç ù », les guillemets, les exposants de
 *     « m³ », la lettre grecque η d'un rendement). On ne parie donc pas : tout
 *     texte qui entre dans le document passe par `assainirTexte`.
 *
 *  2. **Mise en forme française des nombres** — virgule décimale, espace des
 *     milliers. `Intl.NumberFormat` n'est volontairement pas utilisé : selon la
 *     version d'ICU embarquée par Node, il produit une espace fine insécable
 *     (U+202F) qui **n'existe pas** en WinAnsi, et le séparateur de milliers
 *     disparaîtrait du document sur certaines machines et pas sur d'autres.
 *
 *  3. **Nom de fichier et en-tête `Content-Disposition`** — un nom de rapport
 *     contient le nom du projet, donc du texte saisi par l'utilisateur. Il ne
 *     doit jamais pouvoir refermer une chaîne, injecter un retour à la ligne
 *     dans un en-tête HTTP, ni contenir un séparateur de chemin.
 */

// ---------------------------------------------------------------------------
// 1. Assainissement typographique (WinAnsi)
// ---------------------------------------------------------------------------

/**
 * Les caractères de la plage 0x80-0x9F que WinAnsi définit (contrairement à
 * Latin-1). Ce sont ceux dont on a le plus besoin : l'apostrophe typographique
 * « ’ », les guillemets courbes, le tiret cadratin, les points de suspension.
 */
const HAUTS_WINANSI: ReadonlySet<number> = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/** Ce caractère peut-il être écrit tel quel avec une police standard PDF ? */
function encodableWinAnsi(pointDeCode: number): boolean {
  // ASCII imprimable.
  if (pointDeCode >= 0x20 && pointDeCode <= 0x7e) return true;
  // Latin-1 haut : « é è à ç ù », « ° », « ² », « ³ », « µ », « « » », …
  // 0xA0 (espace insécable) est volontairement exclu : voir REMPLACEMENTS.
  if (pointDeCode >= 0xa1 && pointDeCode <= 0xff) return true;
  return HAUTS_WINANSI.has(pointDeCode);
}

/**
 * Substitutions explicites, appliquées avant tout repli automatique.
 *
 * Les lettres grecques sont translittérées : aucune police standard PDF n'en
 * possède les glyphes. « Rendement global η » devient « Rendement global eta »,
 * ce qui reste lisible par un ingénieur — un glyphe manquant, non.
 */
const REMPLACEMENTS: ReadonlyMap<string, string> = new Map<string, string>([
  // Espaces exotiques → espace ordinaire (aucune ne survit à WinAnsi).
  ['\u00a0', ' '],
  ['\u202f', ' '],
  ['\u2007', ' '],
  ['\u2009', ' '],
  ['\u200a', ' '],
  ['\u2005', ' '],
  ['\u200b', ''],
  // Signes mathématiques absents de WinAnsi.
  ['\u2212', '-'],
  ['\u2264', '<='],
  ['\u2265', '>='],
  ['\u2260', '<>'],
  ['\u2248', '~'],
  ['\u221e', 'infini'],
  ['\u2211', 'somme'],
  ['\u221a', 'racine'],
  ['\u0394', 'Delta'],
  ['\u2206', 'Delta'],
  // Exposants et indices non couverts (¹ ² ³ le sont, les autres non).
  ['\u2070', '^0'],
  ['\u2074', '^4'],
  ['\u2075', '^5'],
  ['\u2076', '^6'],
  ['\u2077', '^7'],
  ['\u2078', '^8'],
  ['\u2079', '^9'],
  ['\u207b', '^-'],
  ['\u2080', '0'],
  ['\u2081', '1'],
  ['\u2082', '2'],
  ['\u2083', '3'],
  ['\u2084', '4'],
  // Lettres grecques rencontrées dans les libellés du moteur.
  ['\u03b1', 'alpha'],
  ['\u03b2', 'beta'],
  ['\u03b3', 'gamma'],
  ['\u03b4', 'delta'],
  ['\u03b5', 'epsilon'],
  ['\u03b7', 'eta'],
  ['\u03b8', 'theta'],
  ['\u03bb', 'lambda'],
  ['\u03bd', 'nu'],
  ['\u03c0', 'pi'],
  ['\u03c1', 'rho'],
  ['\u03c3', 'sigma'],
  ['\u03c6', 'phi'],
  ['\u03c8', 'psi'],
  ['\u03c9', 'omega'],
  ['\u03bc', '\u00b5'], // µ grec → µ « micro », lui présent en WinAnsi
  ['\u0398', 'Theta'],
  ['\u03a9', 'Omega'],
]);

/**
 * Rend un texte sûr pour une police standard PDF.
 *
 * Ordre appliqué : normalisation NFC → substitution explicite → repli par
 * suppression des diacritiques (« ā » → « a ») → « ? » en tout dernier recours.
 * Les caractères de contrôle sont retirés, sauf le passage à la ligne.
 */
export function assainirTexte(valeur: string): string {
  const normalise = valeur.normalize('NFC');
  let sortie = '';

  for (const caractere of normalise) {
    const remplacement = REMPLACEMENTS.get(caractere);
    if (remplacement !== undefined) {
      sortie += remplacement;
      continue;
    }

    const pointDeCode = caractere.codePointAt(0) ?? 0;

    if (caractere === '\n') {
      sortie += '\n';
      continue;
    }
    // Caractères de contrôle : jamais dans un document.
    if (pointDeCode < 0x20 || pointDeCode === 0x7f) {
      sortie += ' ';
      continue;
    }
    if (encodableWinAnsi(pointDeCode)) {
      sortie += caractere;
      continue;
    }

    // Repli : « ā » → « a », « ṽ » → « v »…
    const deplie = caractere
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split('')
      .filter((c) => encodableWinAnsi(c.codePointAt(0) ?? 0))
      .join('');

    sortie += deplie.length > 0 ? deplie : '?';
  }

  return sortie;
}

/** Raccourcit un texte trop long, en signalant la coupure. */
export function tronquer(valeur: string, maximum: number): string {
  if (valeur.length <= maximum) return valeur;
  return `${valeur.slice(0, Math.max(1, maximum - 1)).trimEnd()}\u2026`;
}

// ---------------------------------------------------------------------------
// 2. Nombres et dates, à la française
// ---------------------------------------------------------------------------

/** Nombre de décimales retenues selon l'ordre de grandeur. */
function decimalesUtiles(valeurAbsolue: number): number {
  if (valeurAbsolue >= 1000) return 0;
  if (valeurAbsolue >= 100) return 1;
  if (valeurAbsolue >= 10) return 2;
  if (valeurAbsolue >= 1) return 3;
  return 4;
}

/** Groupe les milliers par espaces : « 12 345,6 ». */
function grouperMilliers(entier: string): string {
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Met un nombre en forme pour le document : virgule décimale, milliers séparés,
 * décimales adaptées à l'ordre de grandeur, zéros inutiles retirés.
 *
 * Les valeurs non finies renvoient un tiret cadratin : un rapport technique doit
 * afficher « — », jamais « NaN ».
 */
export function formaterNombre(valeur: number): string {
  if (!Number.isFinite(valeur)) return '\u2014';
  if (valeur === 0) return '0';

  const absolue = Math.abs(valeur);

  // Très petit ou très grand : la notation scientifique reste lisible là où
  // « 0,0000 » ou « 12 000 000 000 » ne disent plus rien.
  if (absolue < 1e-4 || absolue >= 1e9) {
    return valeur.toExponential(3).replace('.', ',');
  }

  const fixe = valeur.toFixed(decimalesUtiles(absolue));
  const [entier = '0', decimales = ''] = fixe.split('.');
  const decimalesNettes = decimales.replace(/0+$/, '');
  const signe = entier.startsWith('-') ? '-' : '';
  const chiffres = signe ? entier.slice(1) : entier;

  const partieEntiere = `${signe}${grouperMilliers(chiffres)}`;
  return decimalesNettes.length > 0 ? `${partieEntiere},${decimalesNettes}` : partieEntiere;
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

/** « 10 août 2026 ». Volontairement sans `Intl` (voir en-tête du fichier). */
export function formaterDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return '\u2014';
  const mois = MOIS[date.getMonth()] ?? '';
  return `${date.getDate()} ${mois} ${date.getFullYear()}`;
}

/** « 10 août 2026 à 14:32 ». */
export function formaterDateHeure(date: Date): string {
  if (Number.isNaN(date.getTime())) return '\u2014';
  const heures = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formaterDate(date)} à ${heures}:${minutes}`;
}

// ---------------------------------------------------------------------------
// 3. Nom de fichier et en-tête HTTP
// ---------------------------------------------------------------------------

/**
 * Caractères refusés dans un nom de fichier proposé au téléchargement.
 *
 * Deux dangers distincts, traités ensemble :
 *  - `/` `\` `:` et `..` construisent un chemin ; le nom ne doit désigner qu'un
 *    fichier, jamais un emplacement ;
 *  - `\r` et `\n` **coupent un en-tête HTTP en deux**. C'est la voie classique
 *    d'injection d'en-tête ; le nom du projet venant de l'utilisateur, elle est
 *    directement atteignable ici.
 */
const CARACTERES_INTERDITS = /[\u0000-\u001f\u007f"\\/:*?<>|]+/g;

/** Réduit un intitulé libre à un nom de fichier sûr, lisible et borné. */
export function assainirNomFichier(propose: string, extension = '.pdf'): string {
  const base = assainirTexte(propose)
    .replace(CARACTERES_INTERDITS, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');

  const nom = base.length > 0 ? tronquer(base, 90).replace(/\u2026$/, '') : 'rapport';
  return `${nom}${extension}`;
}

/** Translittération ASCII, pour la forme historique de `filename=`. */
function versAscii(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
}

/**
 * Construit un en-tête `Content-Disposition` conforme à la RFC 6266.
 *
 * Deux formes sont émises : `filename=` en ASCII pur pour les clients anciens,
 * et `filename*=UTF-8''…` percent-encodé pour que « Périmètre de Ndiaye »
 * garde ses accents dans le gestionnaire de téléchargement.
 *
 * Le nom est assaini **avant** d'entrer ici, et l'encodage pourcent de la
 * seconde forme rend structurellement impossible tout retour à la ligne.
 */
export function enteteContentDisposition(nomFichier: string): string {
  const sur = assainirNomFichier(nomFichier, '');
  const ascii = versAscii(sur);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(sur)}`;
}
