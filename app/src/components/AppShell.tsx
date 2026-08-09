/**
 * Coque de l'application : en-tête produit, barre latérale, zone de contenu.
 *
 * La coque est permanente ; seule la zone de contenu change d'un écran à
 * l'autre. C'est ce qui permet à un utilisateur non informaticien de garder
 * ses repères d'un bout à l'autre du logiciel.
 */

import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { StatusBadge, type StatusTone } from './StatusBadge';
import { BrandMark } from './icons';
import type { ConnectionState } from '../hooks/useHealth';

export interface AppShellProps {
  connection: ConnectionState;
}

export function AppShell({ connection }: AppShellProps) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-6 border-b border-ink-100 bg-surface px-5">
        <div className="flex items-center gap-2.5">
          <BrandMark className="text-[1.375rem] text-brand-600" />
          <span className="text-md font-semibold tracking-[-0.015em] text-ink-900">
            Irrigation Pro
          </span>
        </div>

        <ConnectionIndicator connection={connection} />
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
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
