/**
 * Coque de l'application : en-tête produit, barre latérale, zone de contenu.
 *
 * La coque est permanente ; seule la zone de contenu change d'un écran à
 * l'autre. C'est ce qui permet à un utilisateur non informaticien de garder
 * ses repères d'un bout à l'autre du logiciel.
 */

import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from './Sidebar';
import { StatusBadge, type StatusTone } from './StatusBadge';
import { UpdateBanner } from './UpdateBanner';
import { BrandMark, MenuIcon, CloseIcon } from './icons';
import { useUpdateCheck } from '../hooks/useUpdateCheck';
import type { ConnectionState } from '../hooks/useHealth';

export interface AppShellProps {
  connection: ConnectionState;
}

export function AppShell({ connection }: AppShellProps) {
  const update = useUpdateCheck();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fermer le tiroir mobile dès qu'on change de page
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
        </div>

        <ConnectionIndicator connection={connection} />
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Navigation latérale permanente sur écran moyen et large (desktop) */}
        <Sidebar className="hidden md:flex" />

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
                <span className="text-sm font-semibold">Menu</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Fermer le menu"
                  className="rounded-md p-1.5 text-brand-300 hover:bg-white/10 hover:text-white"
                >
                  <CloseIcon className="text-lg" />
                </button>
              </div>
              <Sidebar className="w-full flex-1" onNavClick={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {update.version && <UpdateBanner version={update.version} onDismiss={update.dismiss} />}
    </div>
  );
}


/**
 * Résumé permanent de la liaison serveur, en haut à droite.
 *
 * `role="status"` : un changement d'état est annoncé aux lecteurs d'écran sans
 * interrompre l'utilisateur dans sa tâche.
 */
function ConnectionIndicator({ connection }: { connection: ConnectionState }) {
  const { tone, label } = describe(connection);

  return (
    <div
      role="status"
      aria-label="État du serveur"
      className="flex items-center gap-2"
    >
      <span className="hidden text-xs text-ink-400 sm:inline">Serveur</span>
      <StatusBadge tone={tone}>{label}</StatusBadge>
    </div>
  );
}

function describe(connection: ConnectionState): { tone: StatusTone; label: string } {
  switch (connection.kind) {
    case 'online':
      return { tone: 'success', label: 'Connecté' };
    case 'degraded':
      return { tone: 'warning', label: 'Service réduit' };
    case 'offline':
      return { tone: 'danger', label: 'Hors ligne' };
    case 'checking':
    default:
      return { tone: 'pending', label: 'Vérification' };
  }
}
