# `site/` — le site vitrine public

Une page, statique, qui présente Irrigation Pro et met le visiteur en relation
avec le propriétaire sur WhatsApp. **Ce n'est pas une boutique.**

Cahier des charges : `CLAUDE.md` (Vague 4) et `docs/API-VAGUE-4.md` § 5.

---

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5175
npm run typecheck
npm test
npm run build      # produit dist/, déployable tel quel
npm run preview
```

Aucune variable d'environnement n'est nécessaire. `VITE_WHATSAPP_NUMBER`
existe pour changer le numéro sans toucher au code ; sans elle, le numéro du
propriétaire est utilisé.

---

## Ce que la page contient

| Section | Contenu |
|---|---|
| Ouverture | Ce qu'est le produit, pour qui, et la chaîne de calcul en schéma |
| Ce que le classeur ne fait pas | Comparaison en deux colonnes avec un tableur |
| Pour qui | Ingénieurs agronomes, bureaux d'études, installateurs |
| Modules de calcul | Les quatorze modules réellement disponibles, par famille |
| Le rapport PDF | Ce que contient le document produit, dans l'ordre |
| Comment obtenir un accès | Les quatre étapes, dont aucune n'est automatisée |
| Appel final et pied de page | Le lien WhatsApp, et la version du site |

Le contenu éditorial vit dans **`src/contenu.ts`**, séparé de la mise en page :
une formulation se corrige là, sans ouvrir un composant. Chaque liste y cite sa
source dans le dépôt.

---

## Les règles que ce site respecte

Elles viennent du cahier des charges, et elles sont **vérifiées par les tests**
(`tests/page.test.tsx`), pas seulement promises :

- Aucun prix, aucun panier, aucun paiement, aucune inscription en ligne.
- Aucun formulaire, aucun champ de saisie — pas même une adresse e-mail.
- Aucune ressource chargée depuis un tiers : ni police, ni image, ni script,
  ni mesure d'audience. La politique de sécurité d'`index.html` l'interdit, et
  un test relit le fichier pour s'en assurer.
- Aucun appel réseau au rendu.
- Aucun témoignage, aucun chiffre de notoriété, aucune capture d'écran
  fabriquée. Les quatorze modules annoncés sont ceux du registre du moteur.
- Un seul appel à l'action : `wa.me/221778608247`, avec le message pré-rempli
  du contrat de la Vague 4.

---

## Identité visuelle

`src/styles/index.css` reprend **à l'identique** les jetons de design de
`app/src/styles/index.css` et `admin/src/styles/index.css` : mêmes couleurs,
mêmes rayons, mêmes ombres, même famille typographique. Le seul ajout, isolé et
commenté en fin de bloc `@theme`, est une échelle de titres plus large — une
page publique se lit à distance, une interface métier à 50 cm.

Toute retouche de l'identité visuelle se fait dans les trois fichiers, ou dans
aucun.
