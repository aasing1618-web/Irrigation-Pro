/**
 * Cookie de session — transport « cookie » du jeton de rafraîchissement.
 *
 * Contexte (décision D-013, contrat `docs/API-VAGUE-4.md` § 1) : le produit est
 * désormais livré comme application **web**. Dans un navigateur, F5 vide la
 * mémoire vive — or c'est là que vivait le jeton de rafraîchissement. Il faut
 * donc un rangement qui survive au rechargement **sans jamais être lisible par
 * du JavaScript** : un cookie `HttpOnly`, posé et lu par le serveur seul.
 * `localStorage` et `sessionStorage` restent interdits, toute faille XSS les
 * lit.
 *
 * Ce module est le **seul** endroit du serveur qui connaisse le nom et les
 * attributs de ce cookie. C'est délibéré : un cookie ne s'efface que si les
 * attributs de l'effacement sont identiques à ceux de la pose. Deux définitions
 * écrites à deux endroits finiraient par diverger, et la déconnexion cesserait
 * silencieusement d'effacer quoi que ce soit.
 *
 * Aucune dépendance ajoutée : Express 5 sait poser un cookie (`res.cookie`), et
 * la lecture tient en une vingtaine de lignes — `cookie-parser` n'apporterait
 * rien qu'une dépendance de plus à surveiller.
 */

import type { CookieOptions, Request, Response } from 'express';

import { config } from '../config.js';

/** Où le client sait ranger son jeton de longue durée. */
export type TransportDeSession = 'body' | 'cookie';

/** Nom du cookie. Court, et sans information sur ce qu'il contient. */
export const NOM_COOKIE_SESSION = 'ip_refresh';

/**
 * Portée du cookie : les seules routes qui en ont besoin.
 *
 * Il n'accompagne donc ni les projets, ni les calculs, ni les rapports — un
 * secret de 30 jours ne doit pas être rediffusé à chaque requête de
 * l'application.
 */
export const CHEMIN_COOKIE_SESSION = '/api/auth';

/**
 * Durée de vie du cookie, alignée sur celle du jeton en base
 * (`REFRESH_TOKEN_TTL_DAYS`, 30 jours par défaut → `Max-Age=2592000`).
 *
 * L'alignement est une règle, pas une coïncidence : un cookie qui survivrait au
 * jeton renverrait le client vers un `401` à chaque rechargement, sans qu'il
 * puisse comprendre pourquoi.
 */
export const DUREE_COOKIE_SESSION_SECONDES: number = config.refreshTokenTtlDays * 24 * 60 * 60;

/**
 * Longueur maximale acceptée pour un jeton lu dans un cookie.
 *
 * Même borne que pour le champ `refreshToken` du corps JSON : au-delà, la
 * valeur n'a aucune chance d'être un jeton légitime (32 octets en base64url) et
 * n'a pas à être hachée ni cherchée en base.
 */
const LONGUEUR_MAX_JETON = 512;

/**
 * Attributs du cookie. Chacun est délibéré (contrat § 1) :
 *
 * | `HttpOnly` | toujours              | une faille XSS ne peut pas le lire — c'est la raison d'être du dispositif |
 * | `Secure`   | hors `development`    | jamais en clair sur le réseau ; omis en dev local, sinon `http://localhost` refuserait le cookie |
 * | `SameSite` | `Strict`              | aucun site tiers ne peut déclencher de requête portant ce cookie |
 * | `Path`     | `/api/auth`           | voir `CHEMIN_COOKIE_SESSION` |
 * | `Max-Age`  | durée du jeton en base | voir `DUREE_COOKIE_SESSION_SECONDES` |
 *
 * `SameSite=Strict` impose une contrainte de déploiement : l'application web et
 * l'API doivent partager le même domaine enregistrable (deux sous-domaines d'un
 * domaine à soi). Passer à `SameSite=None` rouvrirait la CSRF et est refusé.
 */
function attributsCookieSession(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.nodeEnv !== 'development',
    sameSite: 'strict',
    path: CHEMIN_COOKIE_SESSION,
  };
}

/**
 * Pose le cookie de session.
 *
 * Express convertit `maxAge` (millisecondes) en `Max-Age` (secondes) et ajoute
 * un `Expires` équivalent — un doublon volontaire de sa part, que les
 * navigateurs anciens sont seuls à lire. `Max-Age` prime partout ailleurs.
 */
export function poserCookieSession(res: Response, jeton: string): void {
  res.cookie(NOM_COOKIE_SESSION, jeton, {
    ...attributsCookieSession(),
    maxAge: DUREE_COOKIE_SESSION_SECONDES * 1000,
  });
}

/**
 * Efface le cookie de session.
 *
 * On repose volontairement un cookie **vide** avec `Max-Age=0` et **exactement**
 * les mêmes attributs (`Path`, `SameSite`, `Secure`, `HttpOnly`) : un navigateur
 * n'efface pas un cookie dont les attributs diffèrent de ceux de la pose. C'est
 * la raison pour laquelle `res.clearCookie` n'est pas utilisé ici — il retire
 * `Max-Age` et impose son propre `Path` par défaut.
 */
export function effacerCookieSession(res: Response): void {
  res.cookie(NOM_COOKIE_SESSION, '', {
    ...attributsCookieSession(),
    maxAge: 0,
  });
}

/**
 * Décode la valeur d'un cookie.
 *
 * Un client a le droit d'encoder la valeur (`%2F`…). Une séquence d'échappement
 * invalide fait lever `decodeURIComponent` : dans ce cas on conserve la valeur
 * brute plutôt que de laisser une exception remonter — un en-tête `Cookie`
 * malformé venu de n'importe quel navigateur ne doit jamais produire un `500`.
 */
function decoderValeurCookie(valeur: string): string {
  try {
    return decodeURIComponent(valeur);
  } catch {
    return valeur;
  }
}

/**
 * Analyse un en-tête `Cookie` et renvoie les paires nom → valeur.
 *
 * Cas traités, tous rencontrés en production :
 *   - en-tête absent → table vide ;
 *   - plusieurs cookies séparés par `;`, avec ou sans espaces ;
 *   - en-tête `Cookie` répété (Node concatène, mais un tableau reste possible) ;
 *   - valeur encodée en pourcent, ou entourée de guillemets (RFC 6265 § 4.1.1) ;
 *   - segment sans `=`, ou au nom vide → ignoré, jamais d'exception ;
 *   - même nom présent deux fois → **la première occurrence gagne**, comme le
 *     prescrit la RFC 6265 § 5.4 (le cookie de portée la plus précise d'abord).
 */
export function analyserEnteteCookie(entete: string | string[] | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (entete === undefined) return cookies;

  const segments = Array.isArray(entete) ? entete : [entete];

  for (const segment of segments) {
    if (typeof segment !== 'string') continue;

    for (const paire of segment.split(';')) {
      const separateur = paire.indexOf('=');
      if (separateur < 0) continue;

      const nom = paire.slice(0, separateur).trim();
      if (nom.length === 0) continue;
      if (cookies.has(nom)) continue;

      let valeur = paire.slice(separateur + 1).trim();
      if (valeur.length >= 2 && valeur.startsWith('"') && valeur.endsWith('"')) {
        valeur = valeur.slice(1, -1);
      }

      cookies.set(nom, decoderValeurCookie(valeur));
    }
  }

  return cookies;
}

/** Valeur d'un cookie de la requête, ou `null` s'il est absent. */
export function lireCookie(req: Request, nom: string): string | null {
  return analyserEnteteCookie(req.headers.cookie).get(nom) ?? null;
}

/**
 * Jeton de rafraîchissement porté par le cookie de session, ou `null`.
 *
 * Une valeur vide ou démesurée est traitée comme une absence : elle ne peut pas
 * être un jeton, et le client recevra de toute façon la réponse « session
 * expirée », identique à celle d'une session absente.
 */
export function lireCookieSession(req: Request): string | null {
  const valeur = lireCookie(req, NOM_COOKIE_SESSION);
  if (valeur === null || valeur.length === 0 || valeur.length > LONGUEUR_MAX_JETON) return null;
  return valeur;
}
