/**
 * Hachage et vérification des mots de passe (décision D-003).
 *
 * Pourquoi `scrypt` et pas argon2 / bcrypt : ces deux-là demandent une
 * compilation native qui casse régulièrement sur Windows. `scrypt` est fourni
 * par Node lui-même, recommandé par l'OWASP, et ne s'installe pas.
 *
 * Pourquoi la version **asynchrone** : `scryptSync` bloquerait la boucle
 * d'événements pendant tout le calcul (~100 ms ici). Une poignée de connexions
 * simultanées suffirait alors à figer le serveur entier. On n'utilise donc
 * jamais la variante synchrone dans ce module.
 *
 * Format stocké, volontairement auto-descriptif :
 *
 *     scrypt$N$r$p$selBase64$empreinteBase64
 *
 * Les paramètres voyagent avec l'empreinte. Le jour où l'on durcit les
 * réglages (ou où l'on migre vers argon2id), les comptes existants continuent
 * de se vérifier avec **leurs** paramètres d'origine : aucune invalidation en
 * masse, la migration se fait au fil des connexions.
 */

import {
  randomBytes,
  randomInt,
  scrypt as scryptAvecCallback,
  timingSafeEqual,
} from 'node:crypto';

// ---------------------------------------------------------------------------
// Paramètres de coût
// ---------------------------------------------------------------------------

/** Coût CPU/mémoire. 2^16 = 65 536 (recommandation OWASP pour r=8, p=1). */
const N = 65_536;
/** Taille de bloc. */
const R = 8;
/** Parallélisme. */
const P = 1;
/** Longueur de l'empreinte produite, en octets. */
const LONGUEUR_EMPREINTE = 64;
/** Longueur du sel aléatoire, en octets. */
const LONGUEUR_SEL = 16;

/**
 * Mémoire maximale autorisée pour un calcul.
 *
 * **Piège** : `scrypt` consomme environ `128 × N × r` octets, soit 64 Mo avec
 * nos réglages — au-delà de la limite `maxmem` par défaut de Node (32 Mo).
 * Sans ce paramètre explicite, TOUT appel échouerait avec
 * « Invalid scrypt params ». On prend le double de la consommation réelle pour
 * absorber le surcoût interne d'OpenSSL.
 */
function memoireMaximale(n: number, r: number): number {
  return 128 * n * r * 2;
}

/** Bornes de sécurité à la relecture d'une empreinte stockée (anti-déni de service). */
const N_MAX = 1_048_576; // 2^20
const R_MAX = 32;
const P_MAX = 16;
const LONGUEUR_EMPREINTE_MAX = 256;

/** Longueurs acceptées par la politique de mot de passe. */
export const LONGUEUR_MIN_MOT_DE_PASSE = 10;
export const LONGUEUR_MAX_MOT_DE_PASSE = 200;

// ---------------------------------------------------------------------------
// Enveloppe promise de `scrypt`
// ---------------------------------------------------------------------------

interface ParametresScrypt {
  N: number;
  r: number;
  p: number;
  longueur: number;
}

function calculer(motDePasse: string, sel: Buffer, parametres: ParametresScrypt): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    scryptAvecCallback(
      // `normalize('NFC')` : deux saisies visuellement identiques mais encodées
      // différemment (accents composés ou non) doivent donner la même empreinte.
      motDePasse.normalize('NFC'),
      sel,
      parametres.longueur,
      {
        N: parametres.N,
        r: parametres.r,
        p: parametres.p,
        maxmem: memoireMaximale(parametres.N, parametres.r),
      },
      (erreur, empreinte) => {
        if (erreur) rejeter(erreur);
        else resoudre(empreinte);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Hachage / vérification
// ---------------------------------------------------------------------------

/** Hache un mot de passe et renvoie la chaîne à stocker en base. */
export async function hashPassword(plain: string): Promise<string> {
  const sel = randomBytes(LONGUEUR_SEL);
  const empreinte = await calculer(plain, sel, {
    N,
    r: R,
    p: P,
    longueur: LONGUEUR_EMPREINTE,
  });

  return [
    'scrypt',
    N,
    R,
    P,
    sel.toString('base64'),
    empreinte.toString('base64'),
  ].join('$');
}

/** Analyse une chaîne stockée. Renvoie `null` si elle est malformée. */
function analyserEmpreinteStockee(
  stored: string,
): { parametres: ParametresScrypt; sel: Buffer; empreinte: Buffer } | null {
  if (typeof stored !== 'string') return null;

  const morceaux = stored.split('$');
  if (morceaux.length !== 6) return null;

  const [algorithme, nTexte, rTexte, pTexte, selTexte, empreinteTexte] = morceaux;
  if (algorithme !== 'scrypt') return null;
  if (!nTexte || !rTexte || !pTexte || !selTexte || !empreinteTexte) return null;

  const nLu = Number(nTexte);
  const rLu = Number(rTexte);
  const pLu = Number(pTexte);

  if (!Number.isInteger(nLu) || !Number.isInteger(rLu) || !Number.isInteger(pLu)) return null;
  if (nLu < 2 || nLu > N_MAX || (nLu & (nLu - 1)) !== 0) return null; // N doit être une puissance de 2
  if (rLu < 1 || rLu > R_MAX) return null;
  if (pLu < 1 || pLu > P_MAX) return null;

  let sel: Buffer;
  let empreinte: Buffer;
  try {
    sel = Buffer.from(selTexte, 'base64');
    empreinte = Buffer.from(empreinteTexte, 'base64');
  } catch {
    return null;
  }

  if (sel.length === 0 || empreinte.length === 0) return null;
  if (empreinte.length > LONGUEUR_EMPREINTE_MAX) return null;

  // Base64 est tolérant : une chaîne bidon se décode souvent en octets valides.
  // On vérifie que le ré-encodage redonne bien l'original.
  if (sel.toString('base64') !== selTexte || empreinte.toString('base64') !== empreinteTexte) {
    return null;
  }

  return {
    parametres: { N: nLu, r: rLu, p: pLu, longueur: empreinte.length },
    sel,
    empreinte,
  };
}

/**
 * Vérifie un mot de passe contre une empreinte stockée.
 *
 * Ne lève jamais d'exception : une empreinte corrompue en base renvoie `false`,
 * pas une erreur 500 qui signalerait à l'attaquant qu'il se passe quelque chose
 * de particulier sur ce compte.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const analyse = analyserEmpreinteStockee(stored);
  if (!analyse) return false;

  try {
    const candidate = await calculer(plain, analyse.sel, analyse.parametres);
    if (candidate.length !== analyse.empreinte.length) return false;
    return timingSafeEqual(candidate, analyse.empreinte);
  } catch {
    return false;
  }
}

/** Sel fixe du calcul factice : il n'authentifie rien, il ne sert qu'à occuper le CPU. */
const SEL_FACTICE = Buffer.alloc(LONGUEUR_SEL, 0x2a);
const MOT_DE_PASSE_FACTICE = 'calcul-factice-pour-egaliser-les-temps-de-reponse';

/**
 * Effectue un calcul de coût strictement identique à `verifyPassword`, sans
 * rien vérifier.
 *
 * **Indispensable** : le contrat impose qu'un e-mail inconnu réponde dans le
 * même délai qu'un mot de passe faux. Sans ce calcul, la réponse « compte
 * inconnu » reviendrait en 1 ms contre 150 ms pour « mot de passe faux », et il
 * suffirait de chronométrer les réponses pour dresser la liste des adresses
 * possédant un compte.
 */
export async function verifyDummyPassword(): Promise<void> {
  try {
    await calculer(MOT_DE_PASSE_FACTICE, SEL_FACTICE, {
      N,
      r: R,
      p: P,
      longueur: LONGUEUR_EMPREINTE,
    });
  } catch {
    // Un échec ici ne doit jamais faire tomber une tentative de connexion.
  }
}

// ---------------------------------------------------------------------------
// Mot de passe temporaire
// ---------------------------------------------------------------------------

/**
 * Alphabet volontairement amputé des caractères qui se confondent quand on
 * recopie un mot de passe reçu par WhatsApp : `0`/`O`/`o`, `1`/`l`/`I`.
 */
const ALPHABET_LISIBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const BLOCS = 4;
const CARACTERES_PAR_BLOC = 5;

/** Longueur exacte d'un mot de passe temporaire, séparateurs compris. */
export const LONGUEUR_MOT_DE_PASSE_TEMPORAIRE = BLOCS * CARACTERES_PAR_BLOC + (BLOCS - 1);

/**
 * Tire un mot de passe temporaire lisible, du type `Kf7pR-nX3mq-…`.
 *
 * Tirage avec `crypto.randomInt` (uniforme et imprévisible). `Math.random`
 * serait ici une faille : sa suite est reconstituable à partir de quelques
 * valeurs observées.
 */
export function generateTemporaryPassword(): string {
  const blocs: string[] = [];
  for (let bloc = 0; bloc < BLOCS; bloc += 1) {
    let contenu = '';
    for (let index = 0; index < CARACTERES_PAR_BLOC; index += 1) {
      contenu += ALPHABET_LISIBLE.charAt(randomInt(0, ALPHABET_LISIBLE.length));
    }
    blocs.push(contenu);
  }
  return blocs.join('-');
}

// ---------------------------------------------------------------------------
// Politique de mot de passe
// ---------------------------------------------------------------------------

/**
 * Mots de passe manifestement courants, en français et en anglais.
 *
 * Liste volontairement courte et embarquée : elle bloque les saisies
 * paresseuses les plus fréquentes sans imposer de dépendance ni de fichier de
 * données à maintenir.
 */
const MOTS_DE_PASSE_COURANTS = new Set([
  'motdepasse',
  'motdepasse1',
  'motdepasse123',
  'monmotdepasse',
  'azertyuiop',
  'azerty123',
  'qwertyuiop',
  'qwerty123',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'mypassword',
  'letmein123',
  'administrateur',
  'administrator',
  'irrigation',
  'irrigationpro',
  'irrigation123',
  '1234567890',
  '12345678901',
  '123456789012',
  '0123456789',
  'abcdefghij',
  'aaaaaaaaaa',
  'bonjour123',
  'bienvenue1',
  'bienvenue123',
  'welcome123',
  'changeme123',
  'jenesaispas',
  'soleil1234',
  'football123',
  'senegal123',
  'iloveyou12',
]);

export type ResultatPolitique = { ok: true } | { ok: false; reason: string };

/**
 * Politique de mot de passe (contrat, § 2).
 *
 * On exige uniquement de la **longueur**. Les règles « une majuscule, un
 * chiffre, un symbole » produisent en pratique des mots de passe plus faibles
 * (`Azerty1!`) et finissent notés sur un papier collé sous le clavier.
 */
export function checkPasswordPolicy(plain: string): ResultatPolitique {
  if (typeof plain !== 'string' || plain.length === 0) {
    return { ok: false, reason: 'Veuillez saisir un mot de passe.' };
  }

  if (plain.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return {
      ok: false,
      reason: `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
    };
  }

  if (plain.length > LONGUEUR_MAX_MOT_DE_PASSE) {
    return {
      ok: false,
      reason: `Le mot de passe ne peut pas dépasser ${LONGUEUR_MAX_MOT_DE_PASSE} caractères.`,
    };
  }

  if (plain.trim().length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return {
      ok: false,
      reason: `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères autres que des espaces.`,
    };
  }

  if (MOTS_DE_PASSE_COURANTS.has(plain.toLowerCase().trim())) {
    return {
      ok: false,
      reason: 'Ce mot de passe est trop courant. Choisissez une phrase que vous êtes seul à connaître.',
    };
  }

  return { ok: true };
}
