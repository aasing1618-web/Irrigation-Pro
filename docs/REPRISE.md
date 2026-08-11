# Où reprendre — état au 2026-08-11

Note de reprise, tenue à jour. À lire en premier avant de continuer le travail.

---

## État général

| Vague | État |
|---|---|
| 0 — Fondations | ✅ Livrée |
| 1 — Connexion et comptes | ✅ Livrée, **vérifiée sur la vraie base** (16 contrôles) |
| 2 — Projets et calculs | ✅ Livrée, **vérifiée sur la vraie base** (21 contrôles) |
| 3 — Rapports PDF et dashboard admin | ✅ Livrée, **vérifiée sur la vraie base** (24 contrôles) |
| 4 — Finitions | 🚧 **C'est ici qu'on reprend** |
| 5 — Sécurité et tests finaux | ⬜ Non commencée |

**570 tests au vert** : 498 backend, 54 application cliente, 18 dashboard.
Dépôt à jour sur `github.com/aasing1618-web/Irrigation-Pro`, branche `main`.

---

## Ce qui fonctionne aujourd'hui

- Base **Supabase** branchée (pooler IPv4, TLS vérifié par le certificat racine
  de Supabase versionné dans le dépôt). Trois migrations appliquées, verrouillage
  RLS actif : l'API REST publique de Supabase ne peut rien lire.
- **Authentification** complète : mot de passe temporaire à changer, statut
  ACTIF/SUSPENDU, suspension effective en moins de 15 minutes, verrouillage
  anti-force-brute, journal d'activité sans aucun secret.
- **14 modules de calcul** portés des deux classeurs Excel, dont les 16 cas de
  référence sont reproduits à 1e-6 près.
- **Projets** avec isolation stricte entre clients, prouvée sur la vraie base.
- **Rapports PDF** générés côté serveur, figés sur disque, téléchargeables.
- **Dashboard administrateur** (port 5174) : création, suspension, réactivation,
  réinitialisation de mot de passe, journal d'activité.

Compte propriétaire : `otaziznoblees@gmail.com`.

---

## Vague 4 — ce qu'il reste à faire

D'après `CLAUDE.md` :

1. **Bouton WhatsApp** dans l'application cliente — lien `wa.me/221778608247`
   avec message pré-rempli portant le nom du client. **Pas d'API WhatsApp.**
   L'emplacement est déjà prévu dans le dashboard, côté création de compte.
2. **Affichage de la version** — déjà fait dans les deux interfaces, à vérifier.
3. **Détection d'une nouvelle version disponible**, notification discrète.
4. **Site vitrine public** (`site/`, dossier vide) : présentation du produit et
   bouton WhatsApp. **Ce n'est pas une boutique** — ni panier, ni prix affiché.
5. **La décision reportée : application installée ou web ?** Tout le code
   fonctionne dans les deux cas. Seul le rangement sécurisé du jeton de session
   est spécifique au bureau, et demande la chaîne Rust.

---

## À faire avant de considérer le produit présentable

- **Essayer les interfaces à la main**, écran par écran. Les tests couvrent le
  comportement, pas l'ergonomie ni le confort d'usage.
- **Regarder un vrai PDF** : sa mise en page mérite un jugement humain avant
  d'être remise à un client final.
- **Fournir une icône** (PNG carré 1024×1024).
- **Renseigner le vrai nom** du compte propriétaire (« Propriétaire » pour
  l'instant).

---

## Documents de référence

| Document | Rôle |
|---|---|
| `CLAUDE.md` | Cahier des charges produit — fait foi |
| `docs/DECISIONS.md` | 13 décisions d'architecture justifiées, dont **D-011** (durcissements reportés) et **D-012** (ce qui est protégé) |
| `docs/API-VAGUE-1.md` à `API-VAGUE-3.md` | Contrats d'API, écrits avant chaque vague |
| `docs/MOTEUR-GRAVITAIRE.md` / `MOTEUR-SOUS-PRESSION.md` | Spécification du moteur de calcul |
| `docs/VAGUE-0.md` à `VAGUE-3.md` | Comptes rendus de livraison |
| `docs/DEMARRAGE-SUPABASE.md` | Comment brancher la base |

---

## Méthode qui a fait ses preuves

1. Le lead écrit le **contrat d'API** de la vague **avant** de lancer les agents.
   C'est ce qui leur permet de travailler en parallèle sans se contredire.
2. Les agents travaillent sur des **périmètres de fichiers disjoints**.
3. Une fois les tests simulés au vert, **on vérifie la vague contre la vraie
   base** avec un script jetable. Cela a trouvé, à chaque vague, des défauts que
   les simulations ne pouvaient pas voir.
4. **Deux agents en parallèle au maximum** : trois ont été coupés deux fois par
   des limites d'usage.
