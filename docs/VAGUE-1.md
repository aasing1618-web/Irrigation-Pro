# Vague 1 — Connexion et comptes · Compte rendu de livraison

**Objectif fixé par le cahier des charges :** « Un client avec un compte ACTIF
peut se connecter, un compte SUSPENDU est bloqué. »

**Statut : code livré et testé. Vérification en conditions réelles en attente
de la chaîne de connexion Supabase.**

---

## Ce que le client voit maintenant

1. Il lance Irrigation Pro. Le logiciel vérifie que le serveur répond.
2. Il saisit l'e-mail et le mot de passe que vous lui avez envoyés par WhatsApp.
3. **À la première connexion, il doit changer son mot de passe.** Il ne peut
   rien faire d'autre tant que ce n'est pas fait — aucune URL, aucun retour
   arrière ne contourne cet écran.
4. Ensuite il entre dans l'application. Son nom apparaît dans la barre latérale,
   avec un bouton de déconnexion.

Si son compte est **suspendu**, il reçoit un message clair l'invitant à vous
contacter. Si son compte est **verrouillé** après trop de tentatives, le message
est différent : il lui dit d'attendre. Ces deux situations n'appellent pas la
même réaction de sa part, elles ne sont donc pas présentées pareil.

---

## Comment un compte est créé

Il n'existe **aucune inscription**. Vous créez chaque compte à la main, depuis le
serveur :

```bash
npm run creer-admin -- --email "client@exemple.sn" --nom "Nom Prénom"
```

La commande tire un mot de passe temporaire au hasard et **l'affiche une seule
fois**. Il n'est stocké nulle part en clair — ni en base, ni dans un journal, ni
dans un fichier. Vous le copiez, vous l'envoyez par WhatsApp, et le client devra
le changer dès sa première connexion.

En Vague 3, cette commande sera remplacée par un bouton dans votre dashboard.

---

## Comment une suspension prend effet

C'est votre seul levier commercial : il devait être fiable.

Le statut du compte est **relu dans la base à chaque requête**, et non pas
seulement au moment de la connexion. Concrètement, quand vous suspendez un
compte :

- toutes ses sessions ouvertes sont fermées immédiatement ;
- toute action qu'il tenterait est refusée ;
- au plus tard **15 minutes** après, il est éjecté vers l'écran de connexion.

Il n'existe aucun moyen de « rester connecté » en gardant l'application ouverte.

---

## Ce qui protège les comptes

| Protection | Ce que ça empêche |
|---|---|
| Mots de passe hachés avec `scrypt` | Même en cas de vol de la base, les mots de passe restent inutilisables |
| Réponse identique pour « e-mail inconnu » et « mot de passe faux » — même message, **même durée** | Découvrir quelles adresses possèdent un compte |
| Verrouillage progressif : 5 échecs → 15 min, puis doublement jusqu'à 2 h | Essayer les mots de passe un par un |
| Limitation par adresse IP | La même attaque, menée depuis un programme |
| Session courte (15 min) renouvelée automatiquement | Qu'un jeton volé serve longtemps |
| Rotation des jetons de session + détection de réutilisation | Qu'un jeton volé serve deux fois sans que ça se voie |
| Journal des connexions, réussies **et** échouées | De ne pas voir venir une attaque |

Aucun mot de passe, aucun jeton, ni aucun de leurs fragments n'apparaît dans les
journaux — un filtre en base les retire même si un développeur les y envoie par
erreur.

---

## Le changement Supabase

À votre demande, la base n'est plus installée localement : elle est hébergée par
**Supabase** (projet `irrigation-pro`). **Supabase sert de base de données, et
de rien d'autre** — l'authentification reste la nôtre, et l'application ne parle
jamais à Supabase directement, uniquement à votre serveur. C'est ce qui permet
aux formules de calcul de rester protégées côté serveur.

Rien de ce qui avait été livré en Vague 0 n'a été jeté : seule l'adresse de
connexion change.

### Un point de sécurité qu'il fallait traiter

Supabase publie **automatiquement** une API REST sur toutes les tables. La clé
« anon » qui y donne accès est faite pour être distribuée publiquement. Sans
précaution, vos tables `users` et `projects` auraient donc été lisibles par
n'importe qui, **sans passer par votre serveur ni par aucun mot de passe**.

La migration `002` ferme cette porte : sécurité au niveau des lignes activée
sans aucune politique — ce qui, en PostgreSQL, signifie « tout est refusé » — et
retrait explicite des droits aux rôles publics de Supabase. Une protection
supplémentaire fait que toute table créée plus tard sera fermée elle aussi, au
lieu de rouvrir la porte en silence.

**Cette migration n'a d'effet qu'une fois exécutée.** Tant qu'elle ne l'est pas,
la base est publiquement lisible.

---

## Vérifications effectuées

| Contrôle | Résultat |
|---|---|
| Compilation du serveur | aucune erreur |
| Tests du serveur | **96 / 96** |
| Compilation de l'application | aucune erreur |
| Tests de l'application | **35 / 35** |
| Fabrication de l'interface | réussie |
| Fuite d'information sur l'existence d'un compte | testée, aucune |
| `password_hash` dans une réponse d'API | testé, jamais |
| Compte suspendu en cours de session | testé, accès coupé |

Les tests tournent **sans base de données** : la couche d'accès aux données est
simulée. C'est ce qui permet de vérifier la logique dès maintenant, mais cela
laisse un angle mort assumé — voir plus bas.

---

## Défauts trouvés et corrigés pendant la vague

Les agents se sont mutuellement corrigés sur trois points qui auraient été des
bugs réels en production :

1. **Rafraîchissements simultanés.** Quand plusieurs écrans se rechargent en même
   temps et que la session vient d'expirer, l'application envoyait plusieurs
   demandes de renouvellement à la fois. Le serveur y voyait une réutilisation de
   jeton — donc un vol — et fermait toutes les sessions. **L'application
   n'envoie plus qu'une seule demande**, les autres attendent son résultat.

2. **Détection de vol trop brutale.** Après un changement de mot de passe, un
   second poste resté ouvert ailleurs était pris pour un voleur, ce qui faisait
   tomber **aussi** la session en cours. Chaque révocation enregistre désormais
   son motif, et seule la vraie signature d'un vol déclenche l'alerte.

3. **Verrouillage transformé en détecteur de comptes.** Répondre « trop de
   tentatives » dès le 5ᵉ échec révélait qu'un compte existait, puisqu'un e-mail
   inconnu ne se verrouille jamais. La réponse a été décalée d'une tentative.

---

## Ce qui reste avant de considérer la vague livrée

1. **Exécuter les migrations sur Supabase.** Rien ne fonctionne réellement tant
   que les tables n'existent pas — et la migration de fermeture doit être
   appliquée sans attendre.
2. **Créer votre compte propriétaire** avec la commande ci-dessus.
3. **Vérifier le parcours complet en conditions réelles** : connexion, mot de
   passe changé, compte suspendu, compte réactivé.
4. **Brancher le stockage sécurisé du jeton** côté application (trousseau
   Windows). Sans lui, tout fonctionne, mais le client devra ressaisir son mot
   de passe à chaque lancement du logiciel — ce qui n'est pas acceptable pour un
   logiciel installé. Cela demande la chaîne Rust, absente de ce poste. Tout le
   reste du code est prêt : un seul drapeau à basculer, aucun autre fichier à
   changer.

L'angle mort assumé : les tests simulent la base. Ils prouvent que la logique est
juste, pas que le SQL s'exécute correctement. Le point 3 lève cette réserve.
