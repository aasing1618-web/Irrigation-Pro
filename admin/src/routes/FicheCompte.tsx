/**
 * Fiche d'un compte : tout ce que le dashboard sait de lui, et les trois seules
 * actions qu'il permet.
 *
 * ## Ce que cet écran montre
 *
 * Ses informations, sa dernière connexion, son nombre de projets — **un
 * compteur, jamais leur contenu** — le verrou anti-force-brute s'il y en a un,
 * et son historique d'activité.
 *
 * Il n'y a **aucun moyen d'ouvrir un projet, un calcul ou un rapport de ce
 * client**. L'API n'en offre aucun, délibérément : la confidentialité des
 * études de vos clients est un argument commercial, pas une limite qu'on
 * contourne « pour le support ».
 *
 * ## Les trois actions
 *
 * Suspendre, réactiver, réinitialiser le mot de passe. Chacune passe par une
 * confirmation qui rappelle ses conséquences en toutes lettres ; les deux
 * premières exigent un motif, qui part au journal.
 *
 * Certains refus ne peuvent être prononcés que par le serveur — « vous ne
 * pouvez pas suspendre votre propre compte », « ce compte est le dernier
 * administrateur actif ». Ils reviennent en `409 ACTION_IMPOSSIBLE` avec un
 * message qui explique *pourquoi*, et ce message est affiché **tel quel**. Le
 * dashboard ne réimplémente aucune de ces règles : il en afficherait sa propre
 * version, qui finirait par diverger de la vraie.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmationAction } from '../components/ConfirmationAction';
import { FormAlert } from '../components/FormAlert';
import { JournalActivite } from '../components/JournalActivite';
import { MotDePasseTemporaire } from '../components/MotDePasseTemporaire';
import { LoadingRows, QueryError } from '../components/QueryStates';
import { StatusBadge } from '../components/StatusBadge';
import {
  AlertIcon,
  ArrowLeftIcon,
  BanIcon,
  CheckIcon,
  KeyIcon,
  LockIcon,
  UnlockIcon,
} from '../components/icons';
import {
  useActiviteCompte,
  useReactiverCompte,
  useReinitialiserMotDePasse,
  useSuspendreCompte,
} from '../hooks/useComptes';
import { cn } from '../lib/cn';
import { formatDate, formatDateTime, formatRemaining } from '../lib/format';
import {
  estVerrouille,
  ROLE_LABELS,
  STATUT_LABELS,
  type Compte,
} from '../lib/comptes';

/** Laquelle des trois actions est en cours de confirmation. */
type ActionOuverte = 'suspendre' | 'reactiver' | 'reinitialiser' | null;

export function FicheCompte() {
  const { compteId } = useParams<{ compteId: string }>();
  const navigate = useNavigate();

  const query = useActiviteCompte(compteId);

  const [action, setAction] = useState<ActionOuverte>(null);
  /** Mot de passe fraîchement tiré, à remettre. Effacé dès la fenêtre fermée. */
  const [motDePasse, setMotDePasse] = useState<string | null>(null);
  /** Confirmation discrète après une action réussie. */
  const [succes, setSucces] = useState<string | null>(null);

  const suspendre = useSuspendreCompte(compteId ?? '');
  const reactiver = useReactiverCompte(compteId ?? '');
  const reinitialiser = useReinitialiserMotDePasse(compteId ?? '');

  function fermer() {
    setAction(null);
    suspendre.reset();
    reactiver.reset();
    reinitialiser.reset();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-8 py-4 sm:py-7">
      <button
        type="button"
        onClick={() => void navigate('/comptes')}
        className="mb-5 inline-flex items-center gap-1.5 rounded-xs text-sm text-ink-500 transition-colors duration-150 hover:text-ink-800"
      >
        <span aria-hidden="true">
          <ArrowLeftIcon />
        </span>
        Tous les comptes
      </button>

      {query.isPending ? (
        <Card flush>
          <LoadingRows rows={5} label="Chargement du compte" />
        </Card>
      ) : query.isError ? (
        <Card flush>
          <QueryError
            error={query.error}
            subject="ce compte"
            onRetry={() => void query.refetch()}
          />
        </Card>
      ) : (
        <>
          <EnTeteCompte compte={query.data.compte} />

          {succes && (
            <FormAlert tone="success" icon={<CheckIcon />} className="mb-5">
              {succes}
            </FormAlert>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="flex flex-col gap-5 lg:order-2">
              <Card title="Actions">
                <Actions
                  compte={query.data.compte}
                  onDemander={(demandee) => {
                    setSucces(null);
                    setAction(demandee);
                  }}
                />
              </Card>

              <Card title="Informations">
                <Informations compte={query.data.compte} />
              </Card>
            </div>

            <Card
              className="lg:order-1"
              title="Historique"
              description="Ce que ce compte a fait, et ce qui a été décidé à son sujet."
              flush
            >
              <JournalActivite
                activites={query.data.activites}
                actionsAdmin={query.data.actionsAdmin}
                emptyDescription="Ce compte n’a encore aucune activité enregistrée. Il n’a probablement jamais ouvert l’application."
              />
            </Card>
          </div>

          {/* --- Les trois confirmations ------------------------------------ */}

          <ConfirmationAction
            open={action === 'suspendre'}
            title={`Suspendre le compte de ${query.data.compte.nomComplet}`}
            consequences={
              <>
                <strong className="font-semibold text-ink-900">
                  Ses sessions en cours seront fermées immédiatement.
                </strong>{' '}
                S’il travaille en ce moment, il sera déconnecté sans préavis. Il ne
                pourra plus se connecter tant que vous ne l’aurez pas réactivé. Ses
                projets et ses calculs sont conservés intacts.
              </>
            }
            confirmLabel="Suspendre le compte"
            tone="danger"
            motifRequis
            submitting={suspendre.isPending}
            error={suspendre.error ?? null}
            onClose={fermer}
            onConfirm={(motif) => {
              suspendre.mutate(motif, {
                onSuccess: (reponse) => {
                  fermer();
                  setSucces(
                    reponse.sessionsRevoquees
                      ? `Compte suspendu. ${reponse.sessionsRevoquees} session${reponse.sessionsRevoquees > 1 ? 's ont été fermées' : ' a été fermée'}.`
                      : 'Compte suspendu. Aucune session n’était ouverte.',
                  );
                },
              });
            }}
          />

          <ConfirmationAction
            open={action === 'reactiver'}
            title={`Réactiver le compte de ${query.data.compte.nomComplet}`}
            consequences={
              <>
                Il pourra de nouveau se connecter avec son mot de passe habituel.
                Le compteur de tentatives échouées est remis à zéro et le
                verrouillage éventuel est levé. Ses sessions ne sont pas
                rouvertes&nbsp;: il devra se reconnecter, ce qui est normal après une
                coupure.
              </>
            }
            confirmLabel="Réactiver le compte"
            tone="primary"
            motifRequis
            submitting={reactiver.isPending}
            error={reactiver.error ?? null}
            onClose={fermer}
            onConfirm={(motif) => {
              reactiver.mutate(motif, {
                onSuccess: () => {
                  fermer();
                  setSucces('Compte réactivé. Il peut de nouveau se connecter.');
                },
              });
            }}
          />

          <ConfirmationAction
            open={action === 'reinitialiser'}
            title={`Réinitialiser le mot de passe de ${query.data.compte.nomComplet}`}
            consequences={
              <>
                <strong className="font-semibold text-ink-900">
                  Son mot de passe actuel cessera de fonctionner et toutes ses
                  sessions seront fermées.
                </strong>{' '}
                Un nouveau mot de passe temporaire vous sera affiché{' '}
                <strong className="font-semibold text-ink-900">une seule fois</strong>{' '}
                : il faudra le lui transmettre pour qu’il puisse se reconnecter.
              </>
            }
            confirmLabel="Réinitialiser le mot de passe"
            tone="danger"
            // Le contrat ne prévoit pas de motif sur cette route (§ 4) : on n'en
            // invente pas un pour faire symétrique.
            motifRequis={false}
            submitting={reinitialiser.isPending}
            error={reinitialiser.error ?? null}
            onClose={fermer}
            onConfirm={() => {
              reinitialiser.mutate(undefined, {
                onSuccess: (reponse) => {
                  fermer();
                  setMotDePasse(reponse.motDePasseTemporaire);
                },
              });
            }}
          />

          {motDePasse && (
            <MotDePasseTemporaire
              open
              origine="reinitialisation"
              email={query.data.compte.email}
              nomComplet={query.data.compte.nomComplet}
              motDePasse={motDePasse}
              onClose={() => {
                setMotDePasse(null);
                setSucces(
                  'Mot de passe réinitialisé. Ce compte devra le remplacer à sa prochaine connexion.',
                );
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EnTeteCompte({ compte }: { compte: Compte }) {
  const suspendu = compte.statut === 'SUSPENDU';
  const verrou = estVerrouille(compte) ? formatRemaining(compte.verrouilleJusqua) : null;

  return (
    <header className="pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink-900">
            {compte.nomComplet}
          </h1>
          <p className="mt-1.5 text-base text-ink-500">
            {compte.email}
            {compte.societe && ` · ${compte.societe}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {compte.role === 'ADMIN' && (
            <StatusBadge tone="neutral">{ROLE_LABELS.ADMIN}</StatusBadge>
          )}
          <StatusBadge tone={suspendu ? 'danger' : 'success'}>
            {STATUT_LABELS[compte.statut]}
          </StatusBadge>
        </div>
      </div>

      {/* Le verrou anti-force-brute est une information de DÉPANNAGE, pas un
          statut. C'est elle qui répond à « je ne peux plus me connecter » quand
          le compte est pourtant actif. */}
      {verrou && (
        <FormAlert tone="warning" title="Connexion temporairement verrouillée" icon={<LockIcon />} className="mt-4">
          Ce compte est <strong className="font-semibold">actif</strong>, mais bloqué{' '}
          {verrou} après plusieurs mots de passe erronés. Le blocage se lève seul —
          il n’y a rien à faire. Pour l’enlever tout de suite, réactivez le compte.
        </FormAlert>
      )}

      {compte.doitChangerMotDePasse && !verrou && (
        <FormAlert tone="neutral" icon={<KeyIcon />} className="mt-4">
          Ce compte utilise encore un mot de passe temporaire. Il devra le
          remplacer à sa prochaine connexion.
        </FormAlert>
      )}
    </header>
  );
}

function Informations({ compte }: { compte: Compte }) {
  return (
    <dl className="flex flex-col gap-3.5 text-sm">
      <Info libelle="Dernière connexion" valeur={formatDateTime(compte.derniereConnexion)} />
      <Info libelle="Compte créé le" valeur={formatDate(compte.creeLe)} />
      <Info
        libelle="Projets"
        valeur={
          typeof compte.nombreProjets === 'number'
            ? String(compte.nombreProjets)
            : '—'
        }
        note="Leur contenu n’est jamais accessible depuis l’administration."
      />
      <Info libelle="Rôle" valeur={ROLE_LABELS[compte.role]} />
      {compte.verrouilleJusqua && (
        <Info
          libelle="Verrouillé jusqu’à"
          valeur={formatDateTime(compte.verrouilleJusqua)}
          note="Verrouillage automatique après plusieurs échecs de connexion."
        />
      )}
    </dl>
  );
}

function Info({
  libelle,
  valeur,
  note,
}: {
  libelle: string;
  valeur: string;
  note?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{libelle}</dt>
      <dd className="mt-0.5 text-ink-900" data-numeric>
        {valeur}
      </dd>
      {note && <p className="mt-0.5 text-xs text-ink-400">{note}</p>}
    </div>
  );
}

/**
 * Les trois actions.
 *
 * « Suspendre » et « Réactiver » ne s'affichent jamais ensemble : proposer de
 * suspendre un compte déjà suspendu n'a pas de sens, et laisser les deux
 * boutons côte à côte invite à cliquer sur le mauvais.
 */
function Actions({
  compte,
  onDemander,
}: {
  compte: Compte;
  onDemander: (action: Exclude<ActionOuverte, null>) => void;
}) {
  const suspendu = compte.statut === 'SUSPENDU';

  return (
    <div className="flex flex-col gap-2.5">
      {suspendu ? (
        <Button
          variant="primary"
          icon={<UnlockIcon />}
          className="w-full"
          onClick={() => onDemander('reactiver')}
        >
          Réactiver le compte
        </Button>
      ) : (
        <Button
          variant="secondary"
          icon={<BanIcon />}
          className={cn(
            'w-full border-danger-border bg-danger-soft text-danger',
            'hover:bg-danger-soft/70 hover:border-danger',
          )}
          onClick={() => onDemander('suspendre')}
        >
          Suspendre le compte
        </Button>
      )}

      <Button
        variant="secondary"
        icon={<KeyIcon />}
        className="w-full"
        onClick={() => onDemander('reinitialiser')}
      >
        Réinitialiser le mot de passe
      </Button>

      <p className="mt-1 flex gap-2 text-xs leading-relaxed text-ink-500">
        <span aria-hidden="true" className="mt-px shrink-0 text-ink-400">
          <AlertIcon />
        </span>
        Ces trois actions ferment les sessions ouvertes du compte et sont
        enregistrées dans le journal, avec leur motif.
      </p>
    </div>
  );
}
