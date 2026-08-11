/**
 * Accueil du dashboard.
 *
 * Le propriétaire ouvre cet outil pour une raison précise — créer un compte,
 * en suspendre un, comprendre pourquoi un client dit qu'il n'arrive plus à se
 * connecter. Cet écran répond à la dernière question sans qu'il ait à chercher,
 * et donne l'accès direct aux deux premières.
 *
 * Trois chiffres, pas dix : combien de comptes actifs, combien de suspendus,
 * combien de connexions aujourd'hui. Les deux premiers viennent du serveur
 * (`statistiques`), le troisième est compté sur le journal reçu — le contrat
 * ne fournit pas ce compteur, et l'inventer côté serveur n'était pas à faire
 * ici. La mention « sur les dernières entrées » dit honnêtement d'où il sort
 * plutôt que de laisser croire à un total exact.
 *
 * Aucun graphique, aucune décoration : ce n'est pas une vitrine, c'est un
 * poste de travail qu'on ouvre trente secondes.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { Card } from '../components/Card';
import { JournalActivite } from '../components/JournalActivite';
import { PageHeader } from '../components/PageHeader';
import { LoadingRows, QueryError } from '../components/QueryStates';
import { Button } from '../components/Button';
import { UsersIcon } from '../components/icons';
import { useActiviteRecente } from '../hooks/useComptes';
import { cn } from '../lib/cn';
import { formatCount, isToday } from '../lib/format';

export function Accueil() {
  const navigate = useNavigate();
  const query = useActiviteRecente();

  const connexionsDuJour = useMemo(() => {
    const activites = query.data?.activites ?? [];
    return activites.filter(
      (entree) => entree.action === 'LOGIN_SUCCESS' && isToday(entree.dateHeure),
    ).length;
  }, [query.data]);

  const stats = query.data?.statistiques;

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title="Accueil"
        description="L’état de vos comptes clients et ce qui s’est passé récemment."
        action={
          <Button
            variant="primary"
            icon={<UsersIcon />}
            onClick={() => void navigate('/comptes')}
          >
            Gérer les comptes
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Chiffre
          libelle="Comptes actifs"
          valeur={stats ? formatCount(stats.comptesActifs) : null}
          ton="success"
        />
        <Chiffre
          libelle="Comptes suspendus"
          valeur={stats ? formatCount(stats.comptesSuspendus) : null}
          ton={stats && stats.comptesSuspendus > 0 ? 'danger' : 'neutre'}
        />
        <Chiffre
          libelle="Connexions aujourd’hui"
          valeur={query.data ? formatCount(connexionsDuJour) : null}
          ton="neutre"
          note="sur les dernières entrées du journal"
        />
      </div>

      <Card
        title="Activité récente"
        description="Connexions, échecs de connexion et décisions d’administration, tous comptes confondus."
        flush
      >
        {query.isPending ? (
          <LoadingRows rows={6} label="Chargement de l’activité" />
        ) : query.isError ? (
          <QueryError
            error={query.error}
            subject="l’activité récente"
            onRetry={() => void query.refetch()}
          />
        ) : (
          <JournalActivite
            activites={query.data.activites}
            actionsAdmin={query.data.actionsAdmin}
            limite={30}
          />
        )}
      </Card>
    </div>
  );
}

/**
 * Un chiffre et son libellé.
 *
 * La couleur ne porte jamais seule l'information : le libellé écrit dit déjà
 * de quoi il s'agit. Le rouge n'apparaît que s'il y a réellement au moins un
 * compte suspendu — un « 0 » rouge attirerait l'œil pour rien.
 */
function Chiffre({
  libelle,
  valeur,
  ton,
  note,
}: {
  libelle: string;
  valeur: string | null;
  ton: 'success' | 'danger' | 'neutre';
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-surface p-4 shadow-subtle">
      <p className="text-2xs font-semibold uppercase tracking-[0.09em] text-ink-500">
        {libelle}
      </p>
      <p
        data-numeric
        className={cn(
          'mt-2 text-2xl font-semibold tabular-nums',
          ton === 'success' && 'text-success',
          ton === 'danger' && 'text-danger',
          ton === 'neutre' && 'text-ink-900',
        )}
      >
        {valeur ?? <span className="inline-block h-6 w-10 rounded-xs bg-ink-100 align-middle animate-pulse-soft" />}
      </p>
      {note && <p className="mt-1 text-xs text-ink-400">{note}</p>}
    </div>
  );
}
