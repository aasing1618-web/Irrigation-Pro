# Exploiter Antigravity sur Irrigation Pro

Comment répartir le travail entre **Claude Code** (qui a construit le produit) et
**Antigravity** (l'IDE agentique de Google), sans que les deux se marchent
dessus ni se contredisent.

---

## 1. Le principe : ils ne savent pas faire la même chose

Ce projet a une faiblesse **documentée depuis la Vague 1**, et elle revient dans
chaque compte rendu :

> « Aucune des interfaces n'a été essayée à la main, écran par écran. Les tests
> couvrent le comportement ; ils ne remplacent pas un essai par un praticien. »
> — `docs/VAGUE-3.md`

C'est exactement le trou qu'Antigravity comble. Il **pilote un vrai navigateur** :
il clique, remplit, navigue, prend des captures et enregistre ce qu'il fait.
Là où 570 tests prouvent qu'une fonction renvoie la bonne valeur, Antigravity
peut dire *« le bouton est illisible sur fond sombre »* ou *« l'écran saute
pendant une seconde au chargement »*.

| | Claude Code | Antigravity |
|---|---|---|
| Écrire le moteur de calcul, l'authentification, les migrations | ✅ c'est déjà fait, et testé | ⚠️ à éviter — voir §5 |
| Vérifier une formule contre ses cas de référence | ✅ | ❌ |
| **Regarder l'interface et juger si elle est bien** | ❌ aveugle | ✅ **son vrai avantage** |
| **Juger la mise en page d'un PDF** | ❌ | ✅ |
| **Reproduire un bug décrit à l'oral** | ⚠️ par déduction | ✅ en le rejouant |
| Déployer, brancher un domaine, régler un hébergeur | ⚠️ en aveugle | ✅ il voit les consoles web |
| Relire le travail de l'autre | ✅ | ✅ — **et c'est précieux** |

**La règle simple : Claude Code écrit et prouve, Antigravity regarde et
déploie.** Un deuxième regard sur du code déjà écrit ne coûte rien et trouve
parfois ce qu'un seul modèle ne voit pas.

---

## 2. Préparer Antigravity — cinq minutes, une fois

1. **Ouvrir le dossier du projet**, pas un sous-dossier : Antigravity doit voir
   `backend/`, `app/`, `admin/`, `site/` ensemble.
2. **Lui donner la constitution.** Le fichier `AGENTS.md` est à la racine et
   contient les interdits, les règles de sécurité et la façon de travailler.
   S'il ne le lit pas tout seul, commencer chaque session par :

   > « Lis `AGENTS.md` et `docs/REPRISE.md` avant toute chose, et respecte-les. »

3. **Le connecter à Supabase en lecture seule.** Il y a déjà un lien Supabase.
   Vérifier qu'il est en **read-only** : un agent qui peut écrire dans la base
   peut effacer les projets d'un client. La base ne se modifie que par une
   migration numérotée, jamais à la main.
4. **Ne jamais lui donner les secrets de production.** Ni `JWT_SECRET`, ni le
   mot de passe Supabase. Les variables d'environnement se posent chez
   l'hébergeur, à la main.

---

## 3. Les quatre usages qui rapportent vraiment

### Usage nº 1 — La revue d'interface, écran par écran ⭐ le plus rentable

Démarrer d'abord les trois serveurs :

```bash
cd backend && npm run dev      # port 4000
cd app     && npm run dev      # port 5173
cd admin   && npm run dev      # port 5174
```

Puis coller ceci à Antigravity :

> Tu es testeur d'interface pour un logiciel professionnel destiné à des
> ingénieurs en irrigation. Le serveur tourne sur `localhost:4000`,
> l'application sur `localhost:5173`.
>
> Parcours l'application dans le navigateur, écran par écran, et **prends une
> capture à chaque étape** : connexion, changement de mot de passe imposé,
> tableau de bord, création d'un projet, lancement d'un calcul, consultation des
> résultats, génération d'un rapport, paramètres.
>
> À chaque écran, dis-moi : ce qui est confus, ce qui est mal aligné, ce qui est
> illisible, ce qui met trop de temps, ce qui manque, ce qui ne ressemble pas à
> un logiciel professionnel payant. Vérifie aussi en fenêtre étroite (1280 px)
> et en mode sombre si le système le propose.
>
> **Ne corrige rien.** Fais-moi la liste, classée du plus gênant au moins gênant,
> avec une capture par point. Tu es là pour voir, pas pour réparer.

L'interdiction de corriger est délibérée : on veut d'abord un **diagnostic**.
Les corrections se décident ensuite, une par une.

### Usage nº 2 — Le jugement du PDF

Le rapport PDF est le document que le client remet à **son propre** client.
C'est lui qui porte la réputation du produit, et sa mise en page n'a jamais été
jugée à l'œil.

> Ouvre le fichier PDF le plus récent dans `backend/storage/` et regarde-le
> comme le ferait un ingénieur qui doit le remettre à son client.
>
> Juge : la page de garde, la hiérarchie des titres, la lisibilité des tableaux,
> les marges, les coupures de page, la place des avertissements, le pied de page.
> Y a-t-il une page presque vide ? Un tableau coupé au mauvais endroit ? Un
> accent mal rendu ?
>
> Dis-moi ce que tu changerais et pourquoi. Ne modifie pas le code.

### Usage nº 3 — Le déploiement

C'est là qu'Antigravity est le plus utile après la revue d'interface : il voit
les consoles web des hébergeurs, sait suivre une documentation en ligne et
lire un journal de build qui échoue.

> Lis `docs/DEPLOIEMENT.md`. Nous déployons Irrigation Pro selon la topologie
> « une seule origine » qui y est décrite.
>
> Prépare tout ce qui est préparable **sans secret** : le `Dockerfile` ou le
> fichier de configuration de l'hébergeur, le service statique servi par Express
> avec repli sur `index.html`, le script de build, la vérification que
> `/health` répond.
>
> **Attention au point critique du document** : le cookie de session est
> `SameSite=Strict`. Si l'interface et l'API ne partagent pas le même domaine,
> le client ne restera jamais connecté. Vérifie-le explicitement avant de
> déclarer que ça marche.
>
> Les variables d'environnement de production, c'est moi qui les pose. Ne me
> demande aucun secret et n'en écris aucun dans le dépôt.

### Usage nº 4 — Le deuxième regard sur la sécurité

Avant la Vague 5, faire relire le code par un autre modèle a une vraie valeur :
il n'a pas les mêmes angles morts.

> Lis `AGENTS.md`, section « Les règles de sécurité qui ne se négocient pas ».
>
> Relis le backend et cherche **une seule chose** : un endroit où l'une de ces
> cinq règles est violée. Un accès à une ressource sans vérification du
> propriétaire, un 403 là où il faut un 404, une différence de message ou de
> durée entre e-mail inconnu et mot de passe faux, un secret qui pourrait
> atterrir dans un journal, une formule de calcul exposée au navigateur.
>
> Pour chaque point : le fichier, la ligne, et **comment un attaquant
> l'exploiterait concrètement**. Si tu ne trouves rien, dis-le — ne remplis pas
> la liste pour avoir l'air utile. Ne corrige rien.

---

## 4. Comment enchaîner les deux outils sans se contredire

```
1. Antigravity regarde        → produit une liste de défauts, avec captures
2. Tu tries la liste          → « ça oui, ça non, ça plus tard »
3. Claude Code corrige        → il connaît les contrats et les 570 tests
4. Antigravity revérifie      → il rouvre les mêmes écrans et compare
```

Deux règles pour que ça tienne :

- **Un seul outil écrit à la fois dans le même dossier.** Deux agents sur
  `app/src/` en même temps, c'est un conflit garanti.
- **`git commit` entre chaque passage.** C'est le point de reprise si l'un des
  deux part de travers. Et `git diff` permet de voir exactement ce qu'un agent a
  touché avant d'accepter son travail.

---

## 5. Ce qu'il vaut mieux ne pas lui confier

Ce ne sont pas des interdits absolus, mais des endroits où le rapport
bénéfice/risque est mauvais :

- **`backend/src/engine/`** — les 14 modules de calcul reproduisent 16 cas de
  référence chiffrés à 1e-6 près. Une réécriture « plus propre » casse le
  produit **sans faire échouer visiblement quoi que ce soit** si les tests ne
  sont pas relancés. C'est la valeur commerciale du logiciel.
- **`backend/src/db/migrations/`** — une migration déjà appliquée ne se modifie
  jamais. On en ajoute une nouvelle.
- **L'authentification** (`backend/src/auth/`) — elle est subtile : rotation des
  jetons, détection de réutilisation, verrouillage progressif, égalité des
  temps de réponse. Chaque détail a une raison écrite dans `docs/DECISIONS.md`.
- **Toute suppression de test.** Un test qui gêne signale un défaut dans le
  code, pas un test à retirer.

---

## 6. Le réflexe à garder

Antigravity produit des comptes rendus soignés, avec captures et plans. C'est
agréable à lire, et c'est précisément pour cela qu'il faut garder le réflexe :

**la seule preuve qu'une chose marche, c'est de la voir marcher.**

Avant d'accepter un travail, quel que soit l'outil qui l'a produit :

```bash
git diff                    # qu'est-ce qui a réellement changé ?
npm test                    # dans chaque dossier touché
```

C'est cette discipline qui a trouvé, à chaque vague de ce projet, des défauts
que les tests simulés ne pouvaient pas voir.
