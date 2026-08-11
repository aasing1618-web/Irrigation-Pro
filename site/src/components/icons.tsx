/**
 * Les deux seules icônes du site.
 *
 * Mêmes dessins que dans l'application et le dashboard : grille de 24×24, trait
 * de 1,5 px, extrémités arrondies, aucun remplissage. Elles héritent de la
 * couleur et de la taille du texte qu'elles accompagnent. Aucun emoji, aucun
 * caractère Unicode ne tient lieu d'icône.
 */

import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

/* --- Marque ---------------------------------------------------------------
   Une goutte posée sur trois lignes d'écoulement : l'eau et le canal, les deux
   objets du logiciel. Géométrie pure, lisible à 20 px comme à 96 px. */
export function BrandMark(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M12 2.75c3.4 3.7 5.1 6.55 5.1 8.86A5.1 5.1 0 0 1 12 16.7a5.1 5.1 0 0 1-5.1-5.09c0-2.31 1.7-5.16 5.1-8.86Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path
        d="M12 8.4c-1.2 1.4-1.8 2.4-1.8 3.2"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.55}
      />
      <path
        d="M3.5 19.4h17M6.5 22h11"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.75}
      />
    </svg>
  );
}

/**
 * Bulle de conversation — « écrire au propriétaire ».
 *
 * Volontairement générique : le logo de WhatsApp est une forme pleine et
 * bicolore, qui jurerait dans un jeu d'icônes en trait de 1,5 px. Le libellé du
 * bouton dit déjà de quel service il s'agit.
 */
export function ChatIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M20.5 11.6c0 4-3.8 7.1-8.5 7.1a9.8 9.8 0 0 1-2.6-.35L4.5 20l1.3-3.4a6.7 6.7 0 0 1-2.3-5c0-3.9 3.8-7.1 8.5-7.1s8.5 3.2 8.5 7.1Z" />
      <path d="M9 11.6h.01M12 11.6h.01M15 11.6h.01" />
    </svg>
  );
}
