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
      {/* Hero Banner Administration avec Photo d'Ingénierie */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-950 shadow-overlay">
        <img
          src="/photos/bassin-stockage.jpg"
          alt="Bassin de stockage"
          className="pointer-events-none absolute inset-0 size-full object-cover filter brightness-110 contrast-105 opacity-60"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-950/90 via-emerald-950/70 to-transparent" />

        <div className="relative p-7 sm:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/30 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-emerald-200 backdrop-blur-md border border-emerald-400/30 shadow-sm">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Espace Administrateur
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-2xs font-medium text-white backdrop-blur-md border border-white/20">
              Supervision Système & Licences
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl drop-shadow-md">
                Accueil
              </h1>
              <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-emerald-100/90 sm:text-base drop-shadow">
                Suivez l'activité de vos clients, activez ou suspendez les accès en temps réel et contrôlez la sécurité globale.
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              icon={<UsersIcon />}
              onClick={() => void navigate('/comptes')}
              className="shadow-lg shadow-emerald-900/40"
            >
              Gérer les comptes
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
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
    <div className="rounded-xl border border-ink-200/80 bg-surface p-5 shadow-subtle transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised hover:border-emerald-500/30">
      <p className="text-2xs font-semibold uppercase tracking-[0.09em] text-ink-500">
        {libelle}
      </p>
      <p
        data-numeric
        className={cn(
          'mt-2.5 text-3xl font-bold tabular-nums tracking-tight',
          ton === 'success' && 'text-emerald-600',
          ton === 'danger' && 'text-danger',
          ton === 'neutre' && 'text-ink-900',
        )}
      >
        {valeur ?? <span className="inline-block h-7 w-12 rounded bg-ink-100 align-middle animate-pulse-soft" />}
      </p>
      {note && <p className="mt-1.5 text-xs text-ink-400">{note}</p>}
    </div>
  );
}
