-- =====================================================================
--  Irrigation Pro — Migration 002 : verrouillage de l'API publique Supabase
--  (cf. docs/DECISIONS.md, D-009)
-- =====================================================================
--
--  ┌───────────────────────────────────────────────────────────────────┐
--  │  LE RISQUE QUE CETTE MIGRATION SUPPRIME                            │
--  └───────────────────────────────────────────────────────────────────┘
--
--  Supabase ne fait pas qu'héberger PostgreSQL : il publie AUTOMATIQUEMENT
--  une API REST (PostgREST) sur toutes les tables du schéma `public`.
--  Cette API s'utilise avec la clé dite « anon », qui est PUBLIQUE PAR
--  CONCEPTION — elle est faite pour être distribuée, et elle figure dans
--  l'URL du projet.
--
--  Conséquence, sans la présente migration : n'importe qui connaissant
--  l'adresse du projet Supabase pourrait exécuter, depuis son navigateur,
--
--      GET https://<projet>.supabase.co/rest/v1/users?select=*
--
--  et obtenir la liste de nos comptes clients (adresses e-mail, noms,
--  entreprises, empreintes de mots de passe) et de leurs projets —
--  SANS PASSER PAR NOTRE SERVEUR, donc sans authentification, sans
--  journalisation, et sans qu'aucun contrôle du backend ne s'applique.
--
--  Toute la sécurité du produit repose sur le fait que notre API est le
--  SEUL chemin d'accès aux données (cf. D-007). Cette migration referme
--  l'autre porte.
--
--  ┌───────────────────────────────────────────────────────────────────┐
--  │  CE QU'ELLE FAIT, EN DEUX PHRASES                                  │
--  └───────────────────────────────────────────────────────────────────┘
--
--  1. Elle active `ROW LEVEL SECURITY` sur les sept tables SANS CRÉER
--     AUCUNE POLITIQUE. En PostgreSQL, une table dont RLS est activé mais
--     qui n'a aucune politique refuse TOUT à tout le monde, sauf à son
--     propriétaire et aux rôles disposant de l'attribut `BYPASSRLS`.
--     Les rôles `anon` et `authenticated` de Supabase ne voient donc plus
--     rien du tout.
--
--  2. Elle retire en plus, explicitement, tous les droits SQL de ces deux
--     rôles sur nos tables et nos séquences (ceinture et bretelles), et
--     fait de même pour les tables que nous créerons plus tard.
--
--  Notre backend, lui, se connecte avec le rôle PROPRIÉTAIRE des tables :
--  son accès est strictement inchangé (voir la note sur FORCE plus bas).
--
--  ┌───────────────────────────────────────────────────────────────────┐
--  │  POURQUOI PAS DE VRAIES POLITIQUES RLS ?                           │
--  └───────────────────────────────────────────────────────────────────┘
--
--  Parce que l'isolation entre clients est déjà assurée dans le backend
--  (filtrage systématique par `owner_id`, cf. repositories/projects.repo.ts).
--  Écrire un second système d'autorisation dans la base créerait deux
--  sources de vérité à maintenir d'accord, et la moindre divergence entre
--  les deux serait une faille. RLS est utilisé ici comme un VERROU DE
--  FERMETURE, pas comme un mécanisme d'autorisation.
--
--  ┌───────────────────────────────────────────────────────────────────┐
--  │  COMPATIBILITÉ HORS SUPABASE                                       │
--  └───────────────────────────────────────────────────────────────────┘
--
--  Les rôles `anon` et `authenticated` sont propres à Supabase. Sur un
--  PostgreSQL ordinaire ils n'existent pas, et un `REVOKE … FROM anon`
--  échouerait avec « role "anon" does not exist », faisant échouer toute
--  la migration. Le bloc `DO $$ … $$` plus bas teste donc leur présence
--  dans `pg_roles` avant d'agir : hors Supabase, ces étapes sont
--  simplement ignorées et la migration reste applicable.
--
--  ⚠ Ce fichier est exécuté par `npm run migrate` DANS UNE TRANSACTION
--    gérée par le runner : n'écrivez pas de BEGIN / COMMIT ici.
--  ⚠ Une migration déjà appliquée ne doit plus jamais être modifiée
--    (son empreinte sha256 est vérifiée). Créez un fichier 003_… à la place.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Activation de Row Level Security sur les sept tables
--
--    `ENABLE ROW LEVEL SECURITY` + aucune politique = « tout est refusé ».
--
--    Ces ordres sont idempotents : réactiver RLS sur une table où il est
--    déjà actif ne produit aucune erreur.
-- ---------------------------------------------------------------------

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;  -- comptes, empreintes de mots de passe
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;  -- empreintes de jetons de session
ALTER TABLE projects       ENABLE ROW LEVEL SECURITY;  -- projets des clients
ALTER TABLE project_data   ENABLE ROW LEVEL SECURITY;  -- résultats des calculs
ALTER TABLE reports        ENABLE ROW LEVEL SECURITY;  -- rapports PDF
ALTER TABLE activity_logs  ENABLE ROW LEVEL SECURITY;  -- journal d'activité
ALTER TABLE admin_actions  ENABLE ROW LEVEL SECURITY;  -- journal administrateur


-- ---------------------------------------------------------------------
-- 2. FORCE ROW LEVEL SECURITY — VOLONTAIREMENT NON ACTIVÉ
--
--    `ENABLE` seul laisse une exception : le PROPRIÉTAIRE de la table
--    continue de voir ses lignes. C'est exactement ce qu'il nous faut,
--    puisque notre backend se connecte précisément avec ce rôle
--    (`postgres`, celui de la chaîne de connexion Supabase, qui est aussi
--    celui qui a créé les tables via ces migrations).
--
--    `FORCE ROW LEVEL SECURITY` supprimerait cette exception et
--    appliquerait RLS AU PROPRIÉTAIRE LUI-MÊME. Comme il n'existe aucune
--    politique, le résultat serait : notre propre serveur ne pourrait plus
--    lire une seule ligne de sa propre base. Le produit serait mort.
--
--    Il existe un garde-fou (l'attribut de rôle `BYPASSRLS` l'emporte même
--    sur FORCE, et le rôle `postgres` de Supabase le possède en principe),
--    mais « en principe » ne suffit pas pour une opération qui, si elle est
--    fausse, coupe l'accès du serveur à sa propre base sans avertissement.
--    Nous ne pouvons pas le vérifier sans exécuter la migration.
--
--    DÉCISION : on n'active PAS FORCE. `ENABLE` seul atteint l'objectif de
--    D-009 — bloquer `anon` et `authenticated`, qui ne sont propriétaires
--    d'aucune de ces tables. FORCE n'apporterait rien contre la menace
--    visée ; il n'ajouterait qu'un risque d'auto-blocage.
--
--    SI, PLUS TARD, ON VEUT VRAIMENT FORCE : il faut d'abord vérifier,
--    connecté avec la chaîne de `DATABASE_URL`, que le rôle courant
--    contourne RLS :
--
--        SELECT current_user,
--               (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user)
--                   AS contourne_rls,
--               (SELECT tableowner FROM pg_tables
--                 WHERE schemaname = 'public' AND tablename = 'users')
--                   AS proprietaire_users;
--
--    Et n'activer FORCE que si `contourne_rls` vaut `true`, dans une
--    migration 003 dédiée, testée d'abord sur le projet Supabase de test.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 3. Retrait explicite des droits des rôles publics de Supabase
--
--    RLS suffirait, mais deux verrous valent mieux qu'un : si quelqu'un
--    désactivait RLS par erreur depuis le tableau de bord Supabase, les
--    droits retirés ici continueraient de protéger les données.
--
--    Le bloc ne fait rien si les rôles n'existent pas (PostgreSQL ordinaire).
-- ---------------------------------------------------------------------

DO $$
DECLARE
    role_public text;
BEGIN
    FOREACH role_public IN ARRAY ARRAY['anon', 'authenticated'] LOOP

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_public) THEN
            RAISE NOTICE
                'Rôle « % » absent : étape ignorée (base PostgreSQL ordinaire, hors Supabase).',
                role_public;
            CONTINUE;
        END IF;

        -- 3.a — Nos sept tables, nommées une par une pour que la liste soit
        --       lisible et vérifiable.
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE
                 users, refresh_tokens, projects, project_data,
                 reports, activity_logs, admin_actions
             FROM %I',
            role_public);

        -- 3.b — Filet : toute autre table du schéma `public` (dont la table
        --       technique `schema_migrations` créée par notre runner).
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
            role_public);

        -- 3.c — Les séquences. `activity_logs.id` et `admin_actions.id` sont
        --       des `bigserial` : ils s'appuient sur des séquences, qui sont
        --       des objets à part entière avec leurs propres droits. Un accès
        --       en lecture à une séquence révèle le volume d'activité.
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
            role_public);

        -- 3.d — Les tables et séquences que NOUS créerons plus tard.
        --       Supabase configure des « droits par défaut » qui accordent
        --       automatiquement l'accès à `anon` et `authenticated` sur toute
        --       nouvelle table du schéma `public`. Sans cette étape, la
        --       migration 003 qui ajouterait une table rouvrirait la porte
        --       en silence.
        --
        --       Note : `ALTER DEFAULT PRIVILEGES` sans `FOR ROLE` ne vaut que
        --       pour les objets créés par le rôle qui exécute cet ordre —
        --       c'est-à-dire le rôle qui applique les migrations, donc le bon.
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
            role_public);
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
            role_public);

        RAISE NOTICE 'Droits du rôle « % » retirés sur le schéma public.', role_public;

    END LOOP;
END
$$;


-- ---------------------------------------------------------------------
-- 4. Traces documentaires, lisibles depuis n'importe quel outil SQL
-- ---------------------------------------------------------------------

COMMENT ON TABLE users IS
    'Comptes du logiciel. Créés uniquement par l''administrateur. '
    'RLS activé sans politique (migration 002) : inaccessible via l''API REST de Supabase.';

COMMENT ON TABLE refresh_tokens IS
    'Sessions longues de l''application desktop, révocables une par une. '
    'RLS activé sans politique (migration 002).';

COMMENT ON TABLE projects IS
    'Projets d''irrigation. Cloisonnés par owner_id dans le backend. '
    'RLS activé sans politique (migration 002).';

COMMENT ON TABLE project_data IS
    'Historique des calculs lancés sur un projet. '
    'RLS activé sans politique (migration 002).';

COMMENT ON TABLE reports IS
    'Rapports PDF produits pour un projet. '
    'RLS activé sans politique (migration 002).';

COMMENT ON TABLE activity_logs IS
    'Journal des actions sensibles. Conservé même si le compte est supprimé. '
    'RLS activé sans politique (migration 002).';

COMMENT ON TABLE admin_actions IS
    'Journal des actions du propriétaire sur les comptes clients. '
    'RLS activé sans politique (migration 002).';
