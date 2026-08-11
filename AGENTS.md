# AGENTS.md — règles pour tout agent travaillant sur Irrigation Pro

Ce fichier s'adresse à **tout assistant de code** intervenant sur ce dépôt
(Antigravity, Claude Code, Copilot, Cursor…). Il est court exprès : il doit être
lu en entier, à chaque fois.

`CLAUDE.md` reste le **cahier des charges produit** et fait foi en cas de
conflit. Ce fichier-ci dit **comment travailler**, pas quoi construire.

---

## 1. Lire avant d'écrire

| Fichier | Ce qu'il contient |
|---|---|
| `CLAUDE.md` | Le cahier des charges. Fait foi. |
| `docs/REPRISE.md` | **Où en est le projet aujourd'hui.** À lire en premier. |
| `docs/DECISIONS.md` | 14 décisions d'architecture justifiées. Ne pas en contredire une sans l'écrire. |
| `docs/API-VAGUE-*.md` | Les contrats d'API. Le code doit s'y conformer, pas l'inverse. |
| `docs/MOTEUR-*.md` | La spécification des calculs, avec 16 cas de référence chiffrés. |

---

## 2. Ce qu'il ne faut jamais faire

- ❌ **Toucher à `backend/src/engine/` sans lire `docs/MOTEUR-GRAVITAIRE.md` et
  `docs/MOTEUR-SOUS-PRESSION.md`.** Les formules reproduisent 16 cas de
  référence à 1e-6 près. Une « simplification » casse le produit en silence.
- ❌ **Modifier un contrat `docs/API-VAGUE-*.md` pour faire passer du code.**
  C'est le code qui a tort.
- ❌ **Écrire un secret dans le dépôt.** Ni mot de passe, ni `JWT_SECRET`, ni
  chaîne de connexion. Les `.env` ne sont pas versionnés.
- ❌ **Exécuter une opération destructive sur la base Supabase** (`DROP`,
  `TRUNCATE`, `DELETE` sans filtre, suppression d'une migration déjà appliquée).
  C'est la base de production. Les migrations s'ajoutent, elles ne se modifient
  jamais.
- ❌ **Utiliser `localStorage`, `sessionStorage` ou un fichier en clair** pour un
  jeton. Décisions D-005b et D-013.
- ❌ **Ajouter du paiement, une clé de licence, une expiration automatique, un
  panier, un prix affiché, une API WhatsApp.** Exclusions produit assumées
  (`CLAUDE.md`, D-008).
- ❌ **Ajouter une dépendance npm** sans nécessité démontrée.
- ❌ **Déclarer terminé ce qui n'est pas testé.**

---

## 3. Les règles de sécurité qui ne se négocient pas

1. Toute vérification d'accès se fait **sur le serveur**, jamais seulement dans l'interface.
2. Une ressource appartenant à un autre client renvoie **404**, jamais 403.
3. E-mail inconnu et mot de passe faux renvoient **le même code, le même message et la même durée**.
4. Aucun secret dans les journaux — un filtre de rédaction existe dans `backend/src/logger.ts`, il faut le compléter, pas le contourner.
5. Les formules de calcul s'exécutent **côté serveur uniquement**. Rien de sensible ne descend dans le navigateur.

---

## 4. Comment on travaille ici

- **Français partout** : code, commentaires, noms de variables métier, messages
  d'erreur, interface, documentation.
- **TypeScript strict.** Backend en ESM `NodeNext` : tout import relatif porte
  l'extension `.js`. `noUncheckedIndexedAccess` est actif.
- **Tailwind v4** : les jetons de style vivent dans le CSS (`@theme`), il n'y a
  pas de `tailwind.config.js`.
- **Réutiliser** les composants existants (`Button`, `Card`, `Field`,
  `FormAlert`, `Dialog`…) plutôt que d'en créer un de plus.
- **Modification chirurgicale** : on touche à ce qui est demandé, rien d'autre.
  Pas de réécriture de fichier entier pour trois lignes.
- Pas de code mort, pas de `console.log`, pas de TODO laissé derrière soi.

---

## 5. Avant de dire « c'est fait »

```bash
cd backend && npm run typecheck && npm test
cd app     && npm run typecheck && npm test && npm run build
cd admin   && npm run typecheck && npm test && npm run build
cd site    && npm run typecheck && npm test && npm run build
```

**570+ tests doivent rester verts.** Un test existant qui casse signale un
défaut dans le nouveau code, pas un test à ajuster.

Puis dire, franchement : ce qui marche, ce qui n'est pas testé, ce qui reste.
Un compte rendu honnête vaut mieux qu'un compte rendu flatteur.
