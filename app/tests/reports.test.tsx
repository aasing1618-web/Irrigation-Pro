/**
 * Les rapports PDF vus depuis la fiche projet — la livraison de la Vague 3 côté
 * application.
 *
 * Ces tests n'interagissent avec le logiciel que comme le ferait un ingénieur :
 * ils lisent l'écran, cliquent, cochent, confirment. Le serveur est simulé ;
 * aucun de ces tests n'a besoin du backend, ni d'un vrai PDF.
 *
 * ## Les deux doublures indispensables
 *
 * `URL.createObjectURL` / `URL.revokeObjectURL` n'existent pas dans jsdom : ils
 * sont installés ici, et c'est justement ce qui permet de **vérifier la
 * libération de l'URL objet** — la fuite de mémoire qu'un logiciel ouvert toute
 * la journée ne pardonne pas.
 *
 * Le clic sur le lien invisible est intercepté : au-delà, c'est la fenêtre
 * « Enregistrer sous » du système, qui n'appartient plus à l'application.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { login, resetAuthStoreForTests } from '../src/lib/auth-store';
import {
  CLIENT_USER,
  FAKE_CATALOGUE,
  PROJECT_NDIAYE,
  SESSION_TOKENS,
  errorResponse,
  jsonResponse,
  mockApi,
  pdfResponse,
  renderWorkspace,
  type MockHandler,
} from './helpers';

const LONG_WAIT = { timeout: 4000 };

const FICHE = `/projets/${PROJECT_NDIAYE.id}`;

/** Un calcul archivé : sans lui, aucun rapport n'est possible. */
const CALCUL_ARCHIVE = {
  id: 'cccccccc-3333-4333-8333-cccccccccccc',
  module: 'MODULE_FICTIF',
  entrees: { superficie: 120, culture: 'RIZ' },
  resultats: { besoinBrut: 1284.5, coefficient: 1.15 },
  avertissements: [],
  engineVersion: '1.0.0',
  calculeLe: '2026-08-06T10:30:00.000Z',
};

/** Un rapport déjà produit, tel que le serveur le décrit (contrat § 1). */
const RAPPORT = {
  id: 'dddddddd-4444-4444-8444-dddddddddddd',
  reference: 'RAP-2026-0042',
  genereLe: '2026-08-10T09:15:00.000Z',
  nombreCalculs: 1,
  fichierDisponible: true,
};

const ROUTE_LISTE = `GET /api/projects/${PROJECT_NDIAYE.id}/reports`;
const ROUTE_GENERATION = `POST /api/projects/${PROJECT_NDIAYE.id}/reports`;
const ROUTE_FICHIER = `GET /api/reports/${RAPPORT.id}/fichier`;
const ROUTE_SUPPRESSION = `DELETE /api/reports/${RAPPORT.id}`;

/** L'URL objet que la doublure de `createObjectURL` renvoie. */
const URL_OBJET = 'blob:http://localhost/rapport-de-test';

let creerUrlObjet: ReturnType<typeof vi.fn>;
let libererUrlObjet: ReturnType<typeof vi.fn>;
let lienDeclenche: { href: string; download: string } | null;

beforeEach(() => {
  resetAuthStoreForTests();

  creerUrlObjet = vi.fn(() => URL_OBJET);
  libererUrlObjet = vi.fn();
  URL.createObjectURL = creerUrlObjet as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = libererUrlObjet as unknown as typeof URL.revokeObjectURL;

  lienDeclenche = null;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    lienDeclenche = { href: this.href, download: this.download };
  });
});

afterEach(() => {
  delete (URL as Partial<typeof URL>).createObjectURL;
  delete (URL as Partial<typeof URL>).revokeObjectURL;
});

/**
 * Le faux serveur d'une fiche projet complète.
 *
 * Par défaut : un calcul archivé, aucun rapport. Chaque test ne redéclare que
 * ce qui le concerne.
 */
function mockFicheProjet(
  options: { calculs?: unknown[]; extra?: Record<string, MockHandler> } = {},
) {
  const calculs = options.calculs ?? [CALCUL_ARCHIVE];

  mockApi({
    [`GET /api/projects/${PROJECT_NDIAYE.id}`]: () =>
      jsonResponse({ projet: { ...PROJECT_NDIAYE, calculs } }),
    [`GET /api/projects/${PROJECT_NDIAYE.id}/calculs`]: () => jsonResponse({ calculs }),
    'GET /api/calculs/modules': () => jsonResponse(FAKE_CATALOGUE),
    [ROUTE_LISTE]: () => jsonResponse({ rapports: [] }),
    ...options.extra,
  });
}

/** Ouvre la fenêtre de préparation depuis la fiche projet. */
async function ouvrirLaPreparation(): Promise<HTMLElement> {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Générer un rapport' }, LONG_WAIT),
  );
  return screen.findByRole('dialog', {}, LONG_WAIT);
}

/* -------------------------------------------------------------------------- */

describe('génération d’un rapport', () => {
  it('produit le document et le fait apparaître dans la liste, avec sa référence', async () => {
    let rapports: unknown[] = [];
    const envoye: Record<string, unknown>[] = [];

    mockFicheProjet({
      extra: {
        [ROUTE_LISTE]: () => jsonResponse({ rapports }),
        [ROUTE_GENERATION]: ({ body }) => {
          envoye.push(body);
          rapports = [RAPPORT];
          return jsonResponse(
            {
              rapport: {
                id: RAPPORT.id,
                reference: RAPPORT.reference,
                genereLe: RAPPORT.genereLe,
              },
            },
            { status: 201 },
          );
        },
      },
    });

    renderWorkspace(FICHE);

    const dialog = await ouvrirLaPreparation();
    fireEvent.change(within(dialog).getByLabelText(/Notes/), {
      target: { value: 'Hypothèses validées sur site le 6 août.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Générer le rapport' }));

    // La référence attribuée par le serveur est le repère du document remis.
    expect(await screen.findByText('RAP-2026-0042', {}, LONG_WAIT)).toBeDefined();
    expect(screen.getByText(/1 calcul/)).toBeDefined();

    // La sélection par défaut est le dernier calcul de chaque module, et les
    // notes partent telles qu'elles ont été saisies.
    expect(envoye).toHaveLength(1);
    expect(envoye[0]).toEqual({
      calculIds: [CALCUL_ARCHIVE.id],
      notes: 'Hypothèses validées sur site le 6 août.',
    });
  });

  it('neutralise le bouton et l’explique quand le projet n’a aucun calcul archivé', async () => {
    const genere = vi.fn();

    mockFicheProjet({
      calculs: [],
      extra: {
        [ROUTE_GENERATION]: () => {
          genere();
          return jsonResponse({ rapport: RAPPORT }, { status: 201 });
        },
      },
    });

    renderWorkspace(FICHE);

    const bouton = await screen.findByRole('button', { name: 'Générer un rapport' }, LONG_WAIT);
    expect(bouton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Archivez d’abord un calcul/)).toBeDefined();

    fireEvent.click(bouton);

    // Ni fenêtre, ni requête : le refus du serveur est connu d'avance.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(genere).not.toHaveBeenCalled();
  });

  it('affiche mot pour mot le refus du serveur', async () => {
    const refus =
      'Ce projet ne contient encore aucun calcul : lancez au moins un module avant de générer un rapport.';

    mockFicheProjet({
      extra: {
        [ROUTE_GENERATION]: () => errorResponse(400, 'VALIDATION_ERROR', refus),
      },
    });

    renderWorkspace(FICHE);

    const dialog = await ouvrirLaPreparation();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Générer le rapport' }));

    expect(await screen.findByText(refus, {}, LONG_WAIT)).toBeDefined();
    // La fenêtre reste ouverte : l'utilisateur peut corriger sa sélection.
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('ne produit qu’un seul rapport quand on clique deux fois sur « Générer »', async () => {
    let libererLeServeur: () => void = () => {};
    const attente = new Promise<void>((resolve) => {
      libererLeServeur = resolve;
    });

    let rapports: unknown[] = [];
    const appels: string[] = [];

    mockFicheProjet({
      extra: {
        [ROUTE_LISTE]: () => jsonResponse({ rapports }),
        [ROUTE_GENERATION]: async () => {
          appels.push('génération');
          // Le serveur met un instant : c'est exactement la fenêtre pendant
          // laquelle un second clic produirait un doublon sous une autre
          // référence, impossible à distinguer ensuite.
          await attente;
          rapports = [RAPPORT];
          return jsonResponse({ rapport: RAPPORT }, { status: 201 });
        },
      },
    });

    renderWorkspace(FICHE);

    const dialog = await ouvrirLaPreparation();
    const bouton = within(dialog).getByRole('button', { name: 'Générer le rapport' });

    fireEvent.click(bouton);
    fireEvent.click(bouton);

    // Une seule requête part, et le second clic n'en met aucune en attente : le
    // serveur est encore bloqué à ce stade.
    await waitFor(() => expect(appels).toHaveLength(1), LONG_WAIT);

    libererLeServeur();

    expect(await screen.findByText('RAP-2026-0042', {}, LONG_WAIT)).toBeDefined();
    expect(appels).toHaveLength(1);
    // Un seul rapport dans la liste, donc une seule référence remise au client.
    expect(screen.getAllByText('RAP-2026-0042')).toHaveLength(1);
  });
});

describe('téléchargement d’un rapport', () => {
  it('rapatrie le PDF avec le jeton d’accès, puis libère l’URL objet', async () => {
    const entetes: Record<string, string>[] = [];

    mockFicheProjet({
      extra: {
        [ROUTE_LISTE]: () => jsonResponse({ rapports: [RAPPORT] }),
        'POST /api/auth/login': () => jsonResponse({ ...SESSION_TOKENS, user: CLIENT_USER }),
        [ROUTE_FICHIER]: ({ headers }) => {
          entetes.push(headers);
          return pdfResponse();
        },
      },
    });

    // Une session ouverte : sans elle, la requête partirait sans en-tête et le
    // serveur refuserait le fichier.
    await login(CLIENT_USER.email, 'un-mot-de-passe-solide');

    renderWorkspace(FICHE);

    fireEvent.click(await screen.findByRole('button', { name: 'Télécharger' }, LONG_WAIT));

    await waitFor(() => expect(entetes).toHaveLength(1), LONG_WAIT);

    // Une balise <a href> ne porterait pas cet en-tête : c'est toute la raison
    // du détour par le client HTTP authentifié.
    expect(entetes[0].Authorization).toBe(`Bearer ${SESSION_TOKENS.accessToken}`);

    // Le fichier proposé porte la référence : on le retrouve dans un dossier
    // de téléchargements sans l'ouvrir.
    await waitFor(() => expect(lienDeclenche).not.toBeNull(), LONG_WAIT);
    expect(lienDeclenche?.href).toBe(URL_OBJET);
    expect(lienDeclenche?.download).toContain('RAP-2026-0042');

    // Et surtout : l'URL objet est relâchée. Sans cela, chaque téléchargement
    // laisserait son PDF en mémoire jusqu'à la fermeture du logiciel.
    expect(creerUrlObjet).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(libererUrlObjet).toHaveBeenCalledWith(URL_OBJET), LONG_WAIT);
  });

  it('grise le téléchargement quand le fichier n’est plus sur le serveur, et le dit', async () => {
    mockFicheProjet({
      extra: {
        [ROUTE_LISTE]: () =>
          jsonResponse({ rapports: [{ ...RAPPORT, fichierDisponible: false }] }),
      },
    });

    renderWorkspace(FICHE);

    const bouton = await screen.findByRole('button', { name: 'Télécharger' }, LONG_WAIT);
    expect(bouton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/n’est plus disponible sur le serveur/)).toBeDefined();

    fireEvent.click(bouton);

    // Aucune requête : la route du fichier n'est même pas simulée dans ce test,
    // un appel échouerait bruyamment.
    expect(creerUrlObjet).not.toHaveBeenCalled();
  });
});

describe('suppression d’un rapport', () => {
  it('n’appelle le serveur qu’après confirmation, et retire la ligne', async () => {
    const supprime = vi.fn();
    let rapports: unknown[] = [RAPPORT];

    mockFicheProjet({
      extra: {
        [ROUTE_LISTE]: () => jsonResponse({ rapports }),
        [ROUTE_SUPPRESSION]: () => {
          supprime();
          rapports = [];
          return jsonResponse(null, { status: 204 });
        },
      },
    });

    renderWorkspace(FICHE);

    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Supprimer le rapport RAP-2026-0042' },
        LONG_WAIT,
      ),
    );

    const dialog = await screen.findByRole('dialog', {}, LONG_WAIT);
    // La référence est rappelée : c'est le seul repère fiable devant plusieurs
    // rapports d'un même projet.
    expect(within(dialog).getByText('RAP-2026-0042')).toBeDefined();
    expect(supprime).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(supprime).toHaveBeenCalledTimes(1), LONG_WAIT);
    await waitFor(() => expect(screen.queryByText('RAP-2026-0042')).toBeNull(), LONG_WAIT);
  });

  it('affiche le message du serveur quand il refuse la suppression', async () => {
    mockFicheProjet({
      extra: {
        [ROUTE_LISTE]: () => jsonResponse({ rapports: [RAPPORT] }),
        [ROUTE_SUPPRESSION]: () =>
          errorResponse(404, 'NOT_FOUND', 'Ce rapport est introuvable.'),
      },
    });

    renderWorkspace(FICHE);

    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Supprimer le rapport RAP-2026-0042' },
        LONG_WAIT,
      ),
    );

    const dialog = await screen.findByRole('dialog', {}, LONG_WAIT);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByText('Ce rapport est introuvable.', {}, LONG_WAIT)).toBeDefined();
  });
});
