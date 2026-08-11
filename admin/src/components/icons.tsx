/**
 * Jeu d'icônes du dashboard.
 *
 * Mêmes règles que dans l'application cliente, et pour la même raison — c'est
 * un seul produit : grille de 24×24, trait de 1,5 px, extrémités arrondies,
 * sans remplissage. Une seule famille, une seule graisse. Aucun emoji, aucun
 * caractère Unicode ne tient lieu d'icône.
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

/* --- Marque (identique à l'application cliente) ---------------------------- */

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

/* --- Navigation ------------------------------------------------------------ */

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
      <path d="M9.75 20.5v-6h4.5v6" />
    </Icon>
  );
}

/** Deux silhouettes : la liste des comptes clients. */
export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9.5" cy="8.5" r="3.5" />
      <path d="M3.5 19.5a6 6 0 0 1 12 0" />
      <path d="M16 5.4a3.5 3.5 0 0 1 0 6.2" />
      <path d="M17.5 14.6a6 6 0 0 1 3 4.9" />
    </Icon>
  );
}

export function JournalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
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

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.75h.01" />
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

/** Cadenas ouvert — la réactivation rend l'accès. */
export function UnlockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 7.5-1.9" />
    </Icon>
  );
}

/** Disque barré — suspendre un compte. */
export function BanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

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

/** Deux feuillets superposés — « copier ». */
export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
    </Icon>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 5.5L20 7" />
    </Icon>
  );
}

/** Immeuble — la société du client. */
export function BuildingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14.5 5v15.5" />
      <path d="M14.5 10h3A1.5 1.5 0 0 1 19 11.5v9" />
      <path d="M3.5 20.5h17" />
      <path d="M8.5 7h3M8.5 11h3M8.5 15h3" />
    </Icon>
  );
}

/** Dossier — le compteur de projets d'un compte (jamais leur contenu). */
export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h3.6a1.5 1.5 0 0 1 1.2.6l1 1.4H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
    </Icon>
  );
}

/** Bouclier — le rôle administrateur. */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.25 19 6v5.6c0 4.2-2.8 7.6-7 9.15-4.2-1.55-7-4.95-7-9.15V6z" />
      <path d="m9.25 12 2 2 3.5-3.75" />
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
