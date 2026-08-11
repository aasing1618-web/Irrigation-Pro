/**
 * Liste des comptes clients — l'écran le plus consulté du dashboard.
 *
 * ## Ce qui doit sauter aux yeux
 *
 * Une seule information compte vraiment ici : **ce compte est-il actif ou
 * suspendu ?** C'est la question que le propriétaire se pose au téléphone,
 * pendant que son client attend. Elle est donc portée trois fois, de trois
 * façons différentes :
 *   - une pastille écrite en toutes lettres (« Actif » / « Suspendu ») ;
 *   - un liseré coloré sur toute la hauteur de la ligne, visible en périphérie ;
 *   - un fond légèrement teinté pour les lignes suspendues.
 * La couleur ne porte jamais l'information seule — le libellé écrit est
 * toujours là, pour qui ne distingue pas le rouge du vert.
 *
 * Un troisième état s'y ajoute, qui n'est pas un statut : le **verrou
 * anti-force-brute**. Un compte actif mais verrouillé pour un quart d'heure
 * produit exactement le même appel — « je ne peux plus me connecter » — et sans
 * cette mention, rien ne le distinguerait d'une suspension.
 *
 * ## Ce que fait le serveur, et ce que fait cet écran
 *
 * La recherche, le filtre par statut et la pagination sont **envoyés au
 * serveur** : c'est lui qui détient la liste. Cet écran n'en trie ni n'en
 * filtre aucune ligne de son côté.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CreationCompteDialog } from '../components/CreationCompteDialog';
import { EmptyState } from '../components/EmptyState';
import { SelectField, TextField } from '../components/Field';
import { MotDePasseTemporaire } from '../components/MotDePasseTemporaire';
import { PageHeader } from '../components/PageHeader';
import { LoadingRows, QueryError } from '../components/QueryStates';
import { StatusBadge } from '../components/StatusBadge';
import {
  BuildingIcon,
  ChevronRightIcon,
  FolderIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
} from '../components/icons';
import { useCreerCompte, useListeComptes } from '../hooks/useComptes';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { cn } from '../lib/cn';
import { formatRelativeDate, formatRemaining } from '../lib/format';
import {
  estVerrouille,
  ROLE_LABELS,
  STATUT_LABELS,
  type Compte,
  type ReponseCreation,
  type StatutCompte,
} from '../lib/comptes';

/** Nombre de comptes par page. */
const PAR_PAGE = 25;

type FiltreStatut = StatutCompte | 'TOUS';

const OPTIONS_STATUT = [
  { value: 'TOUS', label: 'Tous les statuts' },
  { value: 'ACTIF', label: 'Actifs seulement' },
  { value: 'SUSPENDU', label: 'Suspendus seulement' },
];

export function Comptes() {
  const navigate = useNavigate();

  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<FiltreStatut>('TOUS');
  const [page, setPage] = useState(0);
  const [creation, setCreation] = useState(false);
  /** Mot de passe fraîchement tiré, à remettre. Effacé dès la fenêtre fermée. */
  const [remise, setRemise] = useState<ReponseCreation | null>(null);

  const rechercheStabilisee = useDebouncedValue(recherche);

  // Changer de filtre remet en page 1 : sans cela, on cherche un nom, on se
  // retrouve « page 3 » d'un résultat qui n'en compte qu'une, et l'écran paraît
  // vide alors qu'il ne l'est pas.
  useEffect(() => {
    setPage(0);
  }, [rechercheStabilisee, statut]);

  const query = useListeComptes({
    recherche: rechercheStabilisee.trim() || undefined,
    statut: statut === 'TOUS' ? undefined : statut,
    limite: PAR_PAGE,
    depuis: page * PAR_PAGE,
  });

  const creer = useCreerCompte();

  const comptes = query.data?.comptes ?? [];
  const total = query.data?.total ?? 0;
  const filtrage = rechercheStabilisee.trim() !== '' || statut !== 'TOUS';
  const dernierePage = Math.max(0, Math.ceil(total / PAR_PAGE) - 1);

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title="Comptes clients"
        description="Créez les accès de vos clients, suspendez-les, réactivez-les. C’est ici que se règle tout ce qui touche à leur connexion."
        action={
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreation(true)}>
            Créer un compte
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <TextField
          label="Rechercher"
          type="search"
          value={recherche}
          onValueChange={setRecherche}
          placeholder="Nom, adresse e-mail ou société"
          autoComplete="off"
        />
        <SelectField
          label="Statut"
          value={statut}
          onValueChange={(valeur) => setStatut(valeur as FiltreStatut)}
          options={OPTIONS_STATUT}
        />
      </div>

      <Card flush>
        {query.isPending ? (
          <LoadingRows rows={6} label="Chargement des comptes" />
        ) : query.isError ? (
          <QueryError
            error={query.error}
            subject="les comptes"
            onRetry={() => void query.refetch()}
          />
        ) : comptes.length === 0 ? (
          filtrage ? (
            <EmptyState
              icon={<SearchIcon />}
              title="Aucun compte ne correspond"
              description="Essayez une autre orthographe, ou revenez à la liste complète."
              className="py-14"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRecherche('');
                    setStatut('TOUS');
                  }}
                >
                  Afficher tous les comptes
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<UsersIcon />}
              title="Aucun compte pour l’instant"
              description="Créez le premier compte client. Le serveur tirera un mot de passe temporaire que vous lui transmettrez — il devra le remplacer à sa première connexion."
              className="py-16"
              action={
                <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreation(true)}>
                  Créer un compte
                </Button>
              }
            />
          )
        ) : (
          <>
            <ul className="flex flex-col">
              {comptes.map((compte, index) => (
                <li key={compte.id}>
                  <LigneCompte
                    compte={compte}
                    premier={index === 0}
                    onOpen={() => void navigate(`/comptes/${compte.id}`)}
                  />
                </li>
              ))}
            </ul>

            <Pagination
              page={page}
              dernierePage={dernierePage}
              affiches={comptes.length}
              total={total}
              onPrecedent={() => setPage((valeur) => Math.max(0, valeur - 1))}
              onSuivant={() => setPage((valeur) => Math.min(dernierePage, valeur + 1))}
            />
          </>
        )}
      </Card>

      <CreationCompteDialog
        open={creation}
        submitting={creer.isPending}
        error={creer.error ?? null}
        onClose={() => {
          setCreation(false);
          creer.reset();
        }}
        onSubmit={(brouillon) => {
          creer.mutate(brouillon, {
            onSuccess: (reponse) => {
              setCreation(false);
              creer.reset();
              // Enchaînement immédiat : le mot de passe temporaire n'existe que
              // dans cette réponse, il ne doit pas attendre un second clic.
              setRemise(reponse);
            },
            // L'échec reste affiché dans le dialogue via `creer.error`, la
            // saisie est conservée : un `409` sur l'adresse se corrige sur place.
          });
        }}
      />

      {remise && (
        <MotDePasseTemporaire
          open
          origine="creation"
          email={remise.compte.email}
          nomComplet={remise.compte.nomComplet}
          motDePasse={remise.motDePasseTemporaire}
          // Le mot de passe quitte la mémoire du dashboard en même temps que la
          // fenêtre : il n'a aucune raison d'y rester une seconde de plus.
          onClose={() => setRemise(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Une ligne de compte.
 *
 * C'est un bouton, pas une ligne de tableau : elle s'atteint à la tabulation et
 * s'active à l'Entrée.
 */
function LigneCompte({
  compte,
  premier,
  onOpen,
}: {
  compte: Compte;
  premier: boolean;
  onOpen: () => void;
}) {
  const suspendu = compte.statut === 'SUSPENDU';
  const verrou = estVerrouille(compte) ? formatRemaining(compte.verrouilleJusqua) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group relative flex w-full items-center gap-4 py-4 pl-6 pr-5 text-left',
        'transition-colors duration-150 ease-out-quart',
        suspendu ? 'bg-danger-soft/40 hover:bg-danger-soft/70' : 'hover:bg-ink-50',
        !premier && 'border-t border-ink-100',
      )}
    >
      {/* Liseré pleine hauteur : la distinction se voit du coin de l'œil, avant
          même d'avoir lu quoi que ce soit. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          suspendu ? 'bg-danger' : 'bg-success/45',
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-md font-medium text-ink-900">
          <span className="truncate">{compte.nomComplet}</span>
          {compte.role === 'ADMIN' && (
            <span
              title={ROLE_LABELS.ADMIN}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-2xs font-medium text-ink-600"
            >
              <span aria-hidden="true">
                <ShieldIcon />
              </span>
              {ROLE_LABELS.ADMIN}
            </span>
          )}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
          <span className="truncate">{compte.email}</span>
          {compte.societe && (
            <span className="inline-flex items-center gap-1 truncate">
              <span aria-hidden="true" className="text-ink-400">
                <BuildingIcon />
              </span>
              {compte.societe}
            </span>
          )}
          {typeof compte.nombreProjets === 'number' && compte.nombreProjets > 0 && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="text-ink-400">
                <FolderIcon />
              </span>
              {compte.nombreProjets === 1 ? '1 projet' : `${compte.nombreProjets} projets`}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {verrou && (
          <span
            title="Verrouillage temporaire après plusieurs échecs de connexion"
            className="hidden items-center gap-1 text-xs text-warning md:inline-flex"
          >
            <span aria-hidden="true">
              <LockIcon />
            </span>
            Verrouillé {verrou}
          </span>
        )}

        <span className="hidden text-sm text-ink-400 lg:inline">
          Vu {formatRelativeDate(compte.derniereConnexion)}
        </span>

        <StatusBadge tone={suspendu ? 'danger' : 'success'}>
          {STATUT_LABELS[compte.statut]}
        </StatusBadge>

        <span
          aria-hidden="true"
          className="text-[1.125rem] text-ink-300 transition-colors duration-150 group-hover:text-ink-500"
        >
          <ChevronRightIcon />
        </span>
      </div>
    </button>
  );
}

/**
 * Pagination.
 *
 * Elle dit toujours où l'on est et combien il y a en tout : « 26–50 sur 63 ».
 * Deux boutons suffisent — on parcourt un carnet de clients, on ne saute pas à
 * la page 17.
 */
function Pagination({
  page,
  dernierePage,
  affiches,
  total,
  onPrecedent,
  onSuivant,
}: {
  page: number;
  dernierePage: number;
  affiches: number;
  total: number;
  onPrecedent: () => void;
  onSuivant: () => void;
}) {
  const premier = page * PAR_PAGE + 1;
  const dernier = page * PAR_PAGE + affiches;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-5 py-3">
      <p className="text-xs text-ink-500" data-numeric>
        {total <= affiches && page === 0
          ? `${total} compte${total > 1 ? 's' : ''}`
          : `Comptes ${premier} à ${dernier} sur ${total}`}
      </p>

      {dernierePage > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={onPrecedent}>
            Précédents
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= dernierePage}
            onClick={onSuivant}
          >
            Suivants
          </Button>
        </div>
      )}
    </div>
  );
}
