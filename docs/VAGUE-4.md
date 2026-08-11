# Vague 4 — Finitions · Compte rendu

**Objectif du cahier des charges :** « L'app est présentable et prête à montrer. »

**Statut : atteint.** 646 tests verts, et **39 contrôles contre la vraie base
Supabase, 0 échec**.

---

## La décision que vous aviez réservée : ce sera le **web**

Vous aviez écrit « pour l'instant ». C'est pris au mot : **la coque Tauri reste
dans le dépôt, intacte**, et le transport de session qu'elle utilise reste le
comportement par défaut du serveur. Revenir au logiciel installé ne demanderait
aucune réécriture.

### Ce que ce choix a coûté, et pourquoi il fallait le payer

Une seule chose, mais bloquante : **dans un navigateur, appuyer sur F5 vide la
mémoire vive.** C'est là que vivait le jeton de session. Tel quel, votre client
aurait été déconnecté à chaque rechargement de page.

La correction n'est pas de ranger le jeton dans le navigateur — c'est
précisément ce qu'il ne faut pas faire, `localStorage` étant lisible par le
moindre script de la page. Le jeton part dans un **cookie que le JavaScript ne
peut pas lire** (`HttpOnly`). Le serveur seul le pose et le relit.

**Conséquence concrète pour la sécurité :** une faille dans l'interface ne donne
pas 30 jours d'accès au compte d'un client. C'est le genre de détail qui ne se
voit jamais quand il est bien fait.

Ceci amende la décision D-005b (« aucun cookie »), qui visait un logiciel
installé. Le raisonnement ne tenait plus dans un navigateur, et c'est écrit :
voir **D-013** dans `docs/DECISIONS.md`.

### ⚠️ Le piège de déploiement que cela crée

`SameSite=Strict` raisonne en **domaine**, pas en adresse. Donc :

- ✅ `app.irrigation-pro.com` + `api.irrigation-pro.com` → tout fonctionne
- ❌ `…vercel.app` + `…onrender.com` → **le client ne restera jamais connecté**

Le second cas est le piège classique de l'hébergement gratuit, et **il ne se
manifeste qu'en production**. La topologie retenue dans `docs/DEPLOIEMENT.md`
l'évite en servant l'interface et l'API depuis **une seule origine**.

---

## Ce que vous pouvez montrer maintenant

### Le bouton WhatsApp

Dans **Paramètres**, section Assistance, et en bas de la barre latérale. Le
message est pré-rempli avec le nom du client et sa structure, puis **il
s'arrête** : c'est au client d'écrire sa demande. Lui souffler ses mots
donnerait un message de robot, et vous le verriez tout de suite à la réception.

Un simple lien `wa.me`, comme le veut le cahier des charges. Aucune API, aucune
dépendance, aucun appel réseau.

### La détection de nouvelle version

Sur le web, « nouvelle version » veut dire : *l'hébergeur sert un build plus
récent que celui ouvert dans cet onglet.* La compilation dépose un petit fichier
`version.json` à côté de l'application ; l'onglet le relit au retour de
l'utilisateur, et affiche un bandeau discret **avec un bouton Recharger**.

**Jamais de rechargement automatique.** Un ingénieur en train de saisir une
étude ne doit pas voir son écran se réinitialiser sous ses doigts.

Et si le réseau est capricieux, si le fichier manque, si l'hébergeur renvoie
n'importe quoi : **rien ne s'affiche**. Une bannière qui apparaît à tort est
pire que pas de bannière — l'utilisateur apprend à l'ignorer.

### Le site vitrine

`site/`, une page unique, sobre, aux couleurs exactes du logiciel.

Elle dit ce qu'est Irrigation Pro, pour qui, ce qu'il remplace, **les 14 modules
de calcul réellement disponibles** (lus dans le code, aucun inventé), ce que
contient le rapport PDF, et comment on obtient un accès : une conversation
WhatsApp, puis vous créez le compte.

La page l'écrit franchement : **« Ce site ne vend rien et n'ouvre aucun
compte. »** C'est votre modèle commercial, autant l'assumer.

Aucun prix, aucun panier, aucun formulaire, **aucun témoignage inventé, aucun
chiffre de notoriété inventé**, et pas une seule ressource chargée depuis un
serveur tiers — donc aucun traceur.

---

## Vérifications

### Tests automatiques — 646

| Suite | Avant | Après |
|---|---|---|
| Backend | 498 | **536** |
| Application cliente | 54 | **72** |
| Dashboard administrateur | 18 | **18** |
| Site vitrine | — | **20** |

### Contre la vraie base Supabase — 39 contrôles, 0 échec

| Ce qui a été prouvé en conditions réelles |
|---|
| Le jeton de session **n'apparaît jamais** dans le JSON servi au navigateur |
| Le cookie porte bien `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`, 30 jours |
| Rejouer un cookie déjà tourné **ferme toutes les sessions** du compte |
| « Pas de session » et « session volée » renvoient **le même code et le même message** |
| La déconnexion efface le cookie **et** tue le jeton côté serveur |
| Une origine inconnue n'obtient **aucune** autorisation CORS |
| La base ne stocke que l'empreinte du jeton, jamais sa valeur |
| **Sans demande explicite, le serveur se comporte exactement comme avant** |

Cette dernière ligne est la plus importante : les 498 tests d'origine sont
passés **sans qu'une seule ligne soit retouchée**. C'est ce qui garde la porte
Tauri ouverte.

---

## Défauts trouvés et corrigés pendant la vague

1. **Un serveur périmé écoutait sur le port 4000.** Lancé cinq heures plus tôt,
   il aurait servi du vieux code à la vérification, qui aurait déclaré bon un
   travail non testé. Le même piège avait faussé une mesure en Vague 1. Le
   serveur a été remplacé par un neuf **avant** toute mesure.
2. **La politique de sécurité du site autorisait `localhost` en production.**
   Nécessaire au développement, elle partait telle quelle dans le site publié :
   une porte entrouverte sans la moindre contrepartie. Invisible, puisque le
   site fonctionne parfaitement avec. Corrigée, et **verrouillée par un test**
   pour qu'elle ne revienne pas.
3. **Le greffon de version n'était pas branché.** Écrit, commenté, mais jamais
   ajouté à la liste des greffons : `version.json` n'aurait jamais été produit,
   et la détection de mise à jour n'aurait rien détecté — en silence.

---

## Réserves

1. **Les interfaces n'ont toujours pas été essayées à la main.** C'est la
   réserve qui revient depuis la Vague 1, et elle ne se lèvera pas toute seule :
   `docs/ANTIGRAVITY.md` explique comment la traiter avec un agent qui pilote un
   vrai navigateur.
2. **Le site vitrine n'a jamais été affiché à l'écran.** Son comportement en
   téléphone et en tablette est écrit correctement mais **non confirmé
   visuellement**. À regarder en 375 px, 768 px et 1440 px.
3. **Cinq formulations du site sont à relire par vous** — elles sont de nous, pas
   de vous : les deux phrases d'accroche, la colonne « Dans un classeur » de la
   comparaison (limites génériques d'un tableur, pas des faits mesurés), la
   formulation « lien d'accès au logiciel », et l'exemple de référence de
   rapport.
4. **Le stockage des PDF reste à trancher pour le déploiement** : disque
   persistant ou Supabase Storage. Documenté dans `docs/DEPLOIEMENT.md`, pas
   implémenté — c'est une décision qui vous revient.
5. **Pas d'icône, pas d'image d'aperçu.** Elles supposent un visuel que nous
   n'avons pas à inventer à votre place.
6. **D-011 reste ouvert** : mot de passe Supabase, `JWT_SECRET`, limiteur de
   débit partagé. C'est la Vague 5, et rien de tout cela ne doit être rogné.
