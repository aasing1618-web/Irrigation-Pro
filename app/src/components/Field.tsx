/**
 * Champs de saisie du produit.
 *
 * Un seul dessin de champ dans tout le logiciel : même hauteur, même bordure,
 * même anneau de focus, même façon d'associer le libellé. Le libellé est
 * toujours un vrai `<label for>` — jamais un texte placé à côté, jamais un
 * `placeholder` qui disparaît dès qu'on écrit.
 */

import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from '../lib/cn';
import { EyeIcon, EyeOffIcon } from './icons';

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'value' | 'onChange' | 'type' | 'className'
>;

export interface TextFieldProps extends NativeInputProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  type?: 'text' | 'email';
  /** Phrase d'aide sous le champ, lue par les lecteurs d'écran. */
  hint?: ReactNode;
  /** Souligne le champ comme fautif (bordure + `aria-invalid`). */
  invalid?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

const inputBase =
  'h-10 w-full rounded-md border bg-surface px-3 text-base text-ink-900 shadow-subtle ' +
  'placeholder:text-ink-300 transition-colors duration-150 ease-out-quart ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400';

const inputTone = {
  normal: 'border-ink-200 hover:border-ink-300',
  invalid: 'border-danger-border bg-danger-soft/40 hover:border-danger',
};

export function TextField({
  label,
  value,
  onValueChange,
  type = 'text',
  hint,
  invalid,
  inputRef,
  ...rest
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-700">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={hintId}
        className={cn(inputBase, invalid ? inputTone.invalid : inputTone.normal)}
      />
      {hint && (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export interface PasswordFieldProps
  extends Omit<TextFieldProps, 'type' | 'children'> {
  /** Contenu additionnel rendu sous le champ (jauge de longueur, par exemple). */
  children?: ReactNode;
}

/**
 * Champ de mot de passe, avec bouton de révélation.
 *
 * Le bouton porte un `aria-label` qui décrit l'action à venir et un
 * `aria-pressed` qui décrit l'état courant : un lecteur d'écran annonce donc
 * aussi bien ce qu'il va faire que ce qu'il a fait.
 */
export function PasswordField({
  label,
  value,
  onValueChange,
  hint,
  invalid,
  inputRef,
  children,
  ...rest
}: PasswordFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-700">
        {label}
      </label>

      <div className="relative">
        <input
          {...rest}
          id={id}
          ref={inputRef}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          className={cn(
            inputBase,
            'pr-10',
            invalid ? inputTone.invalid : inputTone.normal,
            // Le gestionnaire de mots de passe de la WebView ajoute sa propre
            // icône : on garde de la place, la nôtre reste alignée.
            '[&::-ms-reveal]:hidden',
          )}
        />

        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={revealed}
          disabled={rest.disabled}
          className={cn(
            'absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md',
            'text-[1.125rem] text-ink-400 transition-colors duration-150',
            'hover:text-ink-700 disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {children}

      {hint && (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}
