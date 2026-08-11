/**
 * La barre du haut, collée en tête de page.
 *
 * Elle est sombre en permanence, comme la barre latérale du logiciel : c'est le
 * même bandeau de marque, et il fait la jonction visuelle entre le site et
 * l'application. Fond plein, sans flou ni transparence — le texte qui défile
 * derrière ne doit jamais transparaître sous les libellés.
 *
 * Elle porte l'unique appel à l'action du site, pour qu'il reste atteignable
 * quel que soit l'endroit où le visiteur s'est arrêté de lire.
 */

import { LienWhatsApp } from './LienWhatsApp';
import { BrandMark } from './icons';

const LIENS = [
  { href: '#modules', libelle: 'Modules de calcul' },
  { href: '#rapport', libelle: 'Rapport PDF' },
  { href: '#acces', libelle: 'Obtenir un accès' },
] as const;

export function EnTete() {
  return (
    <header
      data-surface="dark"
      className="sticky top-0 z-50 border-b border-white/10 bg-brand-950"
    >
      <a
        href="#contenu"
        className="sr-only rounded-sm bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900 focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10"
      >
        Aller au contenu
      </a>

      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-6 sm:px-8">
        <a
          href="#haut"
          className="flex items-center gap-2.5 rounded-sm text-white"
          aria-label="Irrigation Pro — haut de page"
        >
          <span className="text-[1.4rem] text-brand-300">
            <BrandMark />
          </span>
          <span className="text-md font-semibold tracking-[-0.02em]">Irrigation&nbsp;Pro</span>
        </a>

        <nav aria-label="Sections de la page" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-7">
            {LIENS.map((lien) => (
              <li key={lien.href}>
                <a
                  href={lien.href}
                  className="rounded-sm text-sm text-brand-200 transition-colors duration-150 ease-out-quart hover:text-white"
                >
                  {lien.libelle}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto lg:ml-0">
          <LienWhatsApp ton="discret" libelle="WhatsApp" />
        </div>
      </div>
    </header>
  );
}
