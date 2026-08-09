/**
 * Configuration du serveur.
 *
 * Principe : le serveur ne démarre JAMAIS à moitié configuré. Toutes les
 * variables d'environnement sont lues une seule fois ici, validées avec `zod`,
 * puis exposées sous forme d'un objet typé et figé. Si quoi que ce soit manque
 * ou est invalide, on affiche un message clair en français et on s'arrête.
 *
 * Les valeurs attendues sont documentées dans `backend/.env.example`.
 */

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/** Valeur d'exemple livrée dans `.env.example` : interdite en production. */
const EXEMPLE_JWT_SECRET = 'a_remplacer_par_une_valeur_aleatoire_de_48_octets_minimum';

/** Secret de repli, utilisable UNIQUEMENT hors production (dev et tests). */
const JWT_SECRET_DEV = 'secret-de-developpement-uniquement-ne-jamais-utiliser-en-production';

/** Longueur minimale exigée pour un secret de signature en production. */
const LONGUEUR_MIN_JWT_SECRET = 32;

const ORIGINES_PAR_DEFAUT = 'tauri://localhost,http://localhost:5173,http://localhost:5174';

const nodeEnv = z
  .enum(['development', 'test', 'production'])
  .catch('development')
  .parse(process.env.NODE_ENV);

const estProduction = nodeEnv === 'production';
const estTest = nodeEnv === 'test';

/**
 * Découpe une liste séparée par des virgules en tableau propre
 * (espaces retirés, entrées vides ignorées, doublons supprimés).
 */
function listeSeparéeParVirgules(valeur: string): string[] {
  return [...new Set(valeur.split(',').map((element) => element.trim()).filter(Boolean))];
}

const schémaEnvironnement = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce
    .number({ invalid_type_error: 'doit être un nombre' })
    .int('doit être un nombre entier')
    .min(1, 'doit être compris entre 1 et 65535')
    .max(65535, 'doit être compris entre 1 et 65535')
    .default(4000),

  // En test, aucune base réelle n'est requise (les tests moquent la couche db).
  DATABASE_URL: estTest
    ? z.string().default('postgresql://irrigation:irrigation@localhost:5432/irrigation_pro_test')
    : z
        .string({ required_error: 'variable obligatoire' })
        .min(1, 'variable obligatoire')
        .startsWith('postgres', 'doit commencer par « postgresql:// »'),

  TEST_DATABASE_URL: z.string().min(1).optional(),

  // Hors production on tolère un secret de développement pour que le projet
  // démarre sans configuration ; en production le secret est obligatoire.
  JWT_SECRET: estProduction
    ? z.string({ required_error: 'variable obligatoire' }).min(1, 'variable obligatoire')
    : z.string().min(1).default(JWT_SECRET_DEV),

  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, 'doit être une durée comme « 15m », « 2h » ou « 7d »')
    .default('15m'),

  REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number({ invalid_type_error: 'doit être un nombre' })
    .int('doit être un nombre entier de jours')
    .min(1, 'doit valoir au moins 1 jour')
    .max(365, 'ne peut pas dépasser 365 jours')
    .default(30),

  CORS_ORIGINS: estProduction
    ? z
        .string({ required_error: 'variable obligatoire' })
        .min(1, 'variable obligatoire : la liste blanche des origines ne peut pas être vide')
    : z.string().min(1).default(ORIGINES_PAR_DEFAUT),

  WHATSAPP_NUMBER: z
    .string()
    .default('')
    .refine(
      (valeur) => valeur === '' || /^\d{8,15}$/.test(valeur),
      'doit être un numéro international sans « + » ni espaces (8 à 15 chiffres)',
    ),
});

const résultat = schémaEnvironnement
  .superRefine((valeurs, ctx) => {
    if (!estProduction) return;

    if (valeurs.JWT_SECRET === EXEMPLE_JWT_SECRET || valeurs.JWT_SECRET === JWT_SECRET_DEV) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message:
          'la valeur d’exemple ne peut pas être utilisée en production — générer un secret unique',
      });
    } else if (valeurs.JWT_SECRET.length < LONGUEUR_MIN_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: `doit faire au moins ${LONGUEUR_MIN_JWT_SECRET} caractères en production (actuellement ${valeurs.JWT_SECRET.length})`,
      });
    }

    if (valeurs.WHATSAPP_NUMBER === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WHATSAPP_NUMBER'],
        message: 'variable obligatoire en production',
      });
    }
  })
  .safeParse(process.env);

if (!résultat.success) {
  const lignes = résultat.error.issues.map((problème) => {
    const champ = problème.path.join('.') || '(racine)';
    return `  • ${champ} : ${problème.message}`;
  });

  // Volontairement `console.error` et non le logger : la configuration n'est
  // pas encore chargée, et ce message doit rester lisible en toutes circonstances.
  console.error(
    [
      '',
      '❌ Configuration invalide — le serveur ne peut pas démarrer.',
      '',
      ...lignes,
      '',
      'Corrigez le fichier « backend/.env » (modèle : backend/.env.example) puis relancez.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const env = résultat.data;

export const config: {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  testDatabaseUrl: string | undefined;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtlDays: number;
  corsOrigins: string[];
  whatsappNumber: string;
  isProduction: boolean;
} = Object.freeze({
  nodeEnv,
  port: env.PORT,
  databaseUrl: estTest && env.TEST_DATABASE_URL ? env.TEST_DATABASE_URL : env.DATABASE_URL,
  testDatabaseUrl: env.TEST_DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  accessTokenTtl: env.ACCESS_TOKEN_TTL,
  refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  corsOrigins: Object.freeze(listeSeparéeParVirgules(env.CORS_ORIGINS)) as string[],
  whatsappNumber: env.WHATSAPP_NUMBER,
  isProduction: estProduction,
});
