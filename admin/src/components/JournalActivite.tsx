/**
 * Journal d'activité.
 *
 * Deux sources, deux natures :
 *   - `activity_logs` — ce que les **comptes** ont fait (connexions, échecs,
 *     projets, rapports) ;
 *   - `admin_actions` — ce qui a été **décidé** à leur sujet, par vous.
 *
 * Elles sont fondues en une seule liste chronologique, parce que c'est ainsi
 * qu'on lit une histoire : « le 3, il n'arrive plus à se connecter ; le 4, j'ai
 * réinitialisé son mot de passe ». Deux tableaux côte à côte obligeraient à
 * faire cette couture de tête.
 *
 * Les codes techniques sont traduits (`lib/comptes.ts`) : le propriétaire n'est
 * pas développeur, « LOGIN_BLOCKED_SUSPENDED » ne lui dit rien. Un code inconnu,
 * ajouté par une vague ultérieure, est affiché tel quel plutôt que masqué :
 * mieux vaut un libellé technique qu'une ligne qui disparaît.
 *
 * ⚠ Aucun contenu de projet n'apparaît jamais ici — tout au plus le nom d'une
 *   action. Le dashboard gère des comptes, pas des données métier.
 */

import { useMemo } from 'react';

import { cn } from '../lib/cn';
import { dayKey, formatDate, formatTime } from '../lib/format';
import {
  activiteEstAlerte,
  libelleActionAdmin,
  libelleActivite,
  type ActionAdmin,
  type EntreeActivite,
} from '../lib/comptes';
import { EmptyState } from './EmptyState';
import { JournalIcon, ShieldIcon } from './icons';

/** Une ligne du journal, quelle que soit sa source. */
interface Ligne {
  cle: string;
  dateHeure: string;
  libelle: string;
  /** Décision d'administration : signalée par un liseré et une icône. */
  decision: boolean;
  alerte: boolean;
  /** Détail secondaire : motif, adresse IP, e-mail concerné. */
  detail: string | null;
  /** Nom du compte concerné, si le journal en couvre plusieurs. */
  compte?: string | null;
}

export interface JournalActiviteProps {
  activites: EntreeActivite[];
  actionsAdmin: ActionAdmin[];
  /** Résout un identifiant de compte en nom lisible (page d'accueil). */
  nommerCompte?: (id: string | null) => string | null;
  /** Limite d'affichage — le journal complet n'est jamais utile d'un coup. */
  limite?: number;
  emptyDescription?: string;
}

export function JournalActivite({
  activites,
  actionsAdmin,
  nommerCompte,
  limite = 40,
  emptyDescription = 'Les connexions, les échecs et les décisions d’administration apparaîtront ici.',
}: JournalActiviteProps) {
  const lignes = useMemo(
    () => fusionner(activites, actionsAdmin, nommerCompte).slice(0, limite),
    [activites, actionsAdmin, nommerCompte, limite],
  );

  if (lignes.length === 0) {
    return (
      <EmptyState
        icon={<JournalIcon />}
        title="Aucune activité enregistrée"
        description={emptyDescription}
        className="py-10"
      />
    );
  }

  // Regroupement par jour : sans lui, une colonne de dates complètes se répète
  // quarante fois et l'œil ne trouve plus les ruptures.
  const jours = grouperParJour(lignes);

  return (
    <div className="flex flex-col">
      {jours.map(([jour, lignesDuJour]) => (
        <section key={jour}>
          <h3 className="border-b border-ink-100 bg-surface-sunken px-5 py-2 text-2xs font-semibold uppercase tracking-[0.09em] text-ink-500">
            {formatDate(lignesDuJour[0].dateHeure)}
          </h3>
          <ul>
            {lignesDuJour.map((ligne) => (
              <li
                key={ligne.cle}
                className="flex items-start gap-3 border-b border-ink-100 px-5 py-2.5 last:border-b-0"
              >
                <time
                  dateTime={ligne.dateHeure}
                  className="w-12 shrink-0 pt-px text-xs text-ink-400"
                >
                  {formatTime(ligne.dateHeure)}
                </time>

                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1 size-1.5 shrink-0 rounded-full',
                    ligne.alerte ? 'bg-danger' : ligne.decision ? 'bg-brand-500' : 'bg-ink-300',
                  )}
                />

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm',
                      ligne.alerte ? 'font-medium text-danger' : 'text-ink-800',
                    )}
                  >
                    {ligne.decision && (
                      <span
                        aria-hidden="true"
                        className="mr-1.5 inline-block align-[-2px] text-brand-600"
                      >
                        <ShieldIcon />
                      </span>
                    )}
                    {ligne.libelle}
                    {ligne.compte && (
                      <span className="text-ink-500"> — {ligne.compte}</span>
                    )}
                  </p>
                  {ligne.detail && (
                    <p className="mt-0.5 truncate text-xs text-ink-500" title={ligne.detail}>
                      {ligne.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function fusionner(
  activites: EntreeActivite[],
  actionsAdmin: ActionAdmin[],
  nommerCompte?: (id: string | null) => string | null,
): Ligne[] {
  const lignes: Ligne[] = [];

  for (const entree of activites) {
    lignes.push({
      cle: `activite-${entree.id}`,
      dateHeure: entree.dateHeure,
      libelle: libelleActivite(entree.action),
      decision: false,
      alerte: activiteEstAlerte(entree.action),
      detail: entree.adresseIp ? `Depuis ${entree.adresseIp}` : null,
      compte: nommerCompte ? nommerCompte(entree.compteId) : null,
    });
  }

  for (const action of actionsAdmin) {
    lignes.push({
      cle: `admin-${action.id}`,
      dateHeure: action.dateHeure,
      libelle: libelleActionAdmin(action.action),
      decision: true,
      alerte: false,
      // Le motif est la raison d'être du champ : il s'affiche, il ne se replie
      // pas derrière un survol.
      detail: action.motif ? `Motif : ${action.motif}` : null,
      compte: nommerCompte ? nommerCompte(action.compteCibleId) : null,
    });
  }

  return lignes.sort((a, b) => (a.dateHeure < b.dateHeure ? 1 : a.dateHeure > b.dateHeure ? -1 : 0));
}

function grouperParJour(lignes: Ligne[]): Array<[string, Ligne[]]> {
  const groupes = new Map<string, Ligne[]>();
  for (const ligne of lignes) {
    const cle = dayKey(ligne.dateHeure);
    const existant = groupes.get(cle);
    if (existant) existant.push(ligne);
    else groupes.set(cle, [ligne]);
  }
  return [...groupes.entries()];
}
