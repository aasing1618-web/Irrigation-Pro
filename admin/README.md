# Dashboard d'administration — Irrigation Pro

## À quoi sert ce dossier

C'est **votre** outil, à vous seul, le propriétaire d'Irrigation Pro. Vos clients
ne le voient jamais et ne peuvent pas y entrer.

Vous y faites quatre choses, et uniquement celles-là :

1. **créer le compte** d'un nouveau client, une fois le paiement reçu ;
2. **suspendre** un compte quand un client ne paie plus — il ne peut alors plus
   ouvrir le logiciel ;
3. **réactiver** un compte quand il reprend ;
4. **réinitialiser un mot de passe** quand un client a perdu le sien.

C'est votre seul levier commercial : il n'y a ni paiement automatique, ni clé de
licence, ni date d'expiration dans Irrigation Pro. Un compte est actif tant que
vous le laissez actif.

## ⚠ Le mot de passe temporaire ne s'affiche qu'une fois

Quand vous créez un compte (ou que vous réinitialisez un mot de passe), le
serveur tire un mot de passe temporaire et vous l'affiche **une seule fois**,
dans une fenêtre qui s'ouvre juste après.

**Il n'est enregistré nulle part** — pas même sur le serveur, qui n'en garde
qu'une empreinte illisible. Personne, pas même vous, ne peut le retrouver
ensuite. C'est ce qui garantit que vous ne connaissez pas les mots de passe de
vos clients.

Donc : **copiez-le avant de fermer la fenêtre.** Le bouton « Copier » est là pour
ça, et la fenêtre refuse de se fermer tant que vous n'avez pas coché la case de
confirmation.

Si vous le perdez malgré tout, rien n'est cassé : ouvrez la fiche du compte et
cliquez sur « Réinitialiser le mot de passe ». Un nouveau sera tiré — mais votre
client devra être prévenu, car son ancien mot de passe cessera de fonctionner.

## Ce que ce dashboard ne fait pas — et ne fera pas

**Vous n'avez accès à aucun projet, calcul ou rapport de vos clients.** Ce n'est
pas un oubli : c'est une décision. Le serveur ne propose même pas de moyen de les
consulter. La confidentialité des études de vos clients est un argument
commercial que vous pouvez leur donner sans réserve.

Le dashboard gère des comptes. Rien d'autre.

## Comment le lancer

Il vous faut le serveur Irrigation Pro démarré (dossier `backend/`).

La première fois seulement, depuis ce dossier `admin/` :

```bash
npm install
cp .env.example .env
```

Puis, à chaque fois :

```bash
npm run dev
```

Ouvrez ensuite <http://localhost:5174> dans votre navigateur et connectez-vous
avec votre compte administrateur.

> Le port **5174** est imposé : c'est cette adresse exacte qui est autorisée par
> le serveur. Si elle est déjà occupée, le démarrage échoue au lieu de glisser
> sur un autre port où plus rien ne fonctionnerait.

### Les autres commandes

| Commande | Ce qu'elle fait |
|---|---|
| `npm run dev` | Lance le dashboard sur votre machine, pour travailler |
| `npm run build` | Fabrique la version à installer sur un serveur |
| `npm test` | Vérifie que tout fonctionne encore |
| `npm run typecheck` | Contrôle le code sans rien fabriquer |

## Deux choses à savoir avant de l'utiliser

**Fermer l'onglet vous déconnecte.** C'est volontaire : ce dashboard ouvre
l'accès à tous les comptes du produit, et rien de ce qui permet de s'y connecter
n'est conservé sur votre ordinateur. Il n'y a donc rien à voler sur votre disque.
Rouvrir l'onglet demande une nouvelle connexion — c'est une gêne assumée.

**Un compte client ne peut pas entrer ici.** Si l'un d'eux essaie avec ses
identifiants habituels, le dashboard le lui dit clairement et referme aussitôt sa
session. Il n'aperçoit rien de cet écran.

## Pour votre installateur

Le dashboard refuse de démarrer si l'adresse du serveur (`VITE_API_URL`, dans le
fichier `.env`) ne commence pas par `https://`, sauf en développement sur votre
propre machine. Ce sont vos identifiants, les adresses e-mail de vos clients et
les mots de passe temporaires que vous venez de tirer qui circulent sur ce lien :
il n'y a pas de tolérance là-dessus.
