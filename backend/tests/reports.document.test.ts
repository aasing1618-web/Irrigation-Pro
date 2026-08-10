/**
 * Tests du générateur de documents PDF — Vague 3, contrat § 1.
 *
 * Deux moitiés, volontairement séparées :
 *
 *  1. **Le dessin** — à partir d'un `ContenuRapport` littéral, on vérifie que le
 *     document contient tout ce que le contrat impose (page de garde,
 *     hypothèses, résultats, avertissements, pied de page, pagination) et que
 *     la mise en page tient sur plusieurs pages sans perdre ses en-têtes de
 *     tableau. Aucune base, aucun moteur : le contenu est un objet.
 *
 *  2. **Le savoir-faire (D-007)** — avec le **vrai moteur**, sur un vrai module.
 *     C'est la seule façon de prouver quelque chose : un faux catalogue ne
 *     contient aucun coefficient, un test sur un faux catalogue ne prouverait
 *     donc rien. Ici le coefficient de Manning existe réellement dans le
 *     serveur, et on vérifie qu'il n'apparaît pas dans le document.
 *
 * Les PDF sont produits **sans compression** pour être relus (`tests/helpers/
 * pdf.ts`) : le décodage lit les octets WinAnsi réellement écrits, exactement
 * comme le ferait un lecteur de PDF.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nombreDePages, normaliser, texteDuPdf, textesParPage } from './helpers/pdf.js';

// ---------------------------------------------------------------------------
// Dépôt de calculs moqué (pour la partie 2 seulement)
// ---------------------------------------------------------------------------

const mockGetProjectData = vi.fn();
const mockListProjectData = vi.fn();

vi.mock('../src/db/repositories/project-data.repo.js', () => ({
  getProjectData: (...a: unknown[]) => mockGetProjectData(...a),
  listProjectData: (...a: unknown[]) => mockListProjectData(...a),
  saveProjectData: vi.fn(),
  countProjectData: vi.fn(),
  getLatestProjectData: vi.fn(),
  deleteProjectData: vi.fn(),
}));

vi.mock('../src/db/index.js', () => ({
  checkDatabase: vi.fn(async () => ({ ok: true, latencyMs: 1 })),
  query: vi.fn(),
  withTransaction: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));

const { genererPdfRapport } = await import('../src/reports/document.js');
const { construireContenu, selectionnerCalculs } = await import('../src/reports/collecte.js');
const { ENGINE_VERSION, calculer } = await import('../src/engine/index.js');

type ContenuRapport = Parameters<typeof genererPdfRapport>[0];
type BlocCalcul = ContenuRapport['calculs'][number];

// ---------------------------------------------------------------------------
// Fabriques de contenu
// ---------------------------------------------------------------------------

const GENERE_LE = new Date(Date.UTC(2026, 7, 10, 14, 32, 0));

function bloc(surcharges: Partial<BlocCalcul> = {}): BlocCalcul {
  return {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    module: 'CANAL_MANNING',
    nom: 'Canal trapézoïdal',
    description: 'Dimensionnement du canal d’amenée.',
    calculeLe: new Date(Date.UTC(2026, 7, 9, 8, 0, 0)),
    engineVersion: '1.0.0',
    hypotheses: [
      { libelle: 'Débit cible', valeur: '0,09', unite: 'm³/s' },
      { libelle: 'Largeur au fond b', valeur: '0,3', unite: 'm' },
      { libelle: 'Pente longitudinale I', valeur: '0,001', unite: 'm/m' },
    ],
    tableauxHypotheses: [],
    resultats: [
      { libelle: 'Tirant d’eau', valeur: '0,246', unite: 'm', principal: true },
      { libelle: 'Vitesse moyenne', valeur: '0,71', unite: 'm/s' },
    ],
    avertissements: [],
    remarques: [],
    ...surcharges,
  };
}

function contenu(surcharges: Partial<ContenuRapport> = {}): ContenuRapport {
  return {
    entete: {
      reference: 'RAP-2026-0042',
      genereLe: GENERE_LE,
      projetNom: 'Périmètre irrigué de Ndiaye — extension Nord',
      clientFinal: 'Société d’Aménagement du Delta',
      localisation: 'Delta du fleuve Sénégal, Dagana',
      descriptionProjet: 'Réhabilitation de 240 ha en maîtrise totale de l’eau.',
      auteurNom: 'Aïssatou Bâ',
      auteurSociete: 'Bureau d’études Sahel',
      auteurEmail: 'aissatou@bureau-sahel.sn',
    },
    calculs: [bloc()],
    notes: null,
    moteurVersion: '1.0.0',
    ...surcharges,
  };
}

// ===========================================================================
// 1. Le document produit
// ===========================================================================

describe('genererPdfRapport — le document produit', () => {
  it('produit un PDF non vide, qui commence bien par %PDF-', async () => {
    const pdf = await genererPdfRapport(contenu(), { compresser: false });

    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Un PDF complet se termine par sa table des références croisées.
    expect(pdf.subarray(-2048).toString('latin1')).toContain('%%EOF');
  });

  it('porte sur sa page de garde tout ce que le contrat exige', async () => {
    const pdf = await genererPdfRapport(contenu(), { compresser: false });
    const garde = normaliser(textesParPage(pdf)[0] ?? '');

    expect(garde).toContain('Périmètre irrigué de Ndiaye — extension Nord'); // projet
    expect(garde).toContain('Société d’Aménagement du Delta'); //              client final
    expect(garde).toContain('Delta du fleuve Sénégal, Dagana'); //             localisation
    expect(garde).toContain('RAP-2026-0042'); //                               référence
    expect(garde).toContain('10 août 2026'); //                                date
    expect(garde).toContain('Aïssatou Bâ'); //                                 auteur
    expect(garde).toContain('Bureau d’études Sahel');
  });

  it('répète le titre du projet en en-tête courant et numérote les pages', async () => {
    const pdf = await genererPdfRapport(contenu(), { compresser: false });
    const pages = textesParPage(pdf).map(normaliser);
    const total = pages.length;

    expect(total).toBeGreaterThanOrEqual(2);

    pages.forEach((page, index) => {
      expect(page).toContain(`Page ${index + 1} / ${total}`);
      // Le pied de page porte la version du moteur et la date, sur TOUTES les
      // pages — exigence contractuelle.
      expect(page).toContain('moteur de calcul v1.0.0');
      expect(page).toContain('10 août 2026');
      // La page de garde porte déjà le titre en grand : pas d'en-tête courant.
      if (index > 0) {
        expect(page).toContain('Périmètre irrigué de Ndiaye');
        expect(page).toContain('RAP-2026-0042');
      }
    });
  });

  it('n’ajoute aucune page blanche : le nombre annoncé est le nombre réel', async () => {
    // Le piège classique de pdfkit : écrire le pied de page sous la marge basse
    // provoque un saut de page automatique, et le document double de volume.
    const pdf = await genererPdfRapport(contenu(), { compresser: false });
    const pages = textesParPage(pdf);

    expect(nombreDePages(pdf)).toBe(pages.length);
    expect(normaliser(pages[pages.length - 1] ?? '')).toContain(
      `Page ${pages.length} / ${pages.length}`,
    );
    // Aucune page ne se réduit à son seul habillage.
    for (const page of pages) {
      expect(normaliser(page).length).toBeGreaterThan(120);
    }
  });

  it('affiche les hypothèses avec leurs unités, et les résultats avec les leurs', async () => {
    const texte = normaliser(texteDuPdf(await genererPdfRapport(contenu(), { compresser: false })));

    // Les intertitres sont composés en capitales par la charte du document.
    expect(texte).toContain('HYPOTHÈSES RETENUES');
    expect(texte).toContain('Paramètre Valeur Unité');
    expect(texte).toContain('Débit cible 0,09 m³/s');
    expect(texte).toContain('Pente longitudinale I 0,001 m/m');
    expect(texte).toContain('RÉSULTATS');
    expect(texte).toContain('Grandeur Valeur Unité');
    expect(texte).toContain('Vitesse moyenne 0,71 m/s');
  });

  it('rend correctement les accents français avec les polices intégrées', async () => {
    const texte = normaliser(
      texteDuPdf(
        await genererPdfRapport(
          contenu({
            notes: 'Contrôle : é è à ç ù œ Œ ê î ô û ë ï ü ÿ ñ É È À Ç Ù « » ’ – — … m³ m² ° µ',
          }),
          { compresser: false },
        ),
      ),
    );

    expect(texte).toContain('é è à ç ù œ Œ ê î ô û ë ï ü ÿ ñ É È À Ç Ù « » ’ – — …');
    expect(texte).toContain('m³ m² ° µ');
    // Aucun caractère de remplacement : rien n'a été perdu à l'encodage.
    expect(texte).not.toContain('�');
    expect(texte).not.toContain('??');
  });
});

// ===========================================================================
// 2. Les avertissements métier — jamais omis
// ===========================================================================

describe('genererPdfRapport — les avertissements du moteur', () => {
  const avertissements = [
    {
      code: 'VITESSE_HORS_PLAGE',
      message:
        'La vitesse d’écoulement dépasse la plage admissible pour cette nature de paroi : risque d’affouillement.',
      gravite: 'attention' as const,
    },
    {
      code: 'REVANCHE_MINIMALE',
      message: 'La revanche retenue est la revanche minimale réglementaire.',
      gravite: 'info' as const,
    },
  ];

  it('reprend chaque avertissement du moteur dans le document', async () => {
    const pdf = await genererPdfRapport(
      contenu({ calculs: [bloc({ avertissements })] }),
      { compresser: false },
    );
    const texte = normaliser(texteDuPdf(pdf));

    for (const avertissement of avertissements) {
      expect(texte).toContain(normaliser(avertissement.message));
    }
  });

  it('les met en tête de document, dans une section dédiée et visible', async () => {
    const pdf = await genererPdfRapport(
      contenu({ calculs: [bloc({ avertissements })] }),
      { compresser: false },
    );
    const texte = normaliser(texteDuPdf(pdf));

    expect(texte).toContain('Avertissements techniques');
    expect(texte).toContain('Points à vérifier avant dimensionnement');

    // La synthèse précède la section du module : un avertissement enterré en
    // fin de document équivaudrait à un avertissement supprimé.
    const positionSynthese = texte.indexOf('Avertissements techniques');
    const positionModule = texte.indexOf('Canal trapézoïdal', positionSynthese);
    expect(positionSynthese).toBeGreaterThanOrEqual(0);
    expect(positionModule).toBeGreaterThan(positionSynthese);
  });

  it('dit explicitement quand il n’y en a aucun, plutôt que de se taire', async () => {
    const texte = normaliser(texteDuPdf(await genererPdfRapport(contenu(), { compresser: false })));
    expect(texte).toContain('Avertissements techniques');
    expect(texte).toContain('n’a émis aucun avertissement');
  });

  it('reprend les remarques de traçabilité (version du moteur différente)', async () => {
    const pdf = await genererPdfRapport(
      contenu({
        calculs: [
          bloc({
            remarques: [
              'Ce calcul a été produit avec la version 0.9.0 du moteur, alors que la version en service est la 1.0.0.',
            ],
          }),
        ],
      }),
      { compresser: false },
    );
    expect(normaliser(texteDuPdf(pdf))).toContain('version 0.9.0 du moteur');
  });

  it('ne perd aucun avertissement même quand il y en a assez pour déborder d’une page', async () => {
    const nombreux = Array.from({ length: 60 }, (_, index) => ({
      code: `CONTROLE_${index}`,
      message: `Avertissement numéro ${index} — contrôle à mener sur le tronçon ${index} avant exécution des travaux de génie civil.`,
      gravite: (index % 2 === 0 ? 'attention' : 'info') as 'attention' | 'info',
    }));

    const pdf = await genererPdfRapport(
      contenu({ calculs: [bloc({ avertissements: nombreux })] }),
      { compresser: false },
    );
    const texte = normaliser(texteDuPdf(pdf));

    for (const avertissement of nombreux) {
      expect(texte).toContain(normaliser(avertissement.message));
    }
    // L'encadré s'est scindé proprement d'une page à l'autre.
    expect(texte).toContain('(suite)');
  });
});

// ===========================================================================
// 3. Un rapport long : plusieurs pages, en-têtes de tableau répétés
// ===========================================================================

describe('genererPdfRapport — rapport long', () => {
  /** Un calendrier climatique et une liste de tronçons : de quoi tenir sur 4 pages. */
  function blocVolumineux(): BlocCalcul {
    return bloc({
      id: 'bbbbbbbb-0000-4000-8000-000000000002',
      nom: 'Réseau de distribution',
      tableauxHypotheses: [
        {
          titre: 'Tronçons du réseau',
          colonnes: ['N°', 'Désignation', 'Longueur', 'Diamètre'],
          lignes: Array.from({ length: 150 }, (_, index) => [
            String(index + 1),
            `Tronçon aval n° ${index + 1} — béton lissé`,
            String(12.5 * (index + 1)),
            '160',
          ]),
        },
      ],
    });
  }

  it('s’étale sur plusieurs pages et répète les en-têtes de colonnes sur chacune', async () => {
    const pdf = await genererPdfRapport(
      contenu({ calculs: [blocVolumineux()] }),
      { compresser: false },
    );
    const pages = textesParPage(pdf).map(normaliser);

    expect(pages.length).toBeGreaterThanOrEqual(4);

    // Les pages qui portent des lignes du tableau portent aussi son en-tête.
    const pagesAvecLignes = pages.filter((page) => /Tronçon aval n° \d+/.test(page));
    expect(pagesAvecLignes.length).toBeGreaterThanOrEqual(3);
    for (const page of pagesAvecLignes) {
      expect(page).toContain('N° Désignation Longueur Diamètre');
    }
  });

  it('n’égare aucune ligne au passage d’une page à l’autre', async () => {
    const pdf = await genererPdfRapport(
      contenu({ calculs: [blocVolumineux()] }),
      { compresser: false },
    );
    const texte = normaliser(texteDuPdf(pdf));

    for (const rang of [1, 37, 74, 111, 150]) {
      expect(texte).toContain(`Tronçon aval n° ${rang} — béton lissé`);
    }
  });

  it('pagine correctement un document long : « Page n / total » sur chaque page', async () => {
    const pdf = await genererPdfRapport(
      contenu({ calculs: [blocVolumineux(), blocVolumineux()] }),
      { compresser: false },
    );
    const pages = textesParPage(pdf).map(normaliser);

    expect(nombreDePages(pdf)).toBe(pages.length);
    pages.forEach((page, index) => {
      expect(page).toContain(`Page ${index + 1} / ${pages.length}`);
    });
  });
});

// ===========================================================================
// 4. D-007 — le savoir-faire ne quitte pas le serveur
// ===========================================================================

/**
 * Ce bloc utilise le **vrai moteur**, sur un vrai module et une vraie table de
 * référence. C'est indispensable : le coefficient de Manning de la nature de
 * paroi « Canal de terre — pierreux, galets » vaut réellement 0,035 dans
 * `engine/tables/canaux.ts`. S'il fuyait dans le document, ce test le verrait.
 */
describe('D-007 — aucune formule ni coefficient métier dans le document', () => {
  const PROJET_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
  const OWNER_ID = '11111111-1111-4111-8111-000000000001';
  const CALCUL_ID = 'bbbbbbbb-0000-4000-8000-000000000009';

  const ENTREES = { qCible: 0.09, natureParoi: 'TERRE_PIERREUX', b: 0.3, m: 1, i: 0.001 };

  beforeEach(() => {
    const resultat = calculer('CANAL_MANNING', ENTREES);
    const ligne = {
      id: CALCUL_ID,
      project_id: PROJET_ID,
      module: 'CANAL_MANNING',
      inputs: ENTREES,
      results: resultat.resultats,
      engine_version: ENGINE_VERSION,
      computed_at: new Date(Date.UTC(2026, 7, 9, 8, 0, 0)),
    };
    mockGetProjectData.mockImplementation(async (id: string, projectId: string, ownerId: string) =>
      id === CALCUL_ID && projectId === PROJET_ID && ownerId === OWNER_ID ? ligne : null,
    );
    mockListProjectData.mockImplementation(async () => [ligne]);
  });

  async function documentReel(): Promise<string> {
    const calculs = await selectionnerCalculs({
      projectId: PROJET_ID,
      ownerId: OWNER_ID,
      calculIds: [CALCUL_ID],
    });
    expect(calculs).not.toBeNull();

    const contenuReel = await construireContenu({
      projet: {
        id: PROJET_ID,
        owner_id: OWNER_ID,
        name: 'Canal d’amenée — Ndiaye',
        client_name: 'SAED',
        location: 'Dagana',
        description: null,
        status: 'EN_COURS',
        created_at: GENERE_LE,
        updated_at: GENERE_LE,
        deleted_at: null,
      },
      auteur: { fullName: 'Aïssatou Bâ', company: null, email: 'a@b.sn' },
      reference: 'RAP-2026-0043',
      genereLe: GENERE_LE,
      calculs: calculs ?? [],
    });

    return normaliser(texteDuPdf(await genererPdfRapport(contenuReel, { compresser: false })));
  }

  it('affiche le libellé de la nature de paroi, jamais son coefficient', async () => {
    const texte = await documentReel();

    // Le libellé, lui, doit être là : c'est une hypothèse retenue.
    expect(texte).toContain('Canal de terre — pierreux, galets');
    // Le coefficient de Manning correspondant (0,035) ne doit apparaître nulle part.
    expect(texte).not.toContain('0,035');
    // Ni la clé technique, qui n'a aucun sens pour un client final.
    expect(texte).not.toContain('TERRE_PIERREUX');

    // ⚠ POINT SIGNALÉ AU LEAD, hors périmètre de ce fichier : le module
    //   CANAL_MANNING déclare « Coefficient de Strickler » parmi ses `sorties`,
    //   et Ks = 1 / n. Le document le reprend donc, comme il reprend tout
    //   résultat déclaré — et comme le fait déjà la réponse de
    //   `POST /api/calculs/:module` depuis la Vague 2. Ce n'est donc pas une
    //   fuite introduite par le rapport, mais la décision se prend dans le
    //   moteur : soit `n` cesse d'être un secret, soit `Ks` sort du catalogue
    //   des sorties. Le générateur suivra ce que le catalogue déclarera.
  });

  it('ne contient aucune écriture d’équation', async () => {
    const texte = await documentReel();

    for (const marqueur of [' = ', '√', '≈', '∑', 'Ks =', 'Q =', 'V =', '^(', '×']) {
      expect(texte).not.toContain(marqueur);
    }
  });

  it('ne contient ni prix, ni mention de licence (décision produit)', async () => {
    const texte = await documentReel().then((t) => t.toLowerCase());

    for (const interdit of [
      'licence',
      'abonnement',
      'facture',
      'tarif',
      'fcfa',
      'xof',
      '€',
      'prix',
    ]) {
      expect(texte).not.toContain(interdit);
    }
  });
});
