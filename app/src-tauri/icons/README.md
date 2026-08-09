# Icônes de l'application

Ce dossier doit contenir l'icône d'Irrigation Pro, dans les formats attendus
par l'installateur Windows. **Les fichiers ne sont pas encore fournis** : il
faut un visuel définitif validé par le propriétaire du produit.

Tant que ce dossier est vide, `npm run tauri:build` échouera avec une erreur
d'icône manquante. Le développement de l'interface (`npm run dev`) n'est pas
concerné.

## Ce qu'il faut fournir

Un seul fichier source suffit : **`icon.png`, carré, 1024 × 1024 pixels, avec
fond transparent**. Tauri en dérive automatiquement tous les autres formats.

Placez ce fichier n'importe où, puis lancez depuis le dossier `app/` :

```bash
npm run tauri icon chemin/vers/icon.png
```

La commande remplit ce dossier avec :

| Fichier | Usage |
|---|---|
| `32x32.png` | Petite icône (barre des tâches, listes) |
| `128x128.png` | Icône standard |
| `128x128@2x.png` | Écrans à haute densité de pixels |
| `icon.ico` | Icône Windows (exécutable et installateur) |
| `icon.png` | Source conservée |

Ces quatre premiers fichiers sont ceux déclarés dans `tauri.conf.json`.

## Conseils pour le visuel

- Le logiciel utilise déjà une marque dessinée dans l'interface : une goutte
  posée sur des lignes d'écoulement (voir `app/src/components/icons.tsx`,
  composant `BrandMark`). L'icône devrait reprendre ce motif.
- Couleur de fond recommandée : le bleu-vert profond du produit, `#0B2229`.
- Couleur du motif : `#74B4B8`.
- Prévoir une marge intérieure d'environ 12 % : Windows arrondit et recadre
  les icônes dans certains contextes.
- Éviter le texte : à 32 × 32 pixels, il devient illisible.
