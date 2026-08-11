/**
 * Le lien WhatsApp du produit — un lien, et rien d'autre.
 *
 * Le cahier des charges est explicite sur ce point (`CLAUDE.md`, Vague 4) :
 * « un simple lien `wa.me/...` suffit ». Il n'y a donc ici **aucune API
 * WhatsApp, aucune dépendance, aucun appel réseau** : on fabrique une URL, le
 * navigateur (ou l'application WhatsApp du poste) fait le reste.
 *
 * C'est aussi le seul canal commercial du produit : le prospect ou le client
 * ouvre une conversation, et tout se règle humainement de l'autre côté. D'où
 * un message pré-rempli volontairement **incomplet** — il pose qui écrit, puis
 * s'arrête. C'est au client d'exposer sa demande ; lui souffler ses mots
 * donnerait un message de robot, et le destinataire le verrait tout de suite.
 *
 * Le numéro est déclaré une seule fois, ici. Il n'est recopié nulle part
 * ailleurs dans le code : le changer se fait donc à un seul endroit.
 */

/** Numéro du propriétaire (Sénégal), au format international sans « + ». */
const DEFAULT_WHATSAPP_NUMBER = '221778608247';

/**
 * Ne garde que les chiffres : un numéro saisi « +221 77 860 82 47 » dans un
 * fichier `.env` doit fonctionner sans que personne n'ait à se souvenir du
 * format attendu par `wa.me`.
 */
function normalizeNumber(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits === '' ? DEFAULT_WHATSAPP_NUMBER : digits;
}

/** Numéro effectivement utilisé par l'application. */
export const WHATSAPP_NUMBER: string = normalizeNumber(import.meta.env.VITE_WHATSAPP_NUMBER);

/**
 * Ce que l'application sait de la personne qui écrit.
 *
 * Volontairement plus permissif que `AuthUser` : les deux champs peuvent être
 * absents ou vides, et le message reste correct dans tous les cas.
 */
export interface WhatsAppContact {
  fullName?: string | null;
  company?: string | null;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Message pré-rempli, tel qu'il apparaîtra dans la zone de saisie de WhatsApp.
 *
 * Trois formes, selon ce que l'on sait de l'utilisateur :
 *   - nom et structure : « Bonjour, je suis Jean Diop (Bureau d'études Sahel) — client Irrigation Pro. »
 *   - nom seul         : « Bonjour, je suis Jean Diop — client Irrigation Pro. »
 *   - rien             : « Bonjour, je suis client Irrigation Pro. »
 *
 * Le troisième cas ne devrait pas se produire — le lien n'est affiché qu'à un
 * utilisateur connecté — mais un message amputé (« je suis  — client… ») serait
 * pire qu'une phrase un peu plus générale.
 */
export function buildWhatsAppMessage(contact: WhatsAppContact = {}): string {
  const fullName = clean(contact.fullName);
  const company = clean(contact.company);

  if (fullName === '') return 'Bonjour, je suis client Irrigation Pro.';
  if (company === '') return `Bonjour, je suis ${fullName} — client Irrigation Pro.`;
  return `Bonjour, je suis ${fullName} (${company}) — client Irrigation Pro.`;
}

/**
 * Lien complet à poser dans un `href`.
 *
 * `encodeURIComponent` prend en charge les accents, les espaces et les
 * caractères qui casseraient l'URL (`&`, `#`, `+`). Un nom comme
 * « Aïssatou & Fils » doit arriver intact dans la conversation.
 */
export function buildWhatsAppLink(contact: WhatsAppContact = {}): string {
  const message = buildWhatsAppMessage(contact);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
