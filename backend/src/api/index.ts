/**
 * Routeur racine de l'API, monté sur `/api` par `app.ts`.
 *
 * Une ligne par domaine fonctionnel.
 *
 * Note d'ordre : `/calculs` est déclaré avant `/projects` sans que cela ait
 * d'importance ici — les deux préfixes sont disjoints. Les routes de calcul
 * *rattachées à un projet* (`/api/projects/:id/calculs`) vivent volontairement
 * dans `projects.routes.ts` : ce sont des sous-ressources d'un projet, donc
 * soumises à la vérification de propriétaire, et les regrouper là rend cette
 * vérification visible au même endroit que les autres.
 */

import { Router } from 'express';

import { adminRouter } from './admin.routes.js';
import { authRouter } from './auth.routes.js';
import { calculsRouter } from './calculs.routes.js';
import { healthRouter } from './health.routes.js';
import { projectsRouter } from './projects.routes.js';

export const apiRouter: Router = Router();

// → GET /api/health et GET /api/version
apiRouter.use(healthRouter);

// → /api/auth/login, /refresh, /logout, /me, /change-password (Vague 1)
apiRouter.use('/auth', authRouter);

// → /api/calculs/modules, /references/:table, /:module (Vague 2)
apiRouter.use('/calculs', calculsRouter);

// → /api/projects… et /api/projects/:id/calculs… (Vague 2)
apiRouter.use('/projects', projectsRouter);

// → /api/admin/users…, /api/admin/activite (Vague 3, réservé au rôle ADMIN)
apiRouter.use('/admin', adminRouter);
