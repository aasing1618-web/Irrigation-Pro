/**
 * Routes de supervision — Vague 0.
 *
 * `GET /health`  : l'application cliente s'en sert au démarrage pour savoir si
 *                  le serveur est joignable et si la base répond.
 * `GET /version` : version publiée de l'API.
 *
 * Ces deux routes sont PUBLIQUES. Elles ne doivent donc rien révéler
 * d'exploitable : pas de chaîne de connexion, pas de version de PostgreSQL, pas
 * de nom d'hôte, pas de message d'erreur technique. Uniquement « ça répond » ou
 * « ça ne répond pas », et en combien de temps.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Router } from 'express';

import { checkDatabase } from '../db/index.js';
import { logger } from '../logger.js';

/** Nom public de l'API. */
export const API_NAME = 'Irrigation Pro API';

/**
 * Version lue une seule fois dans `backend/package.json`.
 * Le chemin relatif est identique depuis `src/api/` et depuis `dist/api/`.
 */
export const API_VERSION: string = lireVersion();

function lireVersion(): string {
  try {
    const chemin = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const contenu: unknown = JSON.parse(readFileSync(chemin, 'utf8'));
    const version = (contenu as { version?: unknown }).version;
    return typeof version === 'string' ? version : '0.0.0';
  } catch (err) {
    logger.warn({ err }, 'Version introuvable dans package.json');
    return '0.0.0';
  }
}

export const healthRouter: Router = Router();

healthRouter.get('/health', async (_req, res) => {
  // `checkDatabase` ne lève normalement pas ; le filet est là pour garantir que
  // /health répond TOUJOURS, même si la couche db casse.
  let base: { ok: boolean; latencyMs: number };
  try {
    const résultat = await checkDatabase();
    base = { ok: résultat.ok, latencyMs: résultat.latencyMs };
  } catch (err) {
    logger.error({ err }, 'Échec inattendu de la vérification de la base');
    base = { ok: false, latencyMs: 0 };
  }

  res.status(base.ok ? 200 : 503).json({
    status: base.ok ? 'ok' : 'degraded',
    version: API_VERSION,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    // `error` volontairement omis : il contiendrait un message technique.
    database: { ok: base.ok, latencyMs: base.latencyMs },
  });
});

healthRouter.get('/version', (_req, res) => {
  res.json({ name: API_NAME, version: API_VERSION });
});
