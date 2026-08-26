/**
 * Coque du dashboard : en-tête produit, barre latérale sombre, zone de contenu.
 *
 * Même architecture visuelle que l'application cliente — barre sombre à gauche,
 * contenu clair à droite. Le propriétaire passe de son dashboard à
 * l'application de ses clients dans la même journée : les deux doivent se
 * reconnaître comme un seul produit.
 *
 * La seule différence assumée est l'étiquette « Administration » : on ne doit
 * jamais croire, en un coup d'œil, qu'on est dans l'application cliente alors
 * qu'on s'apprête à suspendre le compte de quelqu'un.
 */

import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import { cn } from '../lib/cn';
import { ADMIN_VERSION } from '../lib/version';
import { Button } from './Button';
import { HomeIcon, LogoutIcon, UsersIcon, BrandMark, MenuIcon, CloseIcon } from './icons';

const NAV_ITEMS = [
  { to: '/', label: 'Accueil', icon: <HomeIcon /> },
  { to: '/comptes', label: 'Comptes clients', icon: <UsersIcon /> },
];

export function AdminShell() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-ink-100 bg-surface px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={mobileOpen}
            className="inline-flex size-9 items-center justify-center rounded-md text-ink-700 hover:bg-ink-50 md:hidden"
          >
            {mobileOpen ? <CloseIcon className="text-xl" /> : <MenuIcon className="text-xl" />}
          </button>

          <BrandMark className="text-[1.375rem] text-brand-600" />
          <span className="text-md font-semibold tracking-[-0.015em] text-ink-900">
            Irrigation Pro
          </span>
          <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-600">
            Administration
          </span>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Navigation latérale permanente sur écran moyen et large (desktop) */}
        <Navigation className="hidden md:flex" />

        {/* Tiroir de navigation mobile avec voilette dépolie sur smartphone */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              aria-hidden="true"
              className="fixed inset-0 bg-ink-950/60 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative flex w-72 max-w-[80vw] flex-1 flex-col bg-brand-950 shadow-overlay animate-rise">
              <div className="flex h-14 items-center justify-between border-b border-white/10 px-4 text-white">
                <span className="text-sm font-semibold">Administration</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Fermer le menu"
                  className="rounded-md p-1.5 text-brand-300 hover:bg-white/10 hover:text-white"
                >
                  <CloseIcon className="text-lg" />
                </button>
              </div>
              <Navigation className="w-full flex-1" onNavClick={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Navigation({ onNavClick, className }: { onNavClick?: () => void; className?: string } = {}) {
  return (
    <nav
      data-surface="dark"
      aria-label="Navigation principale"
      className={cn('flex w-56 shrink-0 flex-col bg-brand-950 text-brand-100', className)}
    >
      <p className="px-5 pb-2.5 pt-5 text-2xs font-semibold uppercase tracking-[0.11em] text-brand-400">
        Gestion des comptes
      </p>

      <ul className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              onClick={onNavClick}
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
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <footer className="mt-6 border-t border-white/8 px-4 py-4">
        <AccountBlock />
        <p className="mt-4 px-1 text-2xs leading-relaxed text-brand-400" data-numeric>
          Version {ADMIN_VERSION}
          <br />
          {/* Conséquence directe du choix « jetons en mémoire vive » : elle doit
              être écrite quelque part, sinon elle passe pour une panne. */}
          Fermer cet onglet ferme la session.
        </p>
      </footer>
    </nav>
  );
}


/** Qui est connecté, et comment partir. */
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
