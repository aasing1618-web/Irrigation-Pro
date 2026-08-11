/**
 * Le bouton WhatsApp — le seul appel à l'action du site.
 *
 * C'est un `<a>` et non un `<button>` : l'action est une navigation vers
 * l'extérieur. Un lecteur d'écran, un clic du milieu et un « ouvrir dans un
 * nouvel onglet » ne traitent pas un lien comme un bouton.
 *
 * `target="_blank"` s'accompagne toujours de `rel="noopener noreferrer"` : sans
 * lui, la page ouverte garde une référence vers celle-ci et peut la faire
 * naviguer ailleurs.
 *
 * L'apparence reprend celle du bouton de l'application (`app/src/components/
 * Button.tsx`) : même hauteur, même rayon, même ombre, mêmes transitions.
 */

import { cn } from '../lib/cn';
import { lienWhatsApp } from '../lib/whatsapp';
import { ChatIcon } from './icons';

type Ton = 'principal' | 'surSombre' | 'discret';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-quart ' +
  'select-none whitespace-nowrap active:translate-y-px';

const tons: Record<Ton, string> = {
  principal:
    'h-11 px-5 text-md bg-brand-600 text-white border border-brand-700/60 shadow-raised ' +
    'hover:bg-brand-700 active:bg-brand-800',
  surSombre:
    'h-11 px-5 text-md bg-brand-50 text-brand-900 border border-white/20 shadow-raised ' +
    'hover:bg-white active:bg-brand-100',
  discret:
    'h-9 px-3.5 text-sm bg-transparent text-brand-100 border border-white/20 ' +
    'hover:bg-white/10 hover:text-white active:bg-white/15',
};

export interface LienWhatsAppProps {
  ton?: Ton;
  libelle?: string;
  className?: string;
}

export function LienWhatsApp({
  ton = 'principal',
  libelle = 'Écrire sur WhatsApp',
  className,
}: LienWhatsAppProps) {
  return (
    <a
      href={lienWhatsApp()}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, tons[ton], className)}
    >
      <ChatIcon className="text-[1.15em]" />
      <span>{libelle}</span>
    </a>
  );
}
