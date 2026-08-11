# Vague 3 — Rapports PDF et dashboard administrateur · Compte rendu

**Objectif du cahier des charges :** « Le propriétaire peut créer et gérer des
comptes. Le client peut générer un PDF. »

**Statut : atteint, et vérifié contre la vraie base Supabase (24 contrôles, 0 échec).**

---

## Ce que vous pouvez faire maintenant

Vous ouvrez votre **dashboard** sur `http://localhost:5174`. Vous y créez un
compte pour un nouveau client : le serveur tire un mot de passe temporaire,
l'affiche **une seule fois**, avec un bouton pour le copier. Vous l'envoyez par
WhatsApp avec le lien de téléchargement.

Le client se connecte, doit changer ce mot de passe, travaille. Le jour où il ne
paie plus, vous le suspendez depuis sa fiche — en indiquant un motif. **Ses
sessions ouvertes sont fermées immédiatement.** Le jour où il reprend, vous le
réactivez.

De son côté, le client ouvre un projet, lance ses calculs, et **génère son
rapport PDF** : page de garde, hypothèses retenues avec leurs unités, résultats,
avertissements métier, pagination. Le document porte une référence
(`RAP-2026-0002`) qu'il pourra citer à son propre client.

---

## Ce qui protège votre affaire

| Garde-fou | Pourquoi il existe |
|---|---|
| **Vous ne pouvez pas vous suspendre vous-même** ni retirer votre propre rôle | Sans inscription libre, vous seriez enfermé dehors sans recours |
| **Le dernier administrateur actif ne peut pas être suspendu**, même par deux actions simultanées | Le produit ne doit jamais se retrouver sans administrateur |
| **Le mot de passe temporaire n'existe en clair qu'une fois**, dans la réponse HTTP | Vérifié en base : il n'apparaît dans aucun journal, sous aucune forme |
| **Une route d'administration appelée par un client renvoie 404** | Un 403 lui apprendrait que ces routes existent |
| **Un client ne peut pas télécharger le rapport d'un autre** | Vérifié avec deux comptes réels : 404 des deux côtés |
| **Le dashboard ne donne accès à aucun projet ni calcul** | La confidentialité des études de vos clients est un argument commercial |
| **La base refuse de supprimer un administrateur qui a laissé des traces** | La piste d'audit prime sur le ménage. Découvert en essayant : c'est le comportement voulu |

---

## Le rapport PDF

Généré **côté serveur** avec `pdfkit` — pas de navigateur à embarquer, donc un
serveur léger, déployable partout.

Le document contient, dans cet ordre : page de garde (projet, client final,
localisation, date, référence, auteur), encadré des **avertissements métier**,
hypothèses retenues avec leurs unités, résultats par module, et en pied de page
la version du moteur de calcul et la pagination.

**Les avertissements ne sont jamais omis** du document, même quand ils sont
gênants. C'est exactement ce qui distingue ce logiciel du tableur qu'il
remplace : le tableur laisse passer une vitesse hors plage en silence.

**Aucune formule n'apparaît** dans le document (décision D-007), mais les
**hypothèses de calcul** y figurent, y compris la rugosité retenue (décision
D-012) : une note de calcul qui tait ses hypothèses n'est pas défendable devant
un confrère.

**Le document est figé sur disque**, pas régénéré à la demande. Une référence
déjà imprimée et remise à un client ne doit jamais désigner un document
différent. Conséquence : **`backend/storage/` fait partie des données à
sauvegarder**, au même titre que la base.

---

## Vérifications

### Tests automatiques — 570 au total

| Suite | Nombre |
|---|---|
| Backend | **498** |
| Application cliente | **54** |
| Dashboard administrateur | **18** |

### Vérification contre la vraie base — 24 contrôles, 0 échec

Chaîne complète rejouée sur le projet Supabase réel, avec trois comptes
distincts : création d'un compte par l'administrateur → connexion du client →
changement de mot de passe imposé → projet → calcul archivé → **rapport PDF de
4 861 octets, réellement téléchargé** → tentative d'accès par un autre client
(404) → suspension (session coupée dans la seconde) → réactivation.

---

## Défauts trouvés et corrigés pendant la vague

1. **Un 404 qui trahissait ce qu'il devait cacher.** Le refus servi aux comptes
   non-administrateurs construisait son message avec un chemin relatif au point
   de montage : le client recevait `/users` là où toute autre erreur renvoie le
   chemin complet. La forme même de la réponse révélait l'existence d'un
   routeur d'administration.
2. **Un document de 4 pages en produisait 12.** Le pied de page était dessiné
   sous la marge basse, ce qui déclenchait le saut de page automatique de la
   bibliothèque PDF. Huit pages quasi vides, invisibles tant qu'on ne les
   compte pas.
3. **Les notes s'effaçaient pendant la frappe.** La fenêtre de génération se
   réinitialisait à chaque rafraîchissement de l'historique en arrière-plan —
   et le verrou anti-double-clic sautait avec.
4. **Le filet anti-fuite des journaux ne parlait pas français.** Il surveillait
   `password` et `token`, pas `motDePasse` ni `jeton`, dans un projet
   entièrement écrit en français.

---

## Réserves

1. **Aucune des interfaces n'a été essayée à la main**, écran par écran. Les
   tests couvrent le comportement ; ils ne remplacent pas un essai par un
   praticien. C'est la première chose à faire avant la Vague 4.
2. **Le rendu du PDF n'a pas été jugé à l'œil.** Il est correct
   structurellement — pages, tableaux, accents vérifiés en extrayant le texte —
   mais sa mise en page mérite un regard humain avant d'être remise à un client
   final.
3. **Pas de liste globale des rapports** : ils se consultent projet par projet.
   Une liste transversale demanderait une décision produit et une route
   supplémentaire.
4. **D-011 reste ouvert** : les durcissements de sécurité reportés — dont la
   réinitialisation du mot de passe de la base Supabase — sont à reprendre en
   Vague 5.
