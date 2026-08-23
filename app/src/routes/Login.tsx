/**
 * Écran de connexion.
 *
 * C'est le premier écran que voit un client qui vient de payer et d'installer
 * le logiciel. Il n'a que trois choses à faire, et il doit les faire bien :
 * inspirer confiance, ne rien demander d'inutile, et dire clairement ce qui se
 * passe quand ça ne marche pas.
 *
 * Ce qu'on n'y trouve pas, volontairement :
 *   - aucun lien « créer un compte » : les comptes sont créés à la main par le
 *     propriétaire, après discussion commerciale ;
 *   - aucun lien « mot de passe oublié » : il n'existe pas de réinitialisation
 *     automatique, cela se règle en appelant son fournisseur ;
 *   - aucune case « se souvenir de moi » : rien qui puisse laisser croire qu'un
 *     mot de passe est conservé quelque part. Il ne l'est jamais.
 *
 * Les messages d'erreur affichés sont **ceux du serveur, mot pour mot**. Le
 * contrat d'API les rédige déjà en français pour l'utilisateur final, et c'est
 * le serveur — lui seul — qui sait si un compte est suspendu, verrouillé, ou
 * si le mot de passe est simplement faux.
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BrandBackdrop, BrandLockup } from '../components/BrandBackdrop';
import { Button } from '../components/Button';
import { PasswordField, TextField } from '../components/Field';
import { FormAlert, type AlertTone } from '../components/FormAlert';
import { AlertIcon, ClockIcon, LockIcon } from '../components/icons';
import { ApiError, AuthErrorCode, normalizeError } from '../lib/api';
import type { SessionNotice } from '../lib/auth-store';

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
      // Succès : le barrage de session laisse passer, cet écran disparaît.
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

      <section className="mt-7 rounded-2xl border border-white/50 bg-white/92 p-7 shadow-2xl backdrop-blur-xl transition-all duration-300">
        <header>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink-900">Connexion</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Saisissez les identifiants qui vous ont été transmis.
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

      {/* Mention discrète : il n'y a pas d'auto-dépannage possible, mais il y a
          toujours quelqu'un à appeler. Le bouton WhatsApp, lui, arrive en
          Vague 4 — ici, une simple phrase. */}
      <p className="mt-5 text-center text-xs leading-relaxed text-brand-300">
        Vous n’arrivez pas à accéder à votre compte&nbsp;?
        <br />
        Contactez votre fournisseur Irrigation&nbsp;Pro, qui gère vos accès.
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
 * Trois situations très différentes se ressemblent pour un utilisateur pressé,
 * alors qu'elles n'appellent pas du tout la même réaction :
 *   - mot de passe faux      → on recommence, tout de suite ;
 *   - compte verrouillé      → on attend, ça se débloque tout seul ;
 *   - compte suspendu        → on téléphone, ça ne se débloquera pas tout seul.
 *
 * Le cas ordinaire reste sobre ; les deux autres portent une étiquette et une
 * icône, pour se distinguer au premier regard.
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
    return notice.kind === 'suspended'
      ? {
          tone: 'warning',
          title: 'Compte suspendu',
          icon: <LockIcon />,
          message: notice.message,
        }
      : {
          tone: 'neutral',
          title: 'Session terminée',
          icon: <ClockIcon />,
          message: notice.message,
        };
  }

  return null;
}
