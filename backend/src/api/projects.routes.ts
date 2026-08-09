/**
 * Routes des projets et des calculs — **Vague 2**.
 *
 * Emplacement réservé : rien n'est implémenté ici en Vague 0.
 *
 * Contenu prévu (voir CLAUDE.md, Vague 2) :
 *   GET    /api/projects        liste des projets de l'utilisateur connecté
 *   POST   /api/projects        création
 *   GET    /api/projects/:id    consultation
 *   PATCH  /api/projects/:id    modification
 *   DELETE /api/projects/:id    suppression
 *   POST   /api/projects/:id/compute   lancement d'un calcul
 *
 * Règle absolue : chaque requête vérifie côté serveur que le projet appartient
 * bien à l'utilisateur connecté. Un projet appartenant à quelqu'un d'autre
 * renvoie 404, jamais 403 — sinon on révélerait son existence.
 */

export {};
