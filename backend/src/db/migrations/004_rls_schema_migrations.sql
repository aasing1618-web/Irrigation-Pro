-- =====================================================================
--  Irrigation Pro — Migration 004 : verrouillage de `schema_migrations`
--  (dernier point code de D-011, cf. docs/DECISIONS.md)
-- =====================================================================
--
--  ┌───────────────────────────────────────────────────────────────────┐
--  │  CE QUI MANQUAIT                                                   │
--  └───────────────────────────────────────────────────────────────────┘
--
--  La migration 002 a verrouillé les sept tables du produit : RLS activée
--  sans aucune politique, et privilèges retirés à `anon` et
--  `authenticated`. L'API REST publique de Supabase ne peut donc rien y
--  lire.
--
--  Une table est passée entre les mailles : `schema_migrations`. Et pour
--  une raison logique — c'est le lanceur de migrations qui la crée, à un
--  moment où la migration 002 n'existe pas encore. Elle n'a jamais fait
--  partie de la liste.
--
--  ┌───────────────────────────────────────────────────────────────────┐
--  │  CE QUE CETTE TABLE RÉVÉLERAIT                                     │
--  └───────────────────────────────────────────────────────────────────┘
--
--  Rien de secret au sens strict : des noms de migrations et des dates.
--  Mais ces noms décrivent l'architecture interne (« verrouillage_supabase »,
--  « motif_revocation »), et les dates disent quand le produit a été
--  déployé et à quel rythme il change. C'est de la reconnaissance
--  gratuite offerte à qui cherche par où entrer.
--
--  ┌───────────────────────────────────────────────────────────────────┐
--  │  POURQUOI CETTE MIGRATION MALGRÉ TOUT UTILE                        │
--  └───────────────────────────────────────────────────────────────────┘
--
--  Vérification faite sur la base réelle : `anon` reçoit déjà
--  « permission denied for table schema_migrations ». Les privilèges par
--  défaut retirés en 002 la couvrent donc en pratique.
--
--  Ce n'est pas une raison de s'en passer. Un `GRANT` posé un jour à la
--  main, ou un changement de valeurs par défaut chez Supabase, suffirait à
--  rouvrir la lecture — et personne ne s'en apercevrait. RLS activée sans
--  aucune politique ferme la porte une seconde fois, indépendamment des
--  privilèges. Deux verrous valent mieux qu'un sur une porte qu'on
--  n'ouvre jamais.
--
--  Le rôle utilisé par l'application n'est concerné ni par l'un ni par
--  l'autre : il est propriétaire des tables, et le lanceur de migrations
--  continue donc de lire et d'écrire normalement.
-- =====================================================================

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- Aucune politique n'est créée, et c'est volontaire : sans politique, RLS
-- refuse tout. C'est exactement le comportement voulu pour une table que
-- seul le serveur doit toucher.

REVOKE ALL ON public.schema_migrations FROM anon, authenticated;

COMMENT ON TABLE public.schema_migrations IS
  'Journal des migrations appliquées. Verrouillée : RLS active sans politique, '
  'et aucun privilège pour anon/authenticated. Seul le serveur y accède.';
