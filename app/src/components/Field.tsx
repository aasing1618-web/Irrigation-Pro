/**
 * Champs de saisie du produit.
 *
 * Un seul dessin de champ dans tout le logiciel : même hauteur, même bordure,
 * même anneau de focus, même façon d'associer le libellé. Le libellé est
 * toujours un vrai `<label for>` — jamais un texte placé à côté, jamais un
 * `placeholder` qui disparaît dès qu'on écrit.
 *
 * Tous les champs partagent la même armature (`FieldFrame`) : libellé, mention
 * « facultatif », unité, aide, message d'erreur. Ajouter un type de champ, c'est
 * habiller cette armature — jamais recopier ses classes.
 *
 * **Les messages d'erreur portent `role="alert"`** : un utilisateur au lecteur
 * d'écran doit apprendre que sa saisie est refusée au moment où elle l'est, pas
 * en repassant sur le champ.
 */

import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';
import { EyeIcon, EyeOffIcon } from './icons';

/* --- Armature commune ------------------------------------------------------ */

interface FieldFrameProps {
  id: string;
  label: string;
  /** Affiche « facultatif » à côté du libellé, plutôt qu'un astérisque muet. */
  optional?: boolean;
  /** Unité de la grandeur saisie, affichée près du libellé (« ha », « m³/h »). */
  unit?: string;
  hint?: ReactNode;
  error?: string;
  hintId?: string;
  errorId?: string;
  children: ReactNode;
}

function FieldFrame({
  id,
  label,
  optional,
  unit,
  hint,
  error,
  hintId,
  errorId,
  children,
}: FieldFrameProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-sm font-medium text-ink-700">
        <span className="min-w-0">{label}</span>
        {unit && (
          <span className="shrink-0 font-normal text-ink-500" data-numeric>
            ({unit})
          </span>
        )}
        {optional && <span className="shrink-0 text-xs font-normal text-ink-400">facultatif</span>}
      </label>

      {children}

      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}

      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}

const controlBase =
  'w-full rounded-md border bg-surface px-3 text-base text-ink-900 shadow-subtle ' +
  'placeholder:text-ink-300 transition-colors duration-150 ease-out-quart ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400';

const inputBase = `h-10 ${controlBase}`;

const inputTone = {
  normal: 'border-ink-200 hover:border-ink-300',
  invalid: 'border-danger-border bg-danger-soft/40 hover:border-danger',
};

/** Identifiants stables pour l'aide et l'erreur, dans le bon ordre de lecture. */
function describedBy(hintId?: string, errorId?: string): string | undefined {
  const parts = [errorId, hintId].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/* --- Champ texte ----------------------------------------------------------- */

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'value' | 'onChange' | 'type' | 'className'
>;

export interface TextFieldProps extends NativeInputProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  type?: 'text' | 'email' | 'search' | 'number';
  /** Phrase d'aide sous le champ, lue par les lecteurs d'écran. */
  hint?: ReactNode;
  /** Souligne le champ comme fautif (bordure + `aria-invalid`). */
  invalid?: boolean;
  /** Message d'erreur ; il implique `invalid` et remplace l'aide. */
  error?: string;
  optional?: boolean;
  unit?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  value,
  onValueChange,
  type = 'text',
  hint,
  invalid,
  error,
  optional,
  unit,
  inputRef,
  ...rest
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const isInvalid = invalid || Boolean(error);

  return (
    <FieldFrame
      id={id}
      label={label}
      optional={optional}
      unit={unit}
      hint={hint}
      error={error}
      hintId={hintId}
      errorId={errorId}
    >
      <input
        {...rest}
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy(hintId, errorId)}
        className={cn(inputBase, isInvalid ? inputTone.invalid : inputTone.normal)}
      />
    </FieldFrame>
  );
}

/* --- Zone de texte --------------------------------------------------------- */

export interface TextAreaFieldProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'id' | 'value' | 'onChange' | 'className'
  > {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  rows?: number;
}

export function TextAreaField({
  label,
  value,
  onValueChange,
  hint,
  error,
  optional,
  rows = 3,
  ...rest
}: TextAreaFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <FieldFrame
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      error={error}
      hintId={hintId}
      errorId={errorId}
    >
      <textarea
        {...rest}
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(hintId, errorId)}
        className={cn(
          controlBase,
          'resize-y py-2 leading-relaxed',
          error ? inputTone.invalid : inputTone.normal,
        )}
      />
    </FieldFrame>
  );
}

/* --- Liste déroulante ------------------------------------------------------ */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'id' | 'value' | 'onChange' | 'className' | 'children'
  > {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Première ligne neutre (« Choisir… ») quand rien n'est encore sélectionné. */
  placeholder?: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  unit?: string;
}

export function SelectField({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  hint,
  error,
  optional,
  unit,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <FieldFrame
      id={id}
      label={label}
      optional={optional}
      unit={unit}
      hint={hint}
      error={error}
      hintId={hintId}
      errorId={errorId}
    >
      <div className="relative">
        <select
          {...rest}
          id={id}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(hintId, errorId)}
          className={cn(
            inputBase,
            'cursor-pointer appearance-none pr-9',
            error ? inputTone.invalid : inputTone.normal,
          )}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-400"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" focusable="false">
            <path
              d="m4 6.5 4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </FieldFrame>
  );
}

/* --- Case à cocher --------------------------------------------------------- */

export interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}

export function CheckboxField({
  label,
  checked,
  onCheckedChange,
  hint,
  disabled,
}: CheckboxFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          aria-describedby={hintId}
          className="size-4 shrink-0 cursor-pointer rounded-xs border-ink-300 accent-brand-600 disabled:cursor-not-allowed"
        />
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink-700">
          {label}
        </label>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}

/* --- Mot de passe ---------------------------------------------------------- */

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
