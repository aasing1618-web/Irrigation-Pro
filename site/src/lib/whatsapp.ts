/**
 * Le lien WhatsApp du site — un lien, et rien d'autre.
 *
 * C'est le **seul** appel à l'action de la page, et le seul canal commercial du
 * produit : un visiteur ouvre une conversation, et tout se règle humainement de
 * l'autre côté. Aucune API WhatsApp, aucune dépendance, aucun appel réseau : on
 * fabrique une URL, le navigateur (ou l'application WhatsApp du téléphone) fait
 * le reste.
 *
 * Ce module reprend volontairement la logique de `app/src/lib/whatsapp.ts` sans
 * l'importer : le site et l'application sont deux projets séparés, avec leurs
 * propres dépendances et leur propre compilation. La différence tient en une
 * ligne — ici le visiteur est **inconnu**, le message ne porte donc aucun nom.
 */

/** Numéro du propriétaire (Sénégal), au format international sans « + ». */
const NUMERO_PAR_DEFAUT = '221778608247';

/**
 * Ne garde que les chiffres : un numéro écrit « +221 77 860 82 47 » dans un
 * fichier `.env` doit fonctionner sans que personne n'ait à se souvenir du
 * format attendu par `wa.me`.
 */
function normaliserNumero(brut: string | undefined): string {
  const chiffres = (brut ?? '').replace(/\D/g, '');
  return chiffres === '' ? NUMERO_PAR_DEFAUT : chiffres;
}

/** Numéro effectivement utilisé par le site. */
export const NUMERO_WHATSAPP: string = normaliserNumero(import.meta.env.VITE_WHATSAPP_NUMBER);

/**
 * Message pré-rempli, tel qu'il apparaîtra dans la zone de saisie de WhatsApp.
 *
 * Il pose le contexte puis s'arrête : c'est au visiteur d'écrire sa demande.
 * Lui souffler ses mots donnerait un message de robot, et le destinataire le
 * verrait immédiatement.
 */
export const MESSAGE_VISITEUR = 'Bonjour, je découvre Irrigation Pro et je souhaite en savoir plus.';

/**
 * Lien complet à poser dans un `href`.
 *
 * `encodeURIComponent` prend en charge les accents, les espaces et les
 * caractères qui casseraient l'URL.
 */
export function lienWhatsApp(message: string = MESSAGE_VISITEUR): string {
  return `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
