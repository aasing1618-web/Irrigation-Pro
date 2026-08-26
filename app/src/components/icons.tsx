/**
 * Jeu d'icônes du produit.
 *
 * Toutes les icônes sont dessinées à la main ici, sur une grille de 24×24, en
 * trait de 1,5 px, extrémités arrondies, sans remplissage. Une seule famille,
 * une seule graisse : c'est ce qui fait qu'une interface paraît construite.
 * Aucun emoji, aucun caractère Unicode ne tient lieu d'icône.
 *
 * Elles héritent de la couleur du texte (`currentColor`) et de sa taille
 * (`1em`), donc elles s'alignent naturellement avec le libellé qu'elles
 * accompagnent.
 */

import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
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
      {children}
    </svg>
  );
}

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

/* --- Navigation ----------------------------------------------------------- */

export function DashboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" />
    </Icon>
  );
}

export function ProjectsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h3.6a1.5 1.5 0 0 1 1.2.6l1 1.4H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.5 10.5h17" />
    </Icon>
  );
}

export function CalculationsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="3" width="15" height="18" rx="2" />
      <path d="M8 7.5h8M8 12h2.5M8 16h2.5M14.5 12h2M14.5 16h2" />
    </Icon>
  );
}

export function ReportsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3h7.2L19 8.6V21H6z" />
      <path d="M13 3v6h6" />
      <path d="M9.5 17v-3M12.5 17v-5M15.5 17v-2" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h5M13 12h7" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
      <circle cx="11" cy="12" r="2" />
    </Icon>
  );
}

/* --- États et actions ------------------------------------------------------ */

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.7 4.2 3.3 17a1.5 1.5 0 0 0 1.3 2.3h14.8a1.5 1.5 0 0 0 1.3-2.3L13.3 4.2a1.5 1.5 0 0 0-2.6 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 16.6h.01" />
    </Icon>
  );
}

export function DisconnectedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" />
      <path d="M8.4 8.4 5 11.8a4 4 0 0 0 5.7 5.7l3.4-3.4" />
      <path d="M15.6 15.6 19 12.2a4 4 0 0 0-5.7-5.7L9.9 9.9" />
    </Icon>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </Icon>
  );
}

export function ServerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4" width="17" height="6.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5" />
      <path d="M7 7.25h.01M7 16.75h.01" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l2.8 1.8" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Icon>
  );
}

/* --- Session et compte ----------------------------------------------------- */

export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="4.25" />
      <path d="m11 11 8 8M16.5 16.5 15 18M19 14l-1.5 1.5" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
    </Icon>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 4.5h3.25A1.75 1.75 0 0 1 19.5 6.25v11.5a1.75 1.75 0 0 1-1.75 1.75H14.5" />
      <path d="M10 8.25 6 12l4 3.75M6 12h9" />
    </Icon>
  );
}

/** Œil ouvert — « afficher le mot de passe ». */
export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.75 12S6 6.5 12 6.5 21.25 12 21.25 12 18 17.5 12 17.5 2.75 12 2.75 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </Icon>
  );
}

/** Œil barré — « masquer le mot de passe ». */
export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.2 6.8A8.9 8.9 0 0 1 12 6.5c6 0 9.25 5.5 9.25 5.5a16 16 0 0 1-3.2 3.7" />
      <path d="M6.4 8.4A15.9 15.9 0 0 0 2.75 12S6 17.5 12 17.5c1.2 0 2.3-.2 3.3-.6" />
      <path d="M9.9 9.9a2.75 2.75 0 0 0 3.9 3.9" />
    </Icon>
  );
}

/* --- Projets et calculs (Vague 2) ------------------------------------------ */

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.75" cy="10.75" r="6.25" />
      <path d="m15.5 15.5 4 4" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 19.5h4l10-10a2.12 2.12 0 0 0-3-3l-10 10z" />
      <path d="m14 6.5 3.5 3.5" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10.5 10v6.5M13.5 10v6.5" />
    </Icon>
  );
}

/** Boîte d'archives — « conserver ce calcul dans le projet ». */
export function ArchiveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4" width="17" height="4.5" rx="1.25" />
      <path d="M5.25 8.5v10A1.5 1.5 0 0 0 6.75 20h10.5a1.5 1.5 0 0 0 1.5-1.5v-10" />
      <path d="M10 12h4" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m10.5 6.5-5 5.5 5 5.5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Icon>
  );
}

/** Repère de localisation — le périmètre irrigué sur le terrain. */
export function MapPinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s6.5-6.1 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.5" />
    </Icon>
  );
}

/** Flèche de lancement — « calculer ». */
export function RunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m10 8.5 5 3.5-5 3.5z" />
    </Icon>
  );
}

/* --- Rapports (Vague 3) ---------------------------------------------------- */

/** Flèche vers un plateau — « enregistrer ce document sur mon ordinateur ». */
export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5v10.5" />
      <path d="m7.75 10 4.25 4 4.25-4" />
      <path d="M4.5 17v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.75h.01" />
    </Icon>
  );
}

/* --- Assistance et mises à jour (Vague 4) ---------------------------------- */

/**
 * Bulle de conversation — « écrire à votre fournisseur ».
 *
 * Volontairement générique : le logo de WhatsApp est une forme pleine et
 * bicolore, qui jurerait au milieu d'un jeu d'icônes en trait de 1,5 px. Le
 * libellé dit déjà de quel service il s'agit.
 */
export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 11.6c0 4-3.8 7.1-8.5 7.1a9.8 9.8 0 0 1-2.6-.35L4.5 20l1.3-3.4a6.7 6.7 0 0 1-2.3-5c0-3.9 3.8-7.1 8.5-7.1s8.5 3.2 8.5 7.1Z" />
      <path d="M9 11.6h.01M12 11.6h.01M15 11.6h.01" />
    </Icon>
  );
}

/** Menu burger — « ouvrir la navigation ». */
export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7.5h16M4 12h16M4 16.5h16" />
    </Icon>
  );
}

/** Croix de fermeture. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
    </Icon>
  );
}

