/**
 * Fabriques partagées par les tests de la Vague 2 (projets et calculs).
 *
 * Même principe que `helpers/comptes.ts` : ce fichier n'est pas un test, c'est
 * l'outillage qui permet aux tests de tourner **sans PostgreSQL**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  POURQUOI CES FAUX DÉPÔTS REPRODUISENT LE FILTRAGE PAR PROPRIÉTAIRE
 * ═══════════════════════════════════════════════════════════════════════════
 *  Il aurait été plus simple d'écrire un `getProject` qui ignore `ownerId` et
 *  de vérifier ensuite, dans le test, que la route a bien passé le bon
 *  identifiant. Ce n'est pas ce qui est fait ici.
 *
 *  Les implémentations ci-dessous appliquent exactement le même `WHERE` que le
 *  SQL réel : `owner_id = …`, `deleted_at IS NULL`, et pour `project_data` la
 *  jointure sur le projet. Conséquence : une route qui oublierait de
 *  transmettre `ownerId`, ou qui le transmettrait depuis le corps de la requête
 *  plutôt que depuis la session, ne renverrait plus rien — et le test
 *  d'isolation échouerait au lieu de passer par accident.
 *
 *  C'est le seul montage qui rend `isolation.test.ts` significatif sans base de
 *  données.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type StatutProjet = 'BROUILLON' | 'EN_COURS' | 'TERMINE';

export type LigneProjet = {
  id: string;
  owner_id: string;
  name: string;
  client_name: string | null;
  location: string | null;
  description: string | null;
  status: StatutProjet;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LigneCalcul = {
  id: string;
  project_id: string;
  module: string;
  inputs: unknown;
  results: unknown;
  engine_version: string;
  computed_at: Date;
};

export type EntreeJournal = {
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
};

export interface EtatProjets {
  projets: LigneProjet[];
  calculs: LigneCalcul[];
  journal: EntreeJournal[];
}

export function creerEtatProjets(): EtatProjets {
  return { projets: [], calculs: [], journal: [] };
}

let compteurProjet = 0;
let compteurCalcul = 0;

/** UUID déterministe et bien formé, pour que la validation `zod` les accepte. */
function uuidDeTest(prefixe: string, numero: number): string {
  const suffixe = String(numero).padStart(12, '0');
  return `${prefixe}-0000-4000-8000-${suffixe}`;
}

export function creerLigneProjet(
  ownerId: string,
  surcharges: Partial<LigneProjet> = {},
): LigneProjet {
  compteurProjet += 1;
  const maintenant = new Date(Date.UTC(2026, 1, 1, 9, 0, compteurProjet));
  return {
    id: uuidDeTest('aaaaaaaa', compteurProjet),
    owner_id: ownerId,
    name: `Périmètre irrigué ${compteurProjet}`,
    client_name: 'SAED',
    location: 'Delta du fleuve',
    description: null,
    status: 'BROUILLON',
    created_at: maintenant,
    updated_at: maintenant,
    deleted_at: null,
    ...surcharges,
  };
}

export function creerLigneCalcul(
  projectId: string,
  surcharges: Partial<LigneCalcul> = {},
): LigneCalcul {
  compteurCalcul += 1;
  return {
    id: uuidDeTest('bbbbbbbb', compteurCalcul),
    project_id: projectId,
    module: 'BESOINS_EAU',
    inputs: { At: 12 },
    results: { besoin: 42 },
    engine_version: '1.0.0-test',
    computed_at: new Date(Date.UTC(2026, 1, 2, 9, 0, compteurCalcul)),
    ...surcharges,
  };
}

/** Identifiant valide mais qui ne correspond à rien : « projet inexistant ». */
export const UUID_INCONNU = 'cccccccc-0000-4000-8000-000000000000';

// ---------------------------------------------------------------------------
// Faux dépôts
// ---------------------------------------------------------------------------

/** Reproduit `ILIKE '%…%'` sur le nom du projet et le nom du client. */
function correspondRecherche(ligne: LigneProjet, recherche: string): boolean {
  const motif = recherche.trim().toLowerCase();
  if (motif === '') return true;
  return (
    ligne.name.toLowerCase().includes(motif) ||
    (ligne.client_name ?? '').toLowerCase().includes(motif)
  );
}

export function implementationsDepotsProjets(etat: EtatProjets) {
  /** Le `WHERE owner_id = $1 AND deleted_at IS NULL` du SQL réel. */
  const projetVivantDe = (id: string, ownerId: string): LigneProjet | null =>
    etat.projets.find(
      (p) => p.id === id && p.owner_id === ownerId && p.deleted_at === null,
    ) ?? null;

  const filtrer = (
    ownerId: string,
    options: { status?: StatutProjet | null; search?: string | null },
  ): LigneProjet[] =>
    etat.projets
      .filter((p) => p.owner_id === ownerId && p.deleted_at === null)
      .filter((p) => !options.status || p.status === options.status)
      .filter((p) => !options.search || correspondRecherche(p, options.search))
      .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime() || (a.id < b.id ? 1 : -1));

  return {
    // --- projects.repo -----------------------------------------------------

    listProjects: async (
      ownerId: string,
      options: {
        status?: StatutProjet | null;
        search?: string | null;
        limit?: number;
        offset?: number;
      } = {},
    ) => {
      const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
      const offset = Math.max(options.offset ?? 0, 0);
      return filtrer(ownerId, options)
        .slice(offset, offset + limit)
        .map((p) => ({
          ...p,
          calcul_count: String(etat.calculs.filter((c) => c.project_id === p.id).length),
        }));
    },

    countProjects: async (
      ownerId: string,
      options: { status?: StatutProjet | null; search?: string | null } = {},
    ) => filtrer(ownerId, options).length,

    getProject: async (id: string, ownerId: string) => projetVivantDe(id, ownerId),

    projectBelongsToOwner: async (id: string, ownerId: string) =>
      projetVivantDe(id, ownerId) !== null,

    createProject: async (
      ownerId: string,
      input: {
        name: string;
        clientName?: string | null;
        location?: string | null;
        description?: string | null;
        status?: StatutProjet;
      },
    ) => {
      const ligne = creerLigneProjet(ownerId, {
        name: input.name.trim(),
        client_name: input.clientName ?? null,
        location: input.location ?? null,
        description: input.description ?? null,
        status: input.status ?? 'BROUILLON',
      });
      etat.projets.push(ligne);
      return ligne;
    },

    updateProject: async (
      id: string,
      ownerId: string,
      patch: {
        name?: string;
        clientName?: string | null;
        location?: string | null;
        description?: string | null;
        status?: StatutProjet;
      },
    ) => {
      const ligne = projetVivantDe(id, ownerId);
      if (!ligne) return null;
      if (patch.name !== undefined) ligne.name = patch.name.trim();
      if (patch.clientName !== undefined) ligne.client_name = patch.clientName;
      if (patch.location !== undefined) ligne.location = patch.location;
      if (patch.description !== undefined) ligne.description = patch.description;
      if (patch.status !== undefined) ligne.status = patch.status;
      ligne.updated_at = new Date();
      return ligne;
    },

    softDeleteProject: async (id: string, ownerId: string) => {
      const ligne = projetVivantDe(id, ownerId);
      if (!ligne) return false;
      ligne.deleted_at = new Date();
      return true;
    },

    // --- project-data.repo -------------------------------------------------

    saveProjectData: async (
      projectId: string,
      ownerId: string,
      input: { module: string; inputs: unknown; results: unknown; engineVersion: string },
    ) => {
      // `INSERT … SELECT … WHERE p.owner_id = $2` : aucune ligne insérée si le
      // projet n'est pas celui du compte connecté.
      if (!projetVivantDe(projectId, ownerId)) return null;
      const ligne = creerLigneCalcul(projectId, {
        module: input.module,
        inputs: input.inputs,
        results: input.results,
        engine_version: input.engineVersion,
      });
      etat.calculs.push(ligne);
      return ligne;
    },

    listProjectData: async (
      projectId: string,
      ownerId: string,
      options: { module?: string | null; limit?: number; offset?: number } = {},
    ) => {
      if (!projetVivantDe(projectId, ownerId)) return [];
      const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
      const offset = Math.max(options.offset ?? 0, 0);
      return etat.calculs
        .filter((c) => c.project_id === projectId)
        .filter((c) => !options.module || c.module === options.module)
        .sort((a, b) => b.computed_at.getTime() - a.computed_at.getTime())
        .slice(offset, offset + limit);
    },

    countProjectData: async (projectId: string, ownerId: string) => {
      if (!projetVivantDe(projectId, ownerId)) return 0;
      return etat.calculs.filter((c) => c.project_id === projectId).length;
    },

    getProjectData: async (id: string, projectId: string, ownerId: string) => {
      if (!projetVivantDe(projectId, ownerId)) return null;
      return (
        etat.calculs.find((c) => c.id === id && c.project_id === projectId) ?? null
      );
    },

    getLatestProjectData: async (projectId: string, ownerId: string, module: string) => {
      if (!projetVivantDe(projectId, ownerId)) return null;
      return (
        etat.calculs
          .filter((c) => c.project_id === projectId && c.module === module)
          .sort((a, b) => b.computed_at.getTime() - a.computed_at.getTime())[0] ?? null
      );
    },

    deleteProjectData: async (id: string, projectId: string, ownerId: string) => {
      // Les DEUX appartenances, comme dans le `DELETE … USING projects`.
      if (!projetVivantDe(projectId, ownerId)) return false;
      const index = etat.calculs.findIndex((c) => c.id === id && c.project_id === projectId);
      if (index === -1) return false;
      etat.calculs.splice(index, 1);
      return true;
    },

    // --- activity-logs.repo ------------------------------------------------

    logActivity: async (input: {
      userId?: string | null;
      action: string;
      entityType?: string | null;
      entityId?: string | null;
      metadata?: Record<string, unknown> | null;
    }) => {
      etat.journal.push({
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? null,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Faux moteur de calcul
// ---------------------------------------------------------------------------

/**
 * Catalogue minimal servi par le faux moteur.
 *
 * Il respecte la promesse du contrat : des métadonnées d'affichage, et **aucun
 * coefficient métier**. Les tests s'en servent pour vérifier qu'aucun
 * coefficient n'apparaît dans la réponse — s'il n'y en a pas dans la source, le
 * test ne prouve rien sur le vrai moteur, mais il prouve que le routeur
 * n'en ajoute pas.
 */
export const CATALOGUE_FACTICE = [
  {
    code: 'BESOINS_EAU',
    libelle: 'Besoins en eau des cultures',
    famille: 'gravitaire',
    origine: 'F1',
    description: 'Bilan hydrique FAO.',
    entrees: [
      {
        champ: 'At',
        libelle: 'Superficie totale',
        type: 'nombre',
        unite: 'ha',
        obligatoire: true,
        min: 0,
      },
      {
        champ: 'materiau',
        libelle: 'Matériau de conduite',
        type: 'liste',
        unite: null,
        obligatoire: true,
        table: 'materiaux-conduite',
      },
    ],
    sorties: [
      { champ: 'besoin', libelle: 'Besoin brut', unite: 'mm/j', principal: true },
    ],
  },
] as const;

export const REFERENCES_FACTICES: Record<string, { cle: string; libelle: string }[]> = {
  'materiaux-conduite': [
    { cle: 'PVC', libelle: 'PVC' },
    { cle: 'FONTE', libelle: 'Fonte ductile' },
  ],
  cultures: [{ cle: 'RIZ', libelle: 'Riz irrigué' }],
};
