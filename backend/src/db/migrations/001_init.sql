-- =====================================================================
--  Irrigation Pro — Migration 001 : schéma initial (Vague 0)
-- =====================================================================
--
--  Ce fichier crée l'intégralité du modèle de données de départ :
--  comptes, jetons de session, projets, résultats de calcul, rapports,
--  et les deux journaux (activité client / actions administrateur).
--
--  Conventions appliquées partout :
--    * identifiants métier en `uuid` (impossibles à deviner ou à énumérer,
--      contrairement à des numéros 1, 2, 3…) ;
--    * toutes les dates en `timestamptz` (horodatage avec fuseau) ;
--    * aucune colonne ne contient de mot de passe en clair, jamais —
--      même un mot de passe temporaire est stocké haché ;
--    * `ON DELETE CASCADE` sur les données appartenant à un compte ou à un
--      projet : supprimer le parent supprime ses données ;
--    * `ON DELETE SET NULL` sur les journaux : la trace d'un événement
--      survit à la suppression du compte concerné.
--
--  ⚠ Ce fichier est exécuté par `npm run migrate` DANS UNE TRANSACTION
--    gérée par le runner : n'écrivez pas de BEGIN / COMMIT ici.
--  ⚠ Une migration déjà appliquée ne doit plus jamais être modifiée
--    (son empreinte sha256 est vérifiée). Créez un fichier 002_… à la place.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------

-- `pgcrypto` fournit gen_random_uuid(), utilisée comme valeur par défaut
-- des identifiants.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ---------------------------------------------------------------------
-- 1. Types énumérés
--    Un type énuméré interdit au niveau de la base toute valeur non prévue
--    (impossible d'insérer un statut « PEUT-ÊTRE »).
-- ---------------------------------------------------------------------

-- Rôle d'un compte : client final, ou propriétaire du logiciel.
CREATE TYPE user_role AS ENUM ('CLIENT', 'ADMIN');

-- Statut d'un compte : c'est le SEUL contrôle d'accès du produit.
-- Il est modifié à la main par l'administrateur (aucune expiration
-- automatique, aucune licence technique — cf. docs/DECISIONS.md D-008).
CREATE TYPE user_status AS ENUM ('ACTIF', 'SUSPENDU');

-- Avancement d'un projet, affiché dans l'application.
CREATE TYPE project_status AS ENUM ('BROUILLON', 'EN_COURS', 'TERMINE');


-- ---------------------------------------------------------------------
-- 2. Fonction et déclencheur de mise à jour automatique de `updated_at`
-- ---------------------------------------------------------------------

-- Met à jour la colonne `updated_at` à chaque modification d'une ligne.
-- Cela évite d'avoir à y penser dans chaque requête du code.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS
    'Déclencheur : positionne updated_at = now() à chaque UPDATE.';


-- ---------------------------------------------------------------------
-- 3. `users` — les comptes
--    Créés uniquement par l'administrateur depuis son dashboard.
--    Il n'existe pas d'inscription libre.
-- ---------------------------------------------------------------------

CREATE TABLE users (
    id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identifiant de connexion. L'unicité est assurée sans tenir compte de
    -- la casse par l'index `users_email_unique_idx` plus bas.
    email                 text         NOT NULL,

    -- Empreinte du mot de passe (format « scrypt$N$r$p$sel$hash »,
    -- cf. docs/DECISIONS.md D-003). JAMAIS le mot de passe lui-même.
    password_hash         text         NOT NULL,

    full_name             text         NOT NULL,
    company               text,

    role                  user_role    NOT NULL DEFAULT 'CLIENT',
    status                user_status  NOT NULL DEFAULT 'ACTIF',

    -- Vrai tant que le client n'a pas remplacé le mot de passe temporaire
    -- que l'administrateur lui a communiqué.
    must_change_password  boolean      NOT NULL DEFAULT true,

    -- Protection contre les tentatives répétées de connexion (brute-force).
    failed_login_attempts integer      NOT NULL DEFAULT 0,
    locked_until          timestamptz,

    last_login_at         timestamptz,

    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),

    -- Administrateur ayant créé ce compte (NULL pour le tout premier compte).
    created_by            uuid         REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT users_email_non_vide       CHECK (length(btrim(email)) > 0),
    CONSTRAINT users_email_format         CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    CONSTRAINT users_full_name_non_vide   CHECK (length(btrim(full_name)) > 0),
    CONSTRAINT users_password_hash_rempli CHECK (length(password_hash) > 0),
    CONSTRAINT users_tentatives_positives CHECK (failed_login_attempts >= 0)
);

-- Unicité de l'e-mail insensible à la casse :
-- « Jean@Exemple.fr » et « jean@exemple.fr » sont le même compte.
CREATE UNIQUE INDEX users_email_unique_idx ON users (lower(email));

-- Liste des comptes dans le dashboard admin, triée du plus récent au plus ancien.
CREATE INDEX users_created_at_idx ON users (created_at DESC);

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  users                IS 'Comptes du logiciel. Créés uniquement par l''administrateur.';
COMMENT ON COLUMN users.password_hash  IS 'Empreinte scrypt du mot de passe. Jamais de mot de passe en clair.';
COMMENT ON COLUMN users.status         IS 'ACTIF = accès autorisé ; SUSPENDU = accès refusé. Seul contrôle d''accès du produit.';
COMMENT ON COLUMN users.locked_until   IS 'Si renseignée et future : connexion bloquée temporairement (anti brute-force).';


-- ---------------------------------------------------------------------
-- 4. `refresh_tokens` — les sessions longues, révocables
--    L'application reste connectée plusieurs jours sans redemander le mot
--    de passe (cf. D-005). Le jeton n'est stocké QUE sous forme d'empreinte :
--    même en cas de fuite de la base, il est inutilisable tel quel.
-- ---------------------------------------------------------------------

CREATE TABLE refresh_tokens (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Empreinte sha256 du jeton. JAMAIS le jeton lui-même.
    token_hash  text        NOT NULL UNIQUE,

    expires_at  timestamptz NOT NULL,

    -- Renseignée quand la session est fermée ou invalidée (déconnexion,
    -- changement de mot de passe, suspension du compte).
    revoked_at  timestamptz,

    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT refresh_tokens_hash_rempli CHECK (length(token_hash) > 0)
);

-- Retrouver ou révoquer d'un coup toutes les sessions d'un compte.
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);

-- Ménage périodique des jetons expirés.
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);

COMMENT ON TABLE  refresh_tokens            IS 'Sessions longues de l''application desktop, révocables une par une.';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'Empreinte sha256 du jeton de rafraîchissement. Jamais le jeton en clair.';


-- ---------------------------------------------------------------------
-- 5. `projects` — les dossiers de travail du client
--    `owner_id` est LA colonne d'isolation : toute lecture ou écriture de
--    projet doit la filtrer. Un client ne voit que ses propres projets.
-- ---------------------------------------------------------------------

CREATE TABLE projects (
    id          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name        text           NOT NULL,
    client_name text,
    location    text,
    description text,

    status      project_status NOT NULL DEFAULT 'BROUILLON',

    created_at  timestamptz    NOT NULL DEFAULT now(),
    updated_at  timestamptz    NOT NULL DEFAULT now(),

    -- Suppression logique : la ligne est conservée (les rapports déjà remis
    -- au client final restent traçables) mais n'apparaît plus dans l'app.
    deleted_at  timestamptz,

    CONSTRAINT projects_name_non_vide CHECK (length(btrim(name)) > 0)
);

-- Liste « mes projets ».
CREATE INDEX projects_owner_id_idx ON projects (owner_id);

-- Index partiel : n'indexe que les projets vivants, c'est-à-dire la quasi-
-- totalité des requêtes de l'application.
CREATE INDEX projects_actifs_idx
    ON projects (owner_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TRIGGER projects_set_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  projects            IS 'Projets d''irrigation. Cloisonnés par owner_id.';
COMMENT ON COLUMN projects.owner_id   IS 'Propriétaire du projet : colonne d''isolation, obligatoire dans tout WHERE.';
COMMENT ON COLUMN projects.deleted_at IS 'Suppression logique. NULL = projet visible.';


-- ---------------------------------------------------------------------
-- 6. `project_data` — les résultats des modules de calcul
--    Entrées et résultats sont stockés en JSON : chaque module a ses
--    propres champs, et ils évolueront avec le moteur de calcul.
--    `engine_version` permet de savoir avec quelle version des formules
--    un résultat archivé a été produit.
-- ---------------------------------------------------------------------

CREATE TABLE project_data (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- BESOINS_EAU | CANAL_MANNING | PERTES_CHARGE | POMPAGE
    module         text        NOT NULL,

    inputs         jsonb       NOT NULL,
    results        jsonb       NOT NULL,
    engine_version text        NOT NULL,

    computed_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT project_data_module_non_vide  CHECK (length(btrim(module)) > 0),
    CONSTRAINT project_data_version_remplie  CHECK (length(btrim(engine_version)) > 0)
);

-- « Donne-moi les derniers résultats du module X pour le projet Y ».
CREATE INDEX project_data_project_module_idx ON project_data (project_id, module, computed_at DESC);

COMMENT ON TABLE  project_data                IS 'Historique des calculs lancés sur un projet.';
COMMENT ON COLUMN project_data.module         IS 'Module de calcul : BESOINS_EAU, CANAL_MANNING, PERTES_CHARGE, POMPAGE.';
COMMENT ON COLUMN project_data.engine_version IS 'Version du moteur de calcul ayant produit ce résultat.';


-- ---------------------------------------------------------------------
-- 7. `reports` — les rapports PDF générés (Vague 3)
--    `owner_id` est volontairement redondant avec projects.owner_id :
--    il permet de filtrer par propriétaire sans jointure, ce qui rend
--    l'isolation plus difficile à oublier dans une requête.
-- ---------------------------------------------------------------------

CREATE TABLE reports (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id     uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,

    -- Référence lisible imprimée sur le document, ex. « RAP-2026-0042 ».
    reference    text        NOT NULL UNIQUE,

    -- Emplacement du fichier PDF sur le serveur (NULL si régénéré à la demande).
    file_path    text,

    generated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT reports_reference_non_vide CHECK (length(btrim(reference)) > 0)
);

CREATE INDEX reports_project_id_idx ON reports (project_id, generated_at DESC);
CREATE INDEX reports_owner_id_idx   ON reports (owner_id,   generated_at DESC);

COMMENT ON TABLE  reports          IS 'Rapports PDF produits pour un projet.';
COMMENT ON COLUMN reports.owner_id IS 'Redondance volontaire avec projects.owner_id : filtre d''isolation sans jointure.';


-- ---------------------------------------------------------------------
-- 8. `activity_logs` — journal d'activité
--    Trace des actions sensibles : connexions, créations de projet,
--    générations de rapport… Exigence de journalisation du cahier des charges.
--    `user_id` est NULLable et en ON DELETE SET NULL : la trace survit à la
--    suppression du compte.
-- ---------------------------------------------------------------------

CREATE TABLE activity_logs (
    id          bigserial   PRIMARY KEY,
    user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,

    -- ex. LOGIN_SUCCESS, LOGIN_FAILED, PROJECT_CREATED, REPORT_GENERATED
    action      text        NOT NULL,

    entity_type text,
    entity_id   text,

    ip_address  inet,
    user_agent  text,

    -- Contexte libre. Ne doit contenir NI mot de passe, NI jeton.
    metadata    jsonb,

    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT activity_logs_action_non_vide CHECK (length(btrim(action)) > 0)
);

-- « Dernières actions de ce client » (dashboard admin).
CREATE INDEX activity_logs_user_created_idx ON activity_logs (user_id, created_at DESC);

-- « Dernières actions, tous comptes confondus » et purge par ancienneté.
CREATE INDEX activity_logs_created_idx ON activity_logs (created_at DESC);

COMMENT ON TABLE  activity_logs          IS 'Journal des actions sensibles. Conservé même si le compte est supprimé.';
COMMENT ON COLUMN activity_logs.metadata IS 'Contexte libre. Ne doit jamais contenir de mot de passe ni de jeton.';


-- ---------------------------------------------------------------------
-- 9. `admin_actions` — journal des décisions de l'administrateur
--    Qui a créé, suspendu ou réactivé quel compte, quand, et pourquoi.
-- ---------------------------------------------------------------------

CREATE TABLE admin_actions (
    id             bigserial   PRIMARY KEY,

    -- L'administrateur auteur de l'action. Pas de ON DELETE : on refuse de
    -- supprimer un administrateur qui a laissé des traces.
    admin_id       uuid        NOT NULL REFERENCES users(id),

    target_user_id uuid        REFERENCES users(id) ON DELETE SET NULL,

    -- CREATE_ACCOUNT | SUSPEND | REACTIVATE | RESET_PASSWORD
    action         text        NOT NULL,

    reason         text,
    metadata       jsonb,

    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT admin_actions_action_non_vide CHECK (length(btrim(action)) > 0)
);

CREATE INDEX admin_actions_admin_idx   ON admin_actions (admin_id, created_at DESC);
CREATE INDEX admin_actions_target_idx  ON admin_actions (target_user_id, created_at DESC);
CREATE INDEX admin_actions_created_idx ON admin_actions (created_at DESC);

COMMENT ON TABLE  admin_actions        IS 'Journal des actions du propriétaire sur les comptes clients.';
COMMENT ON COLUMN admin_actions.reason IS 'Motif saisi par l''administrateur (facultatif).';
