/**
 * Mise en forme des nombres et des dates, en français.
 *
 * Un seul endroit : sinon une même grandeur s'affiche « 12.5 » sur un écran et
 * « 12,50 » sur le suivant, et l'utilisateur doute du logiciel avant de douter
 * de sa saisie.
 *
 * Aucune de ces fonctions ne calcule quoi que ce soit : elles habillent une
 * valeur déjà produite par le serveur (décision D-007).
 */

const NUMBER_FORMAT = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 3,
});

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

/**
 * Nombre lisible : séparateur de milliers, virgule décimale, trois décimales
 * au plus. Les valeurs très petites ou très grandes basculent en notation
 * scientifique plutôt que d'afficher « 0 » ou une file de zéros.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 1e9)) {
    return value.toExponential(2).replace('.', ',');
  }
  return NUMBER_FORMAT.format(value);
}

/** Date seule : « 09 août 2026 ». */
export function formatDate(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? DATE_FORMAT.format(date) : '—';
}

/** Date et heure : « 09 août 2026, 14:05 ». */
export function formatDateTime(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? DATE_TIME_FORMAT.format(date) : '—';
}

/**
 * Ancienneté en clair : « aujourd'hui », « hier », « il y a 3 jours ».
 *
 * Au-delà d'un mois, la date exacte redevient plus parlante qu'un écart.
 */
export function formatRelativeDate(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return '—';

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 0) return formatDate(iso);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 31) return `il y a ${days} jours`;
  return formatDate(iso);
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
