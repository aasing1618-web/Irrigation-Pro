/**
 * Protection de toute l'application.
 *
 * C'est un **barrage**, pas une redirection : les écrans de travail ne sont pas
 * rendus tant que la session n'est pas en règle. Aucune URL, aucun retour en
 * arrière du navigateur, aucun lien direct ne permet donc de les atteindre —
 * il n'y a rien à atteindre.
 *
 * Trois issues, dans cet ordre :
 *   1. session en cours de reprise → écran d'attente bref et propre ;
 *   2. personne de connecté        → écran de connexion ;
 *   3. mot de passe à changer      → écran de changement, sans échappatoire.
 *
 * Le contrôle d'accès réel reste évidemment côté serveur : ce barrage sert
 * l'utilisateur, il ne protège pas les données. Le serveur revérifie le statut
 * du compte et `mustChangePassword` à chaque requête (contrat d'API, § 1).
 */

import type { ReactNode } from 'react';

import { BrandBackdrop, BrandLockup, WaitingDots } from '../components/BrandBackdrop';
import { ChangePassword } from '../routes/ChangePassword';
import { Login } from '../routes/Login';
import { useAuth } from './AuthProvider';

export function SessionGate({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();

  if (status === 'restoring') {
    return <SessionRestoringScreen />;
  }

  if (!user) {
    return <Login />;
  }

  if (user.mustChangePassword) {
    return <ChangePassword />;
  }

  return <>{children}</>;
}

/**
 * Attente très brève, le temps de relire le jeton rangé par le système.
 *
 * Elle existe pour une seule raison : ne pas faire clignoter l'écran de
 * connexion sous les yeux d'un utilisateur qui, lui, est déjà connecté.
 */
function SessionRestoringScreen() {
  return (
    <BrandBackdrop width="sm">
      <BrandLockup compact tagline={null} />
      <div
        role="status"
        aria-live="polite"
        className="mt-8 flex items-center justify-center gap-3 rounded-lg border border-white/8 bg-white/4 px-5 py-4"
      >
        <WaitingDots />
        <p className="text-base text-brand-200">Ouverture de votre session…</p>
      </div>
    </BrandBackdrop>
  );
}
