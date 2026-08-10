/**
 * Le moteur de rendu de formulaire.
 *
 * **Rien n'est codé en dur ici.** Ce composant ne connaît ni « besoins en eau »,
 * ni « Manning-Strickler », ni le moindre nom de champ : il reçoit le
 * descripteur d'un module tel que `GET /api/calculs/modules` le décrit, et il
 * le dessine. Ajouter un module de calcul côté serveur suffit donc à le faire
 * apparaître dans le logiciel déjà installé chez le client — aucune ligne à
 * écrire ici, aucune nouvelle version de l'application à diffuser.
 *
 * C'est plus de travail au départ qu'un formulaire écrit à la main. C'est ce
 * qui rend les vagues suivantes économiques.
 *
 * La seule validation faite ici est triviale (champ requis, nombre, plage
 * annoncée par le catalogue) et sert uniquement à éviter un aller-retour
 * réseau. **Le serveur revalide tout**, et c'est lui qui fait foi.
 */

import { useMemo } from 'react';

import { Button } from '../components/Button';
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
  type SelectOption,
} from '../components/Field';
import { useReferenceTable } from '../hooks/useCalculs';
import type { CalculInputs, CalculModule, ModuleField } from '../lib/calculs';
import { RunIcon } from '../components/icons';

/* --- Un champ ------------------------------------------------------------- */

interface DynamicFieldProps {
  field: ModuleField;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * Rend un champ d'après son descripteur.
 *
 * Un type de champ inconnu tombe sur la saisie texte : le module reste
 * utilisable, et le serveur refusera de toute façon une valeur incorrecte. Un
 * module mal décrit doit se dégrader, pas disparaître.
 */
function DynamicField({ field, value, onChange, error, disabled }: DynamicFieldProps) {
  if (field.kind === 'booleen') {
    return (
      <CheckboxField
        label={field.libelle}
        checked={Boolean(value)}
        onCheckedChange={onChange}
        hint={field.aide || undefined}
        disabled={disabled}
      />
    );
  }

  if (field.kind === 'liste') {
    return (
      <ReferenceField
        field={field}
        value={String(value ?? '')}
        onChange={onChange}
        error={error}
        disabled={disabled}
      />
    );
  }

  if (field.kind === 'nombre') {
    return (
      <TextField
        label={field.libelle}
        unit={field.unite || undefined}
        optional={!field.obligatoire}
        value={String(value ?? '')}
        onValueChange={onChange}
        error={error}
        hint={field.aide || rangeHint(field)}
        disabled={disabled}
        // `inputMode` fait sortir le pavé numérique ; le type reste `text` pour
        // que la virgule du clavier français ne soit pas avalée par le
        // navigateur, et pour que la molette ne modifie jamais une valeur.
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
      />
    );
  }

  // Un champ texte long (description d'ouvrage, remarque) mérite une zone.
  if (field.aide.length > 80) {
    return (
      <TextAreaField
        label={field.libelle}
        optional={!field.obligatoire}
        value={String(value ?? '')}
        onValueChange={onChange}
        error={error}
        hint={field.aide || undefined}
        disabled={disabled}
      />
    );
  }

  return (
    <TextField
      label={field.libelle}
      unit={field.unite || undefined}
      optional={!field.obligatoire}
      value={String(value ?? '')}
      onValueChange={onChange}
      error={error}
      hint={field.aide || undefined}
      disabled={disabled}
      autoComplete="off"
    />
  );
}

/** Rappel de plage quand le catalogue en annonce une et n'a pas d'aide. */
function rangeHint(field: ModuleField): string | undefined {
  if (field.min !== null && field.max !== null) return `Entre ${field.min} et ${field.max}.`;
  if (field.min !== null) return `Au minimum ${field.min}.`;
  if (field.max !== null) return `Au maximum ${field.max}.`;
  return undefined;
}

/**
 * Liste déroulante alimentée par une table de référence du serveur.
 *
 * Les coefficients (Manning, Hazen-Williams…) ne descendent jamais jusqu'ici :
 * le serveur ne renvoie que des clés et des libellés, l'application n'envoie
 * que la clé choisie (contrat, § 3).
 */
function ReferenceField({
  field,
  value,
  onChange,
  error,
  disabled,
}: {
  field: ModuleField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  // Les options du catalogue priment ; la table n'est chargée que si le
  // catalogue n'en fournit pas.
  const needsTable = field.options.length === 0 && Boolean(field.table);
  const query = useReferenceTable(needsTable ? field.table : null);

  const options: SelectOption[] = useMemo(() => {
    const source = field.options.length > 0 ? field.options : (query.data ?? []);
    return source.map((option) => ({ value: option.cle, label: option.libelle }));
  }, [field.options, query.data]);

  const loading = needsTable && query.isPending;

  return (
    <SelectField
      label={field.libelle}
      unit={field.unite || undefined}
      optional={!field.obligatoire}
      value={value}
      onValueChange={onChange}
      options={options}
      placeholder={loading ? 'Chargement…' : 'Choisir…'}
      error={error ?? (query.isError ? 'Liste indisponible pour le moment.' : undefined)}
      hint={field.aide || undefined}
      disabled={disabled || loading}
    />
  );
}

/* --- Le formulaire complet ------------------------------------------------- */

export interface ModuleFormProps {
  module: CalculModule;
  values: CalculInputs;
  onChange: (champ: string, value: string | boolean) => void;
  errors: Record<string, string>;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel?: string;
  /** Actions supplémentaires à droite du bouton principal. */
  secondaryAction?: React.ReactNode;
}

interface FieldGroup {
  titre: string | null;
  champs: ModuleField[];
}

/** Regroupe les champs comme le serveur le demande, sinon en un seul bloc. */
function groupFields(fields: ModuleField[]): FieldGroup[] {
  if (!fields.some((field) => field.groupe)) {
    return [{ titre: null, champs: fields }];
  }

  const groups: FieldGroup[] = [];
  for (const field of fields) {
    const titre = field.groupe ?? 'Autres paramètres';
    const existing = groups.find((group) => group.titre === titre);
    if (existing) existing.champs.push(field);
    else groups.push({ titre, champs: [field] });
  }
  return groups;
}

export function ModuleForm({
  module,
  values,
  onChange,
  errors,
  onSubmit,
  submitting,
  submitLabel = 'Lancer le calcul',
  secondaryAction,
}: ModuleFormProps) {
  const groups = useMemo(() => groupFields(module.entrees), [module.entrees]);

  if (module.entrees.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        Ce module ne déclare aucun paramètre de saisie. Lancez le calcul pour obtenir ses
        résultats.
      </p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-7"
    >
      {groups.map((group, index) => (
        <fieldset key={group.titre ?? index} className="min-w-0 border-0 p-0">
          {group.titre && (
            <legend className="mb-3.5 text-2xs font-semibold uppercase tracking-[0.09em] text-ink-500">
              {group.titre}
            </legend>
          )}
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {group.champs.map((field) => (
              <DynamicField
                key={field.champ}
                field={field}
                value={values[field.champ] ?? ''}
                onChange={(value) => onChange(field.champ, value)}
                error={errors[field.champ]}
                disabled={submitting}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-2.5 border-t border-ink-100 pt-5">
        <Button
          type="submit"
          variant="primary"
          icon={<RunIcon />}
          loading={submitting}
          loadingLabel="Calcul en cours sur le serveur"
        >
          {submitLabel}
        </Button>
        {secondaryAction}
        <p className="ml-auto text-xs text-ink-400">
          Le calcul est réalisé par le serveur Irrigation Pro.
        </p>
      </div>
    </form>
  );
}
