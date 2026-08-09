/**
 * Routeur racine de l'API, monté sur `/api` par `app.ts`.
 *
 * Une ligne par domaine fonctionnel. La Vague 2 viendra brancher ici
 * `projectsRouter`.
 */

import { Router } from 'express';

import { authRouter } from './auth.routes.js';
import { healthRouter } from './health.routes.js';

export const apiRouter: Router = Router();

// → GET /api/health et GET /api/version
apiRouter.use(healthRouter);

// → /api/auth/login, /refresh, /logout, /me, /change-password (Vague 1)
apiRouter.use('/auth', authRouter);

// Vague 2 : apiRouter.use('/projects', projectsRouter);
