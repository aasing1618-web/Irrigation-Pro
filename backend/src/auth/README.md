# Module `auth/` — connexion, sessions, mots de passe

C'est le module le plus sensible du produit. Un défaut ici n'expose pas une
fonctionnalité : il expose **tous les comptes clients**. Lisez cette page avant
d'y toucher.

Référence qui fait autorité : `docs/API-VAGUE-1.md`. Décisions associées :
D-003 (hachage), D-005 et D-005b (jetons), D-010 (suspension immédiate).

---

## Ce que fait chaque fichier

| Fichier | Rôle |
|---|---|
| `password.ts` | Hachage `scrypt`, vérification, politique de mot de passe, tirage du mot de passe temporaire |
| `tokens.ts` | Signature et vérification du jeton d'accès (JWT), tirage et empreinte du jeton de rafraîchissement |
| `auth.service.ts` | Toute la logique métier : `login`, `refresh`, `logout`, `changePassword` |
| `errors.ts` | Codes et messages d'erreur figés par le contrat |
| `user-view.ts` | Conversions ligne SQL → compte authentifié → bloc `user` de l'API |
| `../middleware/require-auth.ts` | Garde appliquée à chaque requête authentifiée |
| `../api/auth.routes.ts` | Les cinq routes HTTP. Elles ne contiennent aucune règle de sécurité |
| `../../scripts/creer-admin.ts` | Création du tout premier compte administrateur, en ligne de commande |

La séparation routes / service n'est pas cosmétique : le service reçoit un
contexte (IP, User-Agent) plutôt qu'un objet `Request`, ce qui le rend testable
sans serveur HTTP — et ce qui empêche une route future de réimplémenter « juste
un petit bout » de la connexion en oubliant une vérification.

---

## Comment un mot de passe est stocké

Jamais en clair, nulle part, même temporairement.

```
scrypt$65536$8$1$<sel base64>$<empreinte base64>
```

`scrypt` avec N = 2¹⁶, r = 8, p = 1, sel aléatoire de 16 octets, empreinte de
64 octets. Comparaison en temps constant (`timingSafeEqual`).

Le format est **auto-descriptif** : les paramètres voyagent avec l'empreinte, et
`verifyPassword` les relit dans la chaîne stockée. On peut donc durcir les
réglages, ou migrer vers argon2id plus tard, sans invalider les comptes
existants.

Trois points sur lesquels il ne faut pas transiger :

- **Version asynchrone obligatoire.** `scryptSync` bloquerait la boucle
  d'événements ~200 ms par connexion : quelques requêtes simultanées suffiraient
  à figer le serveur.
- **`maxmem` explicite.** `scrypt` consomme ≈ 128 × N × r = 64 Mo, au-delà de la
  limite par défaut de Node (32 Mo). Sans ce paramètre, **tout** appel échoue.
- **Coût mémoire.** 64 Mo par calcul en cours : c'est le limiteur de débit sur
  `/login` qui empêche d'en lancer trop à la fois.

---

## Comment une suspension prend effet

C'est le seul levier commercial du propriétaire, donc le mécanisme le plus
important du module (D-010).

1. À chaque requête authentifiée, `requireAuth` **relit le statut en base**. Il
   n'est pas dans le jeton, et il ne doit jamais y être : un jeton d'accès n'est
   pas révocable.
2. Statut `SUSPENDU` → `403 ACCOUNT_SUSPENDED`, immédiatement.
3. Les jetons de rafraîchissement, eux, sont en base et donc révocables : à la
   suspension (Vague 3), toutes les sessions longues du compte sont coupées.

Conséquence : une suspension est effective **tout de suite** sur toute action
passant par le serveur, et au pire au bout de 15 minutes pour un jeton d'accès
déjà émis qui ne servirait à rien d'autre.

---

## Le verrouillage n'est pas une suspension

| | Verrouillage | Suspension |
|---|---|---|
| Déclencheur | 5 échecs de connexion | Décision du propriétaire |
| Durée | 15 min, doublée à chaque échec, plafond 2 h | Jusqu'à réactivation manuelle |
| Levée | Automatique | Manuelle, depuis le dashboard |
| Code renvoyé | `429 ACCOUNT_LOCKED` | `403 ACCOUNT_SUSPENDED` |

Le plafond de 2 h est volontaire : sans lui, un tiers pourrait bloquer
indéfiniment le compte d'un client en saisissant n'importe quoi.

---

## Les pièges à éviter en modifiant ce module

**Ne rendez jamais discernables un e-mail inconnu et un mot de passe faux.**
Même code, même message, même durée. C'est pour cela que la branche « compte
inconnu » appelle `verifyDummyPassword()` : sans ce calcul, la réponse
reviendrait en 1 ms contre 200 ms, et il suffirait de chronométrer les réponses
pour dresser la liste des adresses possédant un compte. Si vous ajoutez un cas
d'échec, faites-lui emprunter `invalidCredentials()`.

**Ne déplacez pas le contrôle de statut avant la vérification du mot de passe.**
`ACCOUNT_SUSPENDED` révèle qu'un compte existe — c'est assumé, mais uniquement
pour quelqu'un qui connaît déjà le mot de passe.

**N'ajoutez rien dans la charge utile du jeton d'accès.** Surtout pas le statut
ni `mustChangePassword` : ces valeurs changent en cours de session. Tout ce qui
peut changer se relit en base.

**Ne journalisez jamais l'adresse saisie lors d'un échec sur compte inconnu.**
Un utilisateur tape parfois son mot de passe dans le champ e-mail ; le journal
deviendrait un dépôt de secrets en clair. Même règle pour les jetons, y compris
leurs fragments.

**Ne supprimez pas la rotation des jetons de rafraîchissement**, ni la détection
de réutilisation. Un jeton révoqué qui revient signale un vol probable : toutes
les sessions du compte tombent. Effet de bord à connaître : après un changement
de mot de passe, si un second appareil tente de se rafraîchir avec son ancien
jeton, la session courante tombe aussi. C'est le comportement imposé par le
contrat.

**Ne faites pas sortir `password_hash` de la couche `db/`.** Les conversions de
`user-view.ts` sont le seul chemin autorisé, et aucune ne recopie l'empreinte.

**Ne laissez pas une erreur de journalisation faire échouer une connexion.**
`journaliser()` avale les échecs d'écriture d'audit : si la table est
indisponible, les clients doivent quand même pouvoir travailler.

**Ne remplacez pas `crypto.randomInt` par `Math.random`** dans le tirage du mot
de passe temporaire : la suite de `Math.random` est reconstituable.

---

## Tests

`backend/tests/password.test.ts`, `tokens.test.ts`, `require-auth.test.ts`,
`auth.routes.test.ts`.

Ils tournent **sans PostgreSQL** : les dépôts sont remplacés par un état en
mémoire (`tests/helpers/comptes.ts`). Toute modification de ce module doit
laisser passer l'intégralité de ces tests — en particulier ceux qui vérifient
l'indiscernabilité des échecs et l'absence de `password_hash` dans les réponses.

Un détail à connaître : chaque `scrypt` coûte ~200 ms, c'est le but. Les tests
qui enchaînent plusieurs connexions ont donc un délai élargi. Ne réduisez pas le
coût pour accélérer la suite.
