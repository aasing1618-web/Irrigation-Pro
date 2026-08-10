/**
 * Les calculs, vus par l'application — **et rien d'autre**.
 *
 * ## La règle qui gouverne tout ce fichier (décision D-007)
 *
 * Aucune formule d'irrigation ne vit ici, et il ne faut jamais en ajouter. Les
 * formules sont ce que le client achète ; une application installée sur un
 * poste Windows est décompilable, donc tout ce qui y est écrit est public. Ce
 * module envoie des paramètres au serveur et lit ce qu'il renvoie.
 *
 * Ce qu'on trouve ici, et qui n'est pas une formule :
 *   - la **traduction** du catalogue `GET /api/calculs/modules` en descripteurs
 *     de champs, pour que le formulaire se construise tout seul ;
 *   - une validation de saisie triviale (champ requis, nombre, plage annoncée
 *     par le catalogue) — toujours redoublée côté serveur, jamais à sa place ;
 *   - la mise en forme des résultats reçus.
 *
 * ## Pourquoi le catalogue plutôt que des formulaires écrits à la main
 *
 * Ajouter un module de calcul côté serveur doit suffire à le faire apparaître
 * dans le logiciel installé chez le client, sans nouvelle version de
 * l'application. C'est ce qui rend les vagues suivantes économiques : le
 * serveur décrit ses champs, l'application les dessine.
 *
 * ## Lecture volontairement tolérante
 *
 * Le moteur de calcul est écrit en parallèle. Chaque clé est donc lue avec un
 * repli, et un type de champ inconnu se dessine en champ texte plutôt que de
 * faire disparaître le module. Un module mal décrit doit rester utilisable en
 * dégradé, pas casser l'écran.
 */

import { apiRequest } from './api';
import { formatNumber } from './format';
import { readArchivedCalcul, type ArchivedCalcul } from './projects';

/* --- Types du catalogue ---------------------------------------------------- */

/** Formes de saisie que l'application sait dessiner. */
export type FieldKind = 'nombre' | 'texte' | 'liste' | 'booleen';

/** Une option de liste déroulante : une clé technique, un libellé lisible. */
export interface ReferenceOption {
  cle: string;
  libelle: string;
}

/** Un champ de saisie décrit par le serveur. */
export interface ModuleField {
  champ: string;
  libelle: string;
  kind: FieldKind;
  /** Unité affichée à côté du champ ; vide si la grandeur n'en a pas. */
  unite: string;
  /** Phrase d'aide, affichée sous le champ. */
  aide: string;
  obligatoire: boolean;
  min: number | null;
  max: number | null;
  pas: number | null;
  /** Valeur initiale proposée, déjà convertie en valeur de saisie. */
  defaut: string | boolean | null;
  /** Table de référence à charger (`GET /api/calculs/references/:table`). */
  table: string | null;
  /** Options fournies directement dans le catalogue, sans aller-retour. */
  options: ReferenceOption[];
  /** Regroupement de saisie proposé par le serveur (« Sol », « Culture »…). */
  groupe: string | null;
}

/** Une grandeur de sortie décrite par le serveur (facultatif). */
export interface ModuleOutput {
  champ: string;
  libelle: string;
  unite: string;
  /** Grandeur mise en évidence en tête des résultats. */
  principal: boolean;
  groupe: string | null;
}

export interface CalculModule {
  code: string;
  nom: string;
  famille: string;
  description: string;
  entrees: ModuleField[];
  sorties: ModuleOutput[];
}

/* --- Lecture défensive du catalogue ---------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Première clé présente et exploitable parmi plusieurs orthographes admises. */
function pickText(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function pickNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pickBoolean(record: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    if (typeof record[key] === 'boolean') return record[key] as boolean;
  }
  return false;
}

/**
 * Type de champ.
 *
 * Les libellés français du contrat font foi ; les équivalents anglais sont
 * acceptés parce qu'ils coûtent une ligne et évitent un écran vide si le moteur
 * en émet un jour. Tout type inconnu devient un champ texte : le serveur
 * revalidera de toute façon la saisie.
 */
function readFieldKind(raw: unknown): FieldKind {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (value === 'nombre' || value === 'number' || value === 'numerique') return 'nombre';
  if (value === 'liste' || value === 'choix' || value === 'enum' || value === 'select') {
    return 'liste';
  }
  if (value === 'booleen' || value === 'boolean' || value === 'bool') return 'booleen';
  return 'texte';
}

export function readReferenceOption(raw: unknown): ReferenceOption {
  if (typeof raw === 'string') return { cle: raw, libelle: raw };
  const record = asRecord(raw);
  const cle = pickText(record, 'cle', 'valeur', 'code', 'id');
  const libelle = pickText(record, 'libelle', 'nom', 'label') || cle;
  return { cle, libelle };
}

function readOptions(raw: unknown): ReferenceOption[] {
  return Array.isArray(raw) ? raw.map(readReferenceOption).filter((o) => o.cle !== '') : [];
}

/** Convertit la valeur par défaut du catalogue en valeur de saisie. */
function readDefault(raw: unknown, kind: FieldKind): string | boolean | null {
  if (raw === undefined || raw === null) return null;
  if (kind === 'booleen') return Boolean(raw);
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'string') return raw;
  return null;
}

function readField(raw: unknown): ModuleField {
  const record = asRecord(raw);
  const kind = readFieldKind(record.type ?? record.kind);
  const champ = pickText(record, 'champ', 'cle', 'nom', 'code', 'id');
  const options = readOptions(record.options ?? record.valeurs ?? record.choix);
  const table = pickText(record, 'table', 'reference', 'source', 'tableReference');

  return {
    champ,
    libelle: pickText(record, 'libelle', 'label', 'nom') || champ,
    // Un champ pourvu d'une table ou d'options est une liste, même si le
    // serveur a oublié de le dire dans `type`.
    kind: kind === 'texte' && (table || options.length > 0) ? 'liste' : kind,
    unite: pickText(record, 'unite', 'unit'),
    aide: pickText(record, 'aide', 'description', 'help'),
    obligatoire: pickBoolean(record, 'obligatoire', 'requis', 'required'),
    min: pickNumber(record, 'min', 'minimum'),
    max: pickNumber(record, 'max', 'maximum'),
    pas: pickNumber(record, 'pas', 'step'),
    defaut: readDefault(record.defaut ?? record.valeurParDefaut ?? record.default, kind),
    table: table || null,
    options,
    groupe: pickText(record, 'groupe', 'section') || null,
  };
}

function readOutput(raw: unknown): ModuleOutput {
  const record = asRecord(raw);
  const champ = pickText(record, 'champ', 'cle', 'nom', 'code');
  return {
    champ,
    libelle: pickText(record, 'libelle', 'label', 'nom') || champ,
    unite: pickText(record, 'unite', 'unit'),
    principal: pickBoolean(record, 'principal', 'majeur', 'primary', 'important'),
    groupe: pickText(record, 'groupe', 'section') || null,
  };
}

export function readModule(raw: unknown): CalculModule {
  const record = asRecord(raw);
  const code = pickText(record, 'code', 'module', 'id');
  const entreesRaw = record.entrees ?? record.champs ?? record.inputs;
  const sortiesRaw = record.sorties ?? record.resultats ?? record.outputs;

  return {
    code,
    nom: pickText(record, 'nom', 'libelle', 'label') || code,
    famille: pickText(record, 'famille', 'categorie', 'groupe'),
    description: pickText(record, 'description', 'aide'),
    entrees: Array.isArray(entreesRaw)
      ? entreesRaw.map(readField).filter((field) => field.champ !== '')
      : [],
    sorties: Array.isArray(sortiesRaw)
      ? sortiesRaw.map(readOutput).filter((output) => output.champ !== '')
      : [],
  };
}

/* --- Résultats et avertissements ------------------------------------------- */

export type WarningLevel = 'avertissement' | 'information';

export interface CalculWarning {
  /** Texte affiché tel quel : il est rédigé par le moteur pour un agronome. */
  message: string;
  code: string | null;
  niveau: WarningLevel;
}

/**
 * Un avertissement peut arriver sous forme de chaîne ou d'objet ; les deux sont
 * acceptés. Ce qui n'est **jamais** accepté, c'est de le passer sous silence.
 */
export function readWarning(raw: unknown): CalculWarning {
  if (typeof raw === 'string') {
    return { message: raw, code: null, niveau: 'avertissement' };
  }
  const record = asRecord(raw);
  const niveau = pickText(record, 'niveau', 'gravite', 'severite', 'level').toLowerCase();
  return {
    message: pickText(record, 'message', 'libelle', 'texte', 'detail'),
    code: pickText(record, 'code') || null,
    niveau: niveau === 'info' || niveau === 'information' ? 'information' : 'avertissement',
  };
}

export function readWarnings(raw: unknown): CalculWarning[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(readWarning).filter((warning) => warning.message !== '');
}

/** Une grandeur affichée : sa valeur, **et son unité**. */
export interface ResultValue {
  champ: string;
  libelle: string;
  /** Valeur déjà mise en forme pour l'affichage. */
  texte: string;
  unite: string;
  principal: boolean;
  groupe: string | null;
}

export interface ResultGroup {
  titre: string;
  valeurs: ResultValue[];
}

function formatScalar(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value);
}

/**
 * Traduit la réponse du moteur en grandeurs affichables.
 *
 * Deux formes sont acceptées, parce que le contrat n'en fige pas une :
 *   - valeur riche : `{ valeur, unite, libelle, principal, groupe }` ;
 *   - scalaire nu, complété par le descripteur `sorties` du catalogue.
 *
 * Si ni l'un ni l'autre ne fournit l'unité, la valeur est affichée sans unité
 * plutôt que masquée — mais c'est un défaut à corriger côté serveur, pas une
 * situation normale : « un résultat sans son unité est une faute » (contrat,
 * § 6).
 */
export function readResults(
  resultats: unknown,
  module?: CalculModule | null,
): ResultValue[] {
  const record = asRecord(resultats);
  const declared = new Map((module?.sorties ?? []).map((output) => [output.champ, output]));

  const values: ResultValue[] = [];

  // L'ordre du catalogue prime : c'est l'ordre dans lequel l'ingénieur lit ses
  // résultats. Les grandeurs non déclarées suivent, dans l'ordre du serveur.
  const keys = [
    ...(module?.sorties ?? []).map((output) => output.champ).filter((key) => key in record),
    ...Object.keys(record).filter((key) => !declared.has(key)),
  ];

  for (const key of keys) {
    const raw = record[key];
    const isRich =
      raw !== null &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      ('valeur' in (raw as object) || 'value' in (raw as object));

    const rich = isRich ? asRecord(raw) : {};
    const spec = declared.get(key);

    values.push({
      champ: key,
      libelle: (isRich ? pickText(rich, 'libelle', 'label', 'nom') : '') || spec?.libelle || key,
      texte: formatScalar(isRich ? (rich.valeur ?? rich.value) : raw),
      unite: (isRich ? pickText(rich, 'unite', 'unit') : '') || spec?.unite || '',
      principal: isRich
        ? pickBoolean(rich, 'principal', 'majeur', 'primary') || Boolean(spec?.principal)
        : Boolean(spec?.principal),
      groupe: (isRich ? pickText(rich, 'groupe', 'section') : '') || spec?.groupe || null,
    });
  }

  return values;
}

/**
 * Répartit les grandeurs en « résultats principaux » et « valeurs
 * intermédiaires », de façon que l'écran ne ressemble jamais à une grille de
 * tableur.
 *
 * Le serveur décide, via `principal`. **Si personne ne décide**, on met en
 * évidence les trois premières grandeurs renvoyées : le moteur les émet dans
 * l'ordre où un ingénieur les lit, et trois valeurs saillantes valent mieux que
 * vingt valeurs plates. Ce repli disparaîtra dès que le catalogue déclarera ses
 * sorties.
 */
export function groupResults(values: ResultValue[]): ResultGroup[] {
  if (values.length === 0) return [];

  const named = values.filter((value) => value.groupe);
  if (named.length > 0) {
    const groups = new Map<string, ResultValue[]>();
    for (const value of values) {
      const titre = value.groupe ?? 'Autres valeurs';
      const bucket = groups.get(titre) ?? [];
      bucket.push(value);
      groups.set(titre, bucket);
    }
    return [...groups].map(([titre, valeurs]) => ({ titre, valeurs }));
  }

  const marked = values.filter((value) => value.principal);
  const principaux = marked.length > 0 ? marked : values.slice(0, 3);
  const autres = values.filter((value) => !principaux.includes(value));

  const groups: ResultGroup[] = [{ titre: 'Résultats principaux', valeurs: principaux }];
  if (autres.length > 0) {
    groups.push({ titre: 'Valeurs intermédiaires', valeurs: autres });
  }
  return groups;
}

/* --- Saisie ---------------------------------------------------------------- */

/** État d'un formulaire de calcul : une valeur de saisie par champ. */
export type CalculInputs = Record<string, string | boolean>;

/** Valeurs initiales d'un module, telles que le catalogue les propose. */
export function initialInputs(module: CalculModule, source?: Record<string, unknown>): CalculInputs {
  const inputs: CalculInputs = {};
  for (const field of module.entrees) {
    const provided = source?.[field.champ];
    if (provided !== undefined && provided !== null) {
      inputs[field.champ] =
        field.kind === 'booleen' ? Boolean(provided) : String(provided);
      continue;
    }
    inputs[field.champ] = field.defaut ?? (field.kind === 'booleen' ? false : '');
  }
  return inputs;
}

/**
 * Validation de saisie **triviale** : champ requis, nombre lisible, plage
 * annoncée par le catalogue. Rien de métier.
 *
 * Elle existe pour épargner un aller-retour réseau à l'utilisateur, pas pour
 * décider : le serveur revalide tout et c'est lui qui fait foi. Renvoie un
 * message par champ fautif.
 */
export function validateInputs(
  module: CalculModule,
  inputs: CalculInputs,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of module.entrees) {
    const value = inputs[field.champ];

    if (field.kind === 'booleen') continue;

    const text = typeof value === 'string' ? value.trim() : '';

    if (text === '') {
      if (field.obligatoire) errors[field.champ] = 'Ce champ est obligatoire.';
      continue;
    }

    if (field.kind !== 'nombre') continue;

    // La virgule décimale est celle du clavier français ; l'accepter n'est pas
    // une tolérance, c'est la saisie normale ici.
    const parsed = Number(text.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      errors[field.champ] = 'Saisissez un nombre.';
      continue;
    }
    if (field.min !== null && parsed < field.min) {
      errors[field.champ] = `La valeur doit être supérieure ou égale à ${formatNumber(field.min)}.`;
      continue;
    }
    if (field.max !== null && parsed > field.max) {
      errors[field.champ] = `La valeur doit être inférieure ou égale à ${formatNumber(field.max)}.`;
    }
  }

  return errors;
}

/**
 * Prépare le corps de la requête : conversion de type, rien de plus.
 *
 * Les champs facultatifs laissés vides ne sont pas envoyés — c'est au serveur
 * d'appliquer ses propres valeurs par défaut, pas à l'application d'en inventer.
 */
export function toRequestBody(
  module: CalculModule,
  inputs: CalculInputs,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  for (const field of module.entrees) {
    const value = inputs[field.champ];

    if (field.kind === 'booleen') {
      body[field.champ] = Boolean(value);
      continue;
    }

    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') continue;

    body[field.champ] =
      field.kind === 'nombre' ? Number(text.replace(',', '.')) : text;
  }

  return body;
}

/* --- Appels ---------------------------------------------------------------- */

export interface CalculOutcome {
  resultats: Record<string, unknown>;
  avertissements: CalculWarning[];
  engineVersion: string;
}

export async function fetchModules(signal?: AbortSignal): Promise<CalculModule[]> {
  const payload = await apiRequest<unknown>('/api/calculs/modules', { signal });
  const record = asRecord(payload);
  const raw = record.modules ?? payload;
  return Array.isArray(raw) ? raw.map(readModule).filter((m) => m.code !== '') : [];
}

export async function fetchReferenceTable(
  table: string,
  signal?: AbortSignal,
): Promise<ReferenceOption[]> {
  const payload = await apiRequest<unknown>(
    `/api/calculs/references/${encodeURIComponent(table)}`,
    { signal },
  );
  const record = asRecord(payload);
  const raw = record.valeurs ?? record.references ?? record[table] ?? payload;
  return readOptions(raw);
}

function readOutcome(payload: unknown): CalculOutcome {
  const record = asRecord(payload);
  return {
    resultats: asRecord(record.resultats),
    avertissements: readWarnings(record.avertissements),
    engineVersion: pickText(record, 'engineVersion', 'versionMoteur'),
  };
}

/** Calcul sans archivage — l'ingénieur essaie une hypothèse. */
export async function runCalcul(
  moduleCode: string,
  entrees: Record<string, unknown>,
): Promise<CalculOutcome> {
  const payload = await apiRequest<unknown>(
    `/api/calculs/${encodeURIComponent(moduleCode)}`,
    { method: 'POST', body: entrees },
  );
  return readOutcome(payload);
}

/** Calcul archivé dans un projet : le serveur recalcule puis enregistre. */
export async function saveCalcul(
  projectId: string,
  moduleCode: string,
  entrees: Record<string, unknown>,
): Promise<ArchivedCalcul> {
  const payload = await apiRequest<unknown>(
    `/api/projects/${encodeURIComponent(projectId)}/calculs`,
    { method: 'POST', body: { module: moduleCode, entrees } },
  );
  return readArchivedCalcul(asRecord(payload).calcul ?? payload);
}

export async function fetchProjectCalculs(
  projectId: string,
  signal?: AbortSignal,
): Promise<ArchivedCalcul[]> {
  const payload = await apiRequest<unknown>(
    `/api/projects/${encodeURIComponent(projectId)}/calculs`,
    { signal },
  );
  const record = asRecord(payload);
  const raw = record.calculs ?? payload;
  return Array.isArray(raw) ? raw.map(readArchivedCalcul) : [];
}

export async function deleteCalcul(projectId: string, calculId: string): Promise<void> {
  await apiRequest<void>(
    `/api/projects/${encodeURIComponent(projectId)}/calculs/${encodeURIComponent(calculId)}`,
    { method: 'DELETE' },
  );
}
