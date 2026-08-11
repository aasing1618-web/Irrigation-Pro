/**
 * Protection de tout le dashboard.
 *
 * C'est un **barrage**, pas une redirection : les écrans d'administration ne
 * sont pas rendus tant que la session n'est pas en règle. Aucune URL, aucun
 * retour en arrière du navigateur ne permet donc de les atteindre — il n'y a
 * rien à atteindre.
 *
 * Trois issues, dans cet ordre :
 *   1. personne de connecté   → écran de connexion ;
 *   2. mot de passe à changer → écran de changement, sans échappatoire ;
 *   3. session en règle       → le dashboard.
 *
 * Le contrôle d'accès réel reste évidemment côté serveur : ce barrage sert le
 * propriétaire, il ne protège pas les données. Le serveur revérifie le statut
 * du compte, son rôle et `mustChangePassword` à chaque requête.
 */

import type { ReactNode } from 'react';

import { ChangePassword } from '../routes/ChangePassword';
import { Login } from '../routes/Login';
import { useAuth } from './AuthProvider';

export function SessionGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return <Login />;
  }

  // Un administrateur créé par un autre administrateur reçoit lui aussi un mot
  // de passe temporaire. Sans cet écran, il resterait bloqué : toutes les
  // routes d'administration lui répondraient `403 PASSWORD_CHANGE_REQUIRED`
  // sans qu'aucun écran ne lui dise quoi faire.
  if (user.mustChangePassword) {
    return <ChangePassword />;
  }

  return <>{children}</>;
}
