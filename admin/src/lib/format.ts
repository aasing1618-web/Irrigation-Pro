/**
 * Mise en forme des dates et des nombres, en français.
 *
 * Un seul endroit, comme dans l'application cliente : sinon une même date
 * s'affiche de deux façons d'un écran à l'autre et l'outil paraît bricolé.
 */

const NUMBER_FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatCount(value: number): string {
  return Number.isFinite(value) ? NUMBER_FORMAT.format(value) : '—';
}

/** Date seule : « 10 août 2026 ». */
export function formatDate(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? DATE_FORMAT.format(date) : '—';
}

/** Date et heure : « 10 août 2026, 14:05 ». */
export function formatDateTime(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? DATE_TIME_FORMAT.format(date) : '—';
}

/** Heure seule : « 14:05 ». Utilisée dans le journal, groupé par jour. */
export function formatTime(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? TIME_FORMAT.format(date) : '—';
}

/**
 * Ancienneté en clair : « aujourd'hui », « hier », « il y a 3 jours ».
 * Au-delà d'un mois, la date exacte redevient plus parlante qu'un écart.
 */
export function formatRelativeDate(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return 'jamais';

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 0) return formatDate(iso);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 31) return `il y a ${days} jours`;
  return formatDate(iso);
}

/**
 * Durée restante d'un verrou anti-force-brute : « encore 12 minutes ».
 * Renvoie `null` si la date est passée — le verrou est alors déjà levé.
 */
export function formatRemaining(iso: string | null | undefined): string | null {
  const date = toDate(iso);
  if (!date) return null;

  const minutes = Math.ceil((date.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return null;
  if (minutes === 1) return 'encore 1 minute';
  if (minutes < 60) return `encore ${minutes} minutes`;

  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'encore 1 heure' : `encore ${hours} heures`;
}

/** Vrai si l'horodatage tombe dans la journée en cours (heure locale). */
export function isToday(iso: string | null | undefined): boolean {
  const date = toDate(iso);
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** Clé de regroupement d'un journal par jour (« 2026-08-10 »). */
export function dayKey(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return 'inconnu';
  const mois = `${date.getMonth() + 1}`.padStart(2, '0');
  const jour = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${mois}-${jour}`;
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
