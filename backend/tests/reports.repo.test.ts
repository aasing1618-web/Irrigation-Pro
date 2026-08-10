/**
 * Tests du dépôt « rapports » — Vague 3.
 *
 * Ce fichier n'éprouve pas PostgreSQL : il éprouve **ce que le dépôt lui
 * demande**. La couche `db` est remplacée par un espion, ce qui permet de
 * vérifier trois propriétés qu'aucun test de route ne peut atteindre :
 *
 *  1. **Le SQL est paramétré.** Aucune valeur n'est concaténée dans le texte de
 *     la requête, et `owner_id` figure bien dans le `WHERE` de chaque
 *     instruction — l'isolation est faite par la base, pas par la route.
 *  2. **La référence est attribuée par le serveur**, dans l'instruction
 *     elle-même, et jamais reçue en paramètre depuis l'extérieur.
 *  3. **La course sur la référence est traitée.** `reports.reference` est
 *     `UNIQUE` ; deux générations simultanées peuvent lire le même maximum. Le
 *     dépôt rejoue alors l'instruction. C'est exactement ce que ce fichier
 *     simule, en faisant échouer les premières tentatives avec le code
 *     PostgreSQL `23505`.
 *
 * La syntaxe des requêtes, elle, a été validée séparément contre la vraie base
 * (`EXPLAIN`, sans exécution).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../src/db/index.js', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  withTransaction: vi.fn(),
  checkDatabase: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));

const { createReport, deleteReport, getReport, listReports, setReportFilePath } = await import(
  '../src/db/repositories/reports.repo.js'
);

const PROJET = 'aaaaaaaa-0000-4000-8000-000000000001';
const OWNER = '11111111-1111-4111-8111-000000000001';
const RAPPORT = 'dddddddd-0000-4000-8000-000000000001';

function ligneRapport(reference = 'RAP-2026-0001') {
  return {
    id: RAPPORT,
    project_id: PROJET,
    owner_id: OWNER,
    reference,
    file_path: null,
    generated_at: new Date('2026-08-10T14:32:00.000Z'),
  };
}

/** Une violation d'unicité PostgreSQL, telle que la remonte le driver `pg`. */
function conflitUnicite(): Error & { code: string } {
  const erreur = new Error(
    'duplicate key value violates unique constraint "reports_reference_key"',
  ) as Error & { code: string };
  erreur.code = '23505';
  return erreur;
}

/** Texte SQL et paramètres du n-ième appel à la base. */
function appel(index = 0): { sql: string; params: unknown[] } {
  const [sql, params] = mockQuery.mock.calls[index] as [string, unknown[]];
  return { sql, params };
}

beforeEach(() => {
  mockQuery.mockReset();
});

// ---------------------------------------------------------------------------

describe('createReport — attribution de la référence', () => {
  it('crée la ligne et renvoie le rapport', async () => {
    mockQuery.mockResolvedValue({ rows: [ligneRapport()], rowCount: 1 });

    const ligne = await createReport(PROJET, OWNER, 2026);

    expect(ligne?.reference).toBe('RAP-2026-0001');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('calcule la référence dans le SQL, et ne la reçoit jamais de l’appelant', async () => {
    mockQuery.mockResolvedValue({ rows: [ligneRapport()], rowCount: 1 });
    await createReport(PROJET, OWNER, 2026);

    const { sql, params } = appel();

    // La référence est construite par la base, à partir du maximum existant.
    expect(sql).toContain("'RAP-'");
    expect(sql).toContain('lpad(');
    expect(sql).toContain('max(');
    // Seuls le projet, le propriétaire et l'année sont transmis.
    expect(params).toEqual([PROJET, OWNER, '2026']);
    expect(params).not.toContain('RAP-2026-0001');
  });

  it('vérifie l’appartenance du projet dans le SQL, jamais en mémoire', async () => {
    mockQuery.mockResolvedValue({ rows: [ligneRapport()], rowCount: 1 });
    await createReport(PROJET, OWNER, 2026);

    const { sql } = appel();
    expect(sql).toContain('p.owner_id = $2');
    expect(sql).toContain('p.deleted_at IS NULL');
    // `owner_id` est recopié depuis le projet, pas depuis le paramètre : la
    // colonne redondante ne peut pas diverger de la source de vérité.
    expect(sql).toContain('p.owner_id,');
  });

  it('renvoie null quand le projet n’est pas celui du compte (aucune ligne)', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await createReport(PROJET, OWNER, 2026)).toBeNull();
  });

  it('borne l’année à quatre chiffres, quoi qu’on lui passe', async () => {
    mockQuery.mockResolvedValue({ rows: [ligneRapport()], rowCount: 1 });

    await createReport(PROJET, OWNER, 12345);
    expect(appel(0).params[2]).toBe('9999');

    mockQuery.mockClear();
    await createReport(PROJET, OWNER, 12);
    expect(appel(0).params[2]).toBe('1000');
  });
});

// ---------------------------------------------------------------------------

describe('createReport — course sur la référence unique', () => {
  it('rejoue l’instruction quand deux rapports visent le même numéro', async () => {
    mockQuery
      .mockRejectedValueOnce(conflitUnicite())
      .mockResolvedValueOnce({ rows: [ligneRapport('RAP-2026-0002')], rowCount: 1 });

    const ligne = await createReport(PROJET, OWNER, 2026);

    expect(ligne?.reference).toBe('RAP-2026-0002');
    expect(mockQuery).toHaveBeenCalledTimes(2);
    // Le rejeu relit le maximum : la seconde tentative est identique à la
    // première, c'est la base qui a changé entre les deux.
    expect(appel(1).sql).toBe(appel(0).sql);
  });

  it('converge même après plusieurs collisions successives', async () => {
    mockQuery
      .mockRejectedValueOnce(conflitUnicite())
      .mockRejectedValueOnce(conflitUnicite())
      .mockRejectedValueOnce(conflitUnicite())
      .mockResolvedValueOnce({ rows: [ligneRapport('RAP-2026-0004')], rowCount: 1 });

    expect((await createReport(PROJET, OWNER, 2026))?.reference).toBe('RAP-2026-0004');
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('abandonne au bout d’un nombre borné de tentatives, sans boucler', async () => {
    mockQuery.mockRejectedValue(conflitUnicite());

    await expect(createReport(PROJET, OWNER, 2026)).rejects.toThrow(/unique constraint/);
    expect(mockQuery).toHaveBeenCalledTimes(8);
  });

  it('ne rejoue pas une erreur qui n’est pas un conflit d’unicité', async () => {
    mockQuery.mockRejectedValue(new Error('connexion perdue'));

    await expect(createReport(PROJET, OWNER, 2026)).rejects.toThrow('connexion perdue');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

describe('lectures et écritures — isolation par le SQL', () => {
  it('setReportFilePath exige le propriétaire, pas seulement l’identifiant', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    expect(await setReportFilePath(RAPPORT, OWNER, 'x/y.pdf')).toBe(true);
    const { sql, params } = appel();
    expect(sql).toContain('owner_id = $2');
    expect(params).toEqual([RAPPORT, OWNER, 'x/y.pdf']);
  });

  it('setReportFilePath renvoie false si aucune ligne n’a été touchée', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await setReportFilePath(RAPPORT, OWNER, 'x/y.pdf')).toBe(false);
  });

  it('listReports filtre sur le projet ET le propriétaire, et borne la pagination', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await listReports(PROJET, OWNER, { limit: 100_000, offset: -5 });

    const { sql, params } = appel();
    expect(sql).toContain('r.owner_id = $2');
    expect(sql).toContain('JOIN projects p ON p.id = r.project_id AND p.owner_id = r.owner_id');
    expect(params).toEqual([PROJET, OWNER, 500, 0]);
  });

  it('getReport exige la concordance des deux colonnes `owner_id`', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    expect(await getReport(RAPPORT, OWNER)).toBeNull();

    const { sql, params } = appel();
    expect(sql).toContain('r.owner_id = $2');
    expect(sql).toContain('p.owner_id = r.owner_id');
    expect(params).toEqual([RAPPORT, OWNER]);
  });

  it('deleteReport renvoie la ligne effacée, pour que le fichier soit effacé aussi', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ...ligneRapport(), file_path: `${OWNER}/${RAPPORT}.pdf` }],
      rowCount: 1,
    });

    const ligne = await deleteReport(RAPPORT, OWNER);
    expect(ligne?.file_path).toBe(`${OWNER}/${RAPPORT}.pdf`);

    const { sql, params } = appel();
    expect(sql).toContain('r.owner_id = $2');
    expect(sql).toContain('RETURNING');
    expect(params).toEqual([RAPPORT, OWNER]);
  });

  it('deleteReport renvoie null quand le rapport n’est pas celui du compte', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await deleteReport(RAPPORT, OWNER)).toBeNull();
  });

  it('n’insère jamais une valeur dans le texte SQL : tout passe par $n', async () => {
    mockQuery.mockResolvedValue({ rows: [ligneRapport()], rowCount: 1 });

    await createReport(PROJET, OWNER, 2026);
    await getReport(RAPPORT, OWNER);
    await deleteReport(RAPPORT, OWNER);
    await listReports(PROJET, OWNER);
    await setReportFilePath(RAPPORT, OWNER, 'x/y.pdf');

    for (const [sql] of mockQuery.mock.calls as Array<[string]>) {
      expect(sql).not.toContain(PROJET);
      expect(sql).not.toContain(OWNER);
      expect(sql).not.toContain(RAPPORT);
    }
  });
});
