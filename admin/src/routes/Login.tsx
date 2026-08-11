/**
 * Connexion à l'administration.
 *
 * C'est la **même API** que l'application cliente — `POST /api/auth/login`. La
 * différence tient en une phrase, et elle est capitale :
 *
 *   Un compte `CLIENT` se connecte ici **avec succès**. Le serveur ne le refuse
 *   pas : ce sont les routes d'administration qui lui répondront `404`, pour ne
 *   pas lui apprendre que ce dashboard existe (contrat § 2).
 *
 * Sans contrôle de rôle côté dashboard, ce client atterrirait donc sur un outil
 * dont chaque écran affiche « introuvable », sans jamais comprendre pourquoi.
 * `lib/session.ts` relit le rôle sur `/api/auth/me` juste après la connexion,
 * referme la session s'il n'est pas `ADMIN`, et publie un motif de refus —
 * c'est lui qui s'affiche ici, en clair.
 *
 * Comme dans l'application cliente : pas d'inscription, pas de « mot de passe
 * oublié », pas de « se souvenir de moi ». Les messages d'erreur affichés sont
 * ceux du serveur, mot pour mot.
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BrandBackdrop, BrandLockup } from '../components/BrandBackdrop';
import { Button } from '../components/Button';
import { PasswordField, TextField } from '../components/Field';
import { FormAlert, type AlertTone } from '../components/FormAlert';
import { AlertIcon, ClockIcon, LockIcon, ShieldIcon } from '../components/icons';
import { ApiError, AuthErrorCode, normalizeError } from '../lib/api';
import type { SessionNotice } from '../lib/session';

export function Login() {
  const { login, notice, dismissNotice } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const canSubmit = email.trim() !== '' && password !== '' && !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setError(null);
    dismissNotice();

    try {
      await login(email.trim(), password);
      // Deux issues possibles, toutes deux sans exception :
      //   - rôle ADMIN  → le barrage laisse passer, cet écran disparaît ;
      //   - rôle CLIENT → la session est refermée et un motif est publié, que
      //     `describeFailure` affiche ci-dessous.
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      // Le mot de passe ne survit pas à l'envoi, même en cas d'échec.
      setPassword('');
      setPending(false);
    }
  }

  const alert = describeFailure(error, notice);

  return (
    <BrandBackdrop width="sm">
      <BrandLockup as="plain" compact />

      <section className="mt-7 rounded-xl border border-ink-100 bg-surface p-6 shadow-overlay">
        <header>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink-900">Connexion</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Cet espace est réservé au propriétaire d’Irrigation&nbsp;Pro.
          </p>
        </header>

        {alert && (
          <FormAlert tone={alert.tone} title={alert.title} icon={alert.icon} className="mt-5">
            {alert.message}
          </FormAlert>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-4">
          <TextField
            label="Adresse e-mail"
            type="email"
            value={email}
            onValueChange={setEmail}
            inputRef={emailRef}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            disabled={pending}
            invalid={alert?.field === 'both'}
          />

          <PasswordField
            label="Mot de passe"
            value={password}
            onValueChange={setPassword}
            autoComplete="current-password"
            disabled={pending}
            invalid={alert?.field === 'both'}
          />

          <Button
            type="submit"
            variant="primary"
            className="mt-1 w-full"
            disabled={!canSubmit}
            loading={pending}
            loadingLabel="Connexion en cours"
          >
            Se connecter
          </Button>
        </form>
      </section>

      <p className="mt-5 text-center text-xs leading-relaxed text-brand-300">
        La session se ferme quand vous fermez cet onglet.
      </p>
    </BrandBackdrop>
  );
}

interface FailureDescription {
  tone: AlertTone;
  title?: string;
  icon: ReactNode;
  message: string;
  /** Champs à souligner comme fautifs. */
  field?: 'both';
}

/**
 * Choisit l'habillage du message — jamais son texte.
 *
 * Quatre situations se ressemblent pour qui va vite, alors qu'elles n'appellent
 * pas du tout la même réaction :
 *   - mot de passe faux        → on recommence tout de suite ;
 *   - compte verrouillé        → on attend, ça se débloque seul ;
 *   - compte suspendu          → un autre administrateur est intervenu ;
 *   - **compte client**        → il n'y a rien à réessayer ici, jamais.
 *
 * Le dernier cas est le seul propre à ce dashboard, et le plus déroutant si on
 * ne le nomme pas : les identifiants sont bons, et pourtant l'accès est refusé.
 */
function describeFailure(
  error: ApiError | null,
  notice: SessionNotice | null,
): FailureDescription | null {
  if (error) {
    if (error.code === AuthErrorCode.ACCOUNT_SUSPENDED) {
      return {
        tone: 'warning',
        title: 'Compte suspendu',
        icon: <LockIcon />,
        message: error.message,
      };
    }

    if (error.status === 429 || error.code === AuthErrorCode.ACCOUNT_LOCKED) {
      return {
        tone: 'warning',
        title: 'Connexion temporairement bloquée',
        icon: <ClockIcon />,
        message: error.message,
      };
    }

    return {
      tone: 'danger',
      icon: <AlertIcon />,
      message: error.message,
      field: error.status === 401 ? 'both' : undefined,
    };
  }

  if (notice) {
    if (notice.kind === 'role') {
      return {
        tone: 'danger',
        title: 'Accès réservé à l’administration',
        icon: <ShieldIcon />,
        message: notice.message,
      };
    }
    if (notice.kind === 'suspended') {
      return {
        tone: 'warning',
        title: 'Compte suspendu',
        icon: <LockIcon />,
        message: notice.message,
      };
    }
    return {
      tone: 'neutral',
      title: 'Session terminée',
      icon: <ClockIcon />,
      message: notice.message,
    };
  }

  return null;
}
