-- =====================================================================
--  Irrigation Pro — Migration 003 : motif de révocation des sessions
--  (cf. docs/API-VAGUE-1.md, § « POST /api/auth/refresh »)
-- =====================================================================
--
--  ┌───────────────────────────────────────────────────────────────────┐
--  │  LE DÉFAUT QUE CETTE MIGRATION PERMET DE CORRIGER                  │
--  └───────────────────────────────────────────────────────────────────┘
--
--  Jusqu'ici, `refresh_tokens.revoked_at` disait QUAND une session avait
--  été fermée, mais jamais POURQUOI. Le serveur ne pouvait donc pas
--  distinguer deux situations qui n'ont rien à voir :
--
--    * un jeton remplacé par la rotation normale d'un rafraîchissement,
--      qui revient malgré tout → DEUX détenteurs du même jeton, donc un
--      vol probable ;
--    * un jeton fermé volontairement (déconnexion, changement de mot de
--      passe, suspension du compte) qu'un appareil resté allumé rejoue
--      simplement parce qu'il n'a pas vu la nouvelle → rien d'anormal.
--
--  Faute de cette distinction, le second cas déclenchait la même réaction
--  que le premier : révocation de TOUTES les sessions du compte. Un
--  ingénieur qui changeait son mot de passe au bureau se faisait donc
--  éjecter de sa propre session dès que son portable resté à la maison
--  tentait un rafraîchissement.
--
--  Cette migration ajoute le motif manquant. La décision, elle, appartient
--  au serveur (backend/src/auth/auth.service.ts).
--
--  ┌───────────────────────────────────────────────────────────────────┐
--  │  LES LIGNES DÉJÀ RÉVOQUÉES AU MOMENT DE LA MIGRATION               │
--  └───────────────────────────────────────────────────────────────────┘
--
--  Elles n'ont pas de motif : personne ne l'a jamais enregistré. On leur
--  attribue `ADMIN`, c'est-à-dire « fermée côté serveur, sans suspicion ».
--
--  C'est le choix prudent, et il est délibéré : supposer `ROTATION` sur
--  des données historiques reviendrait à traiter comme un vol le premier
--  rejeu d'un jeton dont on ne sait rien, et à couper les sessions d'un
--  client parfaitement honnête. Le pire défaut par défaut serait de
--  soupçonner.
--
--  ⚠ Ce fichier est exécuté par `npm run migrate` DANS UNE TRANSACTION
--    gérée par le runner : n'écrivez pas de BEGIN / COMMIT ici.
--  ⚠ Une migration déjà appliquée ne doit plus jamais être modifiée
--    (son empreinte sha256 est vérifiée). Créez un fichier 004_… à la place.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Le type énuméré des motifs
--
--    Un type énuméré, comme `user_role` et `user_status` en 001 : la base
--    refuse elle-même toute valeur non prévue. Un motif fantaisiste ne
--    peut donc pas s'infiltrer par une requête écrite à la main, et la
--    liste reste lisible depuis n'importe quel outil SQL.
--
--    Les quatre valeurs correspondent exactement au tableau du contrat
--    d'API. Seule la première décrit une situation anormale.
-- ---------------------------------------------------------------------

CREATE TYPE token_revocation_reason AS ENUM (
    'ROTATION',         -- remplacé par la rotation d'un rafraîchissement
    'LOGOUT',           -- déconnexion volontaire de l'utilisateur
    'PASSWORD_CHANGE',  -- changement de mot de passe : tout est refermé
    'ADMIN'             -- fermeture décidée côté serveur / propriétaire
);

COMMENT ON TYPE token_revocation_reason IS
    'Pourquoi une session longue a été fermée. Seul ROTATION, rejoué, signale un vol probable.';


-- ---------------------------------------------------------------------
-- 2. La colonne
--
--    Nullable : un motif n'a de sens que pour une session FERMÉE. Une
--    session active a `revoked_at` NULL, donc `revoked_reason` NULL.
-- ---------------------------------------------------------------------

ALTER TABLE refresh_tokens
    ADD COLUMN revoked_reason token_revocation_reason;

COMMENT ON COLUMN refresh_tokens.revoked_reason IS
    'Motif de la révocation. NULL si et seulement si la session est encore active. '
    'Un jeton révoqué pour ROTATION qui revient = vol probable (REFRESH_TOKEN_REUSE) ; '
    'les autres motifs ne donnent qu''un 401, sans révocation en cascade.';


-- ---------------------------------------------------------------------
-- 3. Rattrapage des lignes déjà révoquées
--
--    Exécuté AVANT la contrainte de cohérence : PostgreSQL vérifie une
--    nouvelle contrainte CHECK sur les lignes existantes, et l'ajout
--    échouerait tant qu'une ligne révoquée reste sans motif.
--
--    `ADMIN` = motif non suspect (voir l'en-tête). Au moment où cette
--    migration s'applique, la base est vide ou quasi : cet UPDATE ne
--    devrait toucher aucune ligne, ou très peu.
-- ---------------------------------------------------------------------

UPDATE refresh_tokens
   SET revoked_reason = 'ADMIN'
 WHERE revoked_at IS NOT NULL
   AND revoked_reason IS NULL;


-- ---------------------------------------------------------------------
-- 4. Cohérence entre la date et le motif
--
--    « Renseignés tous les deux, ou aucun des deux. » Les deux moitiés de
--    la règle comptent :
--      * un motif sans date de révocation décrirait une session fermée…
--        qu'on continuerait pourtant d'accepter ;
--      * une date sans motif ramènerait exactement le défaut corrigé ici,
--        le serveur ne sachant plus quoi penser du jeton.
--
--    Écrit avec `=` entre deux tests `IS NULL` : les deux membres valent
--    toujours vrai ou faux (jamais NULL), la contrainte tranche donc dans
--    tous les cas — un `CHECK` qui vaut NULL est considéré comme satisfait,
--    ce qui en ferait une contrainte muette.
-- ---------------------------------------------------------------------

ALTER TABLE refresh_tokens
    ADD CONSTRAINT refresh_tokens_motif_coherent
    CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL));


-- ---------------------------------------------------------------------
-- 5. Trace documentaire sur la table
-- ---------------------------------------------------------------------

COMMENT ON TABLE refresh_tokens IS
    'Sessions longues de l''application desktop, révocables une par une. '
    'RLS activé sans politique (migration 002). '
    'Chaque révocation porte son motif (migration 003) : seule la réutilisation '
    'd''un jeton révoqué pour ROTATION est traitée comme un vol.';
