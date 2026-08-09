/**
 * Routeur racine de l'API, monté sur `/api` par `app.ts`.
 *
 * Une ligne par domaine fonctionnel. Les vagues suivantes viendront brancher
 * ici `authRouter` (Vague 1) et `projectsRouter` (Vague 2).
 */

import { Router } from 'express';

import { healthRouter } from './health.routes.js';

export const apiRouter: Router = Router();

// → GET /api/health et GET /api/version
apiRouter.use(healthRouter);

// Vague 1 : apiRouter.use('/auth', authRouter);
// Vague 2 : apiRouter.use('/projects', projectsRouter);
