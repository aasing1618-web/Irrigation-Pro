/**
 * Contexte de session — le seul point d'accès des écrans à l'authentification.
 *
 * Aucun composant ne lit un jeton : il lit `useAuth()`, qui expose le compte
 * connecté, l'état de la session et les actions possibles.
 *
 * L'état réel vit dans `lib/session.ts`, hors de React : c'est ce qui permet au
 * client HTTP de terminer une session (jeton refusé, compte suspendu) sans
 * avoir besoin qu'un composant soit monté.
 *
 * Il n'y a **pas** de reprise silencieuse au démarrage, contrairement à
 * l'application cliente : le jeton de rafraîchissement ne survit pas à la
 * fermeture de l'onglet, il n'y a donc rien à reprendre (voir `session.ts`).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  changePassword,
  dismissSessionNotice,
  getSessionSnapshot,
  login,
  logout,
  subscribeSession,
  type SessionSnapshot,
} from '../lib/session';

export interface AuthContextValue extends SessionSnapshot {
  /** Laisse remonter l'`ApiError` : l'écran affiche le message du serveur. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Efface le bandeau « session expirée » / « accès refusé ». */
  dismissNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getSessionSnapshot,
  );

  // Rien de ce qui a été reçu pour un compte ne survit à son départ. Le
  // dashboard affiche des adresses e-mail de clients et des journaux d'accès :
  // sur un poste partagé, la personne suivante ne doit rien en retrouver.
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    const currentUserId = snapshot.user?.id ?? null;
    if (previousUserId.current !== null && previousUserId.current !== currentUserId) {
      queryClient.clear();
    }
    previousUserId.current = currentUserId;
  }, [snapshot.user?.id, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      login,
      logout,
      changePassword,
      dismissNotice: dismissSessionNotice,
    }),
    [snapshot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth() doit être appelé à l’intérieur de <AuthProvider>.');
  }
  return value;
}
