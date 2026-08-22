/**
 * Construction de l'application Express.
 *
 * Ce fichier ne démarre RIEN : il assemble seulement les middlewares et les
 * routes, et renvoie l'application. C'est ce qui permet aux tests de l'appeler
 * avec `supertest` sans ouvrir de port réseau. Le démarrage réel est dans
 * `server.ts`.
 *
 * Ordre des middlewares (il compte) :
 *   1. identifiant de requête   → présent dans tous les journaux qui suivent
 *   2. helmet                   → en-têtes de sécurité
 *   3. Vary: Origin             → correction de cache, sur toutes les réponses
 *   4. CORS                     → liste blanche stricte d'origines
 *   5. express.json             → corps JSON, taille plafonnée
 *   6. pino-http                → journalisation des requêtes
 *   7. routes                   → /health, /version, puis /api (avec limiteur)
 *   8. 404                      → route inconnue
 *   9. gestionnaire d'erreurs   → toujours en dernier
 */

import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinoHttp } from 'pino-http';

import { apiRouter } from './api/index.js';
import { healthRouter } from './api/health.routes.js';
import { config } from './config.js';
import { forbidden } from './errors.js';
import { logger } from './logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import { genReqId, requestId } from './middleware/request-id.js';

/** Taille maximale d'un corps JSON accepté. */
const LIMITE_CORPS_JSON = '1mb';

/**
 * CORS en liste blanche stricte.
 *
 * - origine absente (curl, sonde de supervision, appel serveur à serveur) :
 *   pas d'en-tête CORS, la requête passe — un navigateur envoie toujours
 *   `Origin`, donc ce cas ne concerne pas les clients web ;
 * - origine connue : autorisée ;
 * - origine inconnue : refusée explicitement en 403.
 *
 * `credentials: true` (décision D-013, qui amende D-005b) : l'application web
 * range son jeton de rafraîchissement dans un cookie `HttpOnly`, et un
 * navigateur n'envoie un cookie en requête croisée que si le serveur autorise
 * explicitement les credentials.
 *
 * La liste blanche reste donc **stricte**, et ce n'est plus seulement une bonne
 * pratique : avec `Access-Control-Allow-Credentials: true`, un navigateur refuse
 * purement et simplement `Access-Control-Allow-Origin: *`. Le cookie est par
 * ailleurs `SameSite=Strict`, ce qui referme la surface CSRF que le retour des
 * cookies aurait pu rouvrir.
 */
const optionsCors: CorsOptions = {
  origin(origine, callback) {
    if (!origine) {
      callback(null, false);
      return;
    }
    if (config.corsOrigins.includes(origine)) {
      callback(null, true);
      return;
    }
    callback(forbidden('Origine non autorisée.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86_400,
};

export function createApp(): Express {
  const app = express();

  // N'annonce pas « Express » à qui vient regarder.
  app.disable('x-powered-by');

  // En production le serveur est derrière un reverse proxy HTTPS : sans cela,
  // l'IP vue par le limiteur de débit serait celle du proxy pour tout le monde.
  if (config.isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(requestId);

  app.use(
    helmet({
      // L'API ne sert que du JSON, jamais de page HTML : une CSP navigateur
      // n'aurait rien à protéger ici.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      // L'application desktop (origine tauri://localhost) consomme l'API depuis
      // une autre origine : la politique par défaut « same-origin » la bloquerait.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // `Vary: Origin` sur TOUTES les réponses, y compris celles qui n'ont pas
  // d'en-tête CORS. Le middleware `cors` ne le pose que lorsqu'une origine est
  // présente : une réponse à un appel sans `Origin` (curl, sonde, serveur à
  // serveur) en serait dépourvue et pourrait être resservie par un cache
  // intermédiaire à un navigateur d'une autre origine. Le paquet `vary`
  // déduplique, la pose par `cors` juste après est donc sans effet de bord.
  app.use((req, res, next) => {
    res.vary('Origin');

    const origine = req.headers.origin;
    const host = req.headers.host;
    const estMemeOrigine = Boolean(
      origine && host && (origine === `https://${host}` || origine === `http://${host}`),
    );

    const origineAutorisee =
      !origine || estMemeOrigine || config.corsOrigins.includes(origine);

    if (origineAutorisee) {
      cors({
        origin: origine ? (estMemeOrigine || config.corsOrigins.includes(origine) ? origine : false) : false,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['X-Request-Id'],
        maxAge: 86_400,
      })(req, res, next);
    } else {
      next(forbidden('Origine non autorisée.'));
    }
  });

  app.use(express.json({ limit: LIMITE_CORPS_JSON }));

  app.use(
    pinoHttp({
      logger,
      genReqId,
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: {
        // Les sondes de supervision appellent /health en boucle : inutile de
        // remplir les journaux avec ça.
        ignore: (req) => req.url === '/health' || req.url === '/api/health',
      },
    }),
  );

  // Supervision à la racine, hors limiteur : une sonde ne doit jamais être
  // bloquée par la limitation de débit.
  app.use(healthRouter);

  // Toute l'API métier, protégée par le limiteur général.
  app.use('/api', apiRateLimiter, apiRouter);

  // Filet de sécurité : l'API doit renvoyer du JSON 404, jamais tomber dans le fallback HTML
  app.all(/^\/api/, notFoundHandler);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // Service de l'interface administrateur sous /admin
  const adminDist = path.resolve(__dirname, '../../admin/dist');
  app.use('/admin', express.static(adminDist));
  app.use('/admin', (req, res, next) => {
    if (req.method === 'GET') {
      res.sendFile(path.resolve(adminDist, 'index.html'));
    } else {
      next();
    }
  });

  // Service de l'application cliente sous /
  const appDist = path.resolve(__dirname, '../../app/dist');
  app.use(express.static(appDist));
  app.use((req, res, next) => {
    if (req.method === 'GET') {
      res.sendFile(path.resolve(appDist, 'index.html'));
    } else {
      next();
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
