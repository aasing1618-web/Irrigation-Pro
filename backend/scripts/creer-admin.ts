/**
 * Création du tout premier compte administrateur.
 *
 *     npm run creer-admin -- --email "proprietaire@exemple.sn" --nom "Nom Prénom"
 *
 * Il n'existe **aucune inscription** dans Irrigation Pro : le premier compte ne
 * peut donc naître que sur le serveur, à la main. Toute la suite (comptes
 * clients) se fera ensuite depuis le dashboard administrateur, en Vague 3.
 *
 * Le mot de passe temporaire est tiré au hasard, affiché **une seule fois**,
 * puis oublié : seule son empreinte part en base. Il n'est écrit dans aucun
 * fichier et n'apparaît dans aucun journal — ni celui du serveur, ni
 * l'historique de la commande.
 */

import { closePool } from '../src/db/index.js';
import { logger } from '../src/logger.js';
import { generateTemporaryPassword, hashPassword } from '../src/auth/password.js';
import { countAdmins, createUser, findUserByEmail } from '../src/db/repositories/users.repo.js';

/**
 * Cette commande s'adresse à un humain, pas à un agrégateur de journaux : on
 * coupe la journalisation technique (traces SQL, piles d'appels) pour que la
 * sortie reste lisible. Rien n'est perdu — les erreurs sont interceptées plus
 * bas et réexpliquées en français.
 */
logger.level = 'silent';

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

const LARGEUR = 68;

function ligne(caractere = '─'): string {
  return caractere.repeat(LARGEUR);
}

function afficher(message = ''): void {
  // `console.log` volontaire : cette commande s'adresse à un humain devant son
  // écran, pas à un agrégateur de journaux. Le logger pino, lui, écrirait du
  // JSON et pourrait être redirigé vers un fichier — inacceptable ici, puisque
  // la sortie contient un mot de passe.
  console.log(message);
}

function echouer(message: string, conseil?: string): never {
  console.error('');
  console.error(`❌ ${message}`);
  if (conseil) {
    console.error('');
    console.error(`   ${conseil}`);
  }
  console.error('');
  process.exitCode = 1;
  throw new ErreurDeCommande(message);
}

/** Erreur « attendue » : elle a déjà été expliquée à l'utilisateur. */
class ErreurDeCommande extends Error {}

// ---------------------------------------------------------------------------
// Analyse des arguments
// ---------------------------------------------------------------------------

interface Arguments {
  email: string;
  nom: string;
  societe: string | null;
  force: boolean;
}

const AIDE = `
Usage :
  npm run creer-admin -- --email "proprietaire@exemple.sn" --nom "Nom Prénom"

Options :
  --email <adresse>    Adresse e-mail de connexion       (obligatoire)
  --nom <texte>        Nom complet affiché               (obligatoire)
  --societe <texte>    Société ou bureau d'études        (facultatif)
  --force              Créer même s'il existe déjà un administrateur
  --aide               Afficher ce message
`;

function analyserArguments(argv: string[]): Arguments {
  const valeurs = new Map<string, string>();
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) continue;

    if (argument === '--force') {
      force = true;
      continue;
    }
    if (argument === '--aide' || argument === '--help' || argument === '-h') {
      afficher(AIDE);
      process.exit(0);
    }
    if (argument.startsWith('--')) {
      const nom = argument.slice(2);
      const suivant = argv[index + 1];
      if (suivant === undefined || suivant.startsWith('--')) {
        echouer(
          `L'option « ${argument} » attend une valeur.`,
          'Exemple : --email "proprietaire@exemple.sn"',
        );
      }
      valeurs.set(nom, suivant);
      index += 1;
      continue;
    }

    echouer(
      `Argument inattendu : « ${argument} ».`,
      'Lancez « npm run creer-admin -- --aide » pour voir les options.',
    );
  }

  const email = (valeurs.get('email') ?? '').trim().toLowerCase();
  const nom = (valeurs.get('nom') ?? valeurs.get('name') ?? '').trim();
  const societe = (valeurs.get('societe') ?? valeurs.get('société') ?? '').trim();

  if (!email) {
    echouer('L’adresse e-mail est obligatoire.', 'Ajoutez : --email "proprietaire@exemple.sn"');
  }
  // Contrôle volontairement simple : on veut écarter les fautes de frappe
  // évidentes, pas valider la RFC 5322.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    echouer(
      `« ${email} » ne ressemble pas à une adresse e-mail valide.`,
      'Format attendu : nom@domaine.sn',
    );
  }
  if (!nom) {
    echouer('Le nom complet est obligatoire.', 'Ajoutez : --nom "Nom Prénom"');
  }
  if (nom.length > 120) {
    echouer('Le nom complet ne peut pas dépasser 120 caractères.');
  }

  return { email, nom, societe: societe === '' ? null : societe, force };
}

// ---------------------------------------------------------------------------
// Programme
// ---------------------------------------------------------------------------

async function principal(): Promise<void> {
  const options = analyserArguments(process.argv.slice(2));

  afficher('');
  afficher(ligne('═'));
  afficher('  IRRIGATION PRO — création du compte administrateur');
  afficher(ligne('═'));
  afficher('');

  const nombreAdmins = await countAdmins();
  if (nombreAdmins > 0 && !options.force) {
    echouer(
      `Un compte administrateur existe déjà (${nombreAdmins} au total).`,
      'Si vous voulez vraiment en créer un second, relancez la commande avec --force.',
    );
  }

  const existant = await findUserByEmail(options.email);
  if (existant) {
    echouer(
      `Un compte utilise déjà l’adresse « ${options.email} ».`,
      'Choisissez une autre adresse, ou utilisez le dashboard pour gérer ce compte.',
    );
  }

  const motDePasseTemporaire = generateTemporaryPassword();
  const empreinte = await hashPassword(motDePasseTemporaire);

  const compte = await createUser({
    email: options.email,
    passwordHash: empreinte,
    fullName: options.nom,
    company: options.societe,
    role: 'ADMIN',
    // Aucun administrateur n'est à l'origine du tout premier compte.
    createdBy: null,
  });

  if (!compte.must_change_password) {
    // Filet de sécurité : si un jour la valeur par défaut de la colonne
    // changeait, le mot de passe temporaire deviendrait permanent sans que
    // personne s'en aperçoive.
    afficher('');
    afficher('⚠  Attention : le changement de mot de passe obligatoire n’est PAS actif');
    afficher('   sur ce compte. Signalez-le, c’est un défaut de configuration.');
  }

  afficher('✅ Compte administrateur créé.');
  afficher('');
  afficher(`   Nom       : ${compte.full_name}`);
  if (compte.company) afficher(`   Société   : ${compte.company}`);
  afficher(`   E-mail    : ${compte.email}`);
  afficher(`   Statut    : ${compte.status}`);
  afficher('');
  afficher(ligne());
  afficher('  MOT DE PASSE TEMPORAIRE — affiché une seule fois');
  afficher(ligne());
  afficher('');
  afficher(`      ${motDePasseTemporaire}`);
  afficher('');
  afficher(ligne());
  afficher('');
  afficher('  Notez-le maintenant. Il n’est pas conservé : la base ne contient');
  afficher('  qu’une empreinte, impossible à retrouver. Il ne pourra plus être');
  afficher('  réaffiché — en cas de perte, il faudra recréer le compte.');
  afficher('');
  afficher('  Communiquez-le par WhatsApp, puis effacez le message une fois la');
  afficher('  première connexion faite.');
  afficher('');
  afficher('  À la première connexion, l’application demandera de le remplacer.');
  afficher('');
}

/**
 * Traduit une erreur technique en une phrase compréhensible.
 *
 * Le driver `pg` remonte volontiers des `AggregateError` au message vide
 * (IPv6 puis IPv4 refusés) : sans cette traduction, l'utilisateur verrait une
 * ligne blanche en guise d'explication.
 */
function expliquer(erreur: unknown): { message: string; conseil: string } {
  const code = (erreur as { code?: unknown }).code;
  const brut = erreur instanceof Error ? erreur.message.trim() : String(erreur).trim();

  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT') {
    return {
      message: 'La base de données est injoignable.',
      conseil:
        'Vérifiez DATABASE_URL dans « backend/.env » et votre connexion Internet\n   (la base est hébergée chez Supabase).',
    };
  }

  if (typeof code === 'string' && code === '42P01') {
    return {
      message: 'Les tables n’existent pas encore dans la base.',
      conseil: 'Appliquez les migrations : npm run migrate',
    };
  }

  return {
    message: brut !== '' ? brut : `Erreur technique${typeof code === 'string' ? ` (${code})` : ''}.`,
    conseil:
      'Vérifiez que « backend/.env » contient un DATABASE_URL valide et que les\n   migrations ont été appliquées (npm run migrate).',
  };
}

try {
  await principal();
} catch (erreur) {
  if (!(erreur instanceof ErreurDeCommande)) {
    const explication = expliquer(erreur);
    console.error('');
    console.error('❌ La création du compte a échoué.');
    console.error('');
    console.error(`   ${explication.message}`);
    console.error('');
    console.error(`   ${explication.conseil}`);
    console.error('');
    process.exitCode = 1;
  }
} finally {
  await closePool();
}

// Le pool est fermé, mais un socket TLS encore en cours de fermeture peut
// retenir le processus : on sort explicitement avec le code déjà positionné.
process.exit(process.exitCode ?? 0);
