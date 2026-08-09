/**
 * Contexte de session — le seul point d'accès des écrans à l'authentification.
 *
 * Aucun composant ne lit un jeton : il lit `useAuth()`, qui expose l'utilisateur
 * connecté, l'état de la session et les trois actions possibles (se connecter,
 * se déconnecter, changer de mot de passe).
 *
 * L'état réel vit dans `lib/auth-store.ts`, hors de React : c'est ce qui permet
 * au client HTTP de terminer une session (compte suspendu, jeton refusé) sans
 * avoir besoin d'un composant monté.
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
  getAuthSnapshot,
  login,
  logout,
  restoreSession,
  subscribeAuth,
  type AuthSnapshot,
} from '../lib/auth-store';

export interface AuthContextValue extends AuthSnapshot {
  /** Laisse remonter l'`ApiError` : l'écran affiche le message du serveur. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Efface le bandeau « session expirée » / « compte suspendu ». */
  dismissNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);

  // Reprise silencieuse : si un jeton de rafraîchissement a survécu au dernier
  // lancement, l'utilisateur n'a pas à retaper son mot de passe.
  // `restoreSession` est idempotente — le mode strict de React appelle cet
  // effet deux fois en développement.
  useEffect(() => {
    void restoreSession();
  }, []);

  // Isolation des données : tout ce qui a été reçu du serveur pour un compte
  // disparaît du cache dès que ce compte quitte la session. Sur un poste
  // partagé par un bureau d'études, le collègue qui se connecte ensuite ne doit
  // rien pouvoir lire de la session précédente, pas même une donnée déjà
  // affichée. (Le serveur, lui, applique l'isolation à chaque requête.)
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
      login: async (email, password) => {
        await login(email, password);
      },
      logout,
      changePassword: async (currentPassword, newPassword) => {
        await changePassword(currentPassword, newPassword);
      },
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
