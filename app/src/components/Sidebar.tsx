/**
 * Barre latérale de navigation.
 *
 * Second plan de neutres : elle est sombre là où la zone de contenu est claire.
 * Cela sépare nettement l'outil (la navigation, permanente) du travail (les
 * données, changeantes), et donne au logiciel sa présence de marque sans
 * colorer les écrans de travail.
 */

import { NavLink } from 'react-router';
import { useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { cn } from '../lib/cn';
import { APP_VERSION } from '../lib/version';
import { Button } from './Button';
import {
  CalculationsIcon,
  DashboardIcon,
  LogoutIcon,
  ProjectsIcon,
  ReportsIcon,
  SettingsIcon,
} from './icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Écrans prévus mais non encore livrés (Vagues 1 à 3). */
  upcoming?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: <DashboardIcon /> },
  { to: '/projets', label: 'Projets', icon: <ProjectsIcon />, upcoming: true },
  { to: '/calculs', label: 'Calculs', icon: <CalculationsIcon />, upcoming: true },
  { to: '/rapports', label: 'Rapports', icon: <ReportsIcon />, upcoming: true },
  { to: '/parametres', label: 'Paramètres', icon: <SettingsIcon /> },
];

export function Sidebar() {
  return (
    <nav
      data-surface="dark"
      aria-label="Navigation principale"
      className="flex w-60 shrink-0 flex-col bg-brand-950 text-brand-100"
    >
      <p className="px-5 pb-2.5 pt-5 text-2xs font-semibold uppercase tracking-[0.11em] text-brand-400">
        Espace de travail
      </p>

      <ul className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-base',
                  'transition-colors duration-150 ease-out-quart',
                  isActive
                    ? 'bg-brand-800/80 font-medium text-white'
                    : 'text-brand-200 hover:bg-white/6 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-300',
                      'transition-opacity duration-150',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'text-[1.125rem] leading-none transition-colors duration-150',
                      isActive ? 'text-brand-300' : 'text-brand-400 group-hover:text-brand-200',
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.upcoming && (
                    <span
                      aria-hidden="true"
                      title="Disponible prochainement"
                      className="size-1 shrink-0 rounded-full bg-brand-500"
                    />
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <footer className="mt-6 border-t border-white/8 px-4 py-4">
        <AccountBlock />
        <p className="mt-4 px-1 text-2xs text-brand-400" data-numeric>
          Version {APP_VERSION} · Poste Windows
        </p>
      </footer>
    </nav>
  );
}

/**
 * Qui est connecté, et comment partir.
 *
 * Le nom est affiché en clair : sur un poste partagé par un bureau d'études,
 * savoir sous quel compte on travaille évite de créer un projet au mauvais
 * endroit.
 */
function AccountBlock() {
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(false);

  if (!user) return null;

  return (
    <div>
      <p className="truncate px-1 text-sm font-medium text-white" title={user.fullName}>
        {user.fullName}
      </p>
      <p className="mt-0.5 truncate px-1 text-2xs text-brand-400" title={user.email}>
        {user.email}
      </p>

      <Button
        variant="onDark"
        size="sm"
        icon={<LogoutIcon />}
        className="mt-3 w-full"
        loading={pending}
        loadingLabel="Déconnexion en cours"
        onClick={() => {
          setPending(true);
          void logout().finally(() => setPending(false));
        }}
      >
        Se déconnecter
      </Button>
    </div>
  );
}
