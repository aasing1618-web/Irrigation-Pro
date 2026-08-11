/**
 * Les photographies du site.
 *
 * ## Le défaut que ces tests attrapent
 *
 * Une image cassée ne fait échouer aucun test classique. Le composant rend son
 * `<img>`, React est content, le build passe — et le visiteur voit un cadre
 * vide. C'est exactement le genre de défaut qui ne se découvre qu'en regardant
 * la page, c'est-à-dire trop tard.
 *
 * On vérifie donc ici trois choses qu'aucun autre test ne couvre :
 *
 * 1. chaque photo déclarée existe réellement sur le disque ;
 * 2. chaque `<img>` de la page pointe vers une photo déclarée, jamais vers un
 *    chemin écrit à la main dans un composant ;
 * 3. les textes alternatifs suivent la règle d'accessibilité : une photo
 *    décorative est masquée aux lecteurs d'écran, une photo porteuse de sens
 *    est décrite.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { App } from '../src/App';
import * as photos from '../src/photos';
import type { Photo } from '../src/photos';

/** Toutes les photos exportées par le registre, sans avoir à les recopier. */
const DECLAREES: readonly Photo[] = Object.values(photos).filter(
  (valeur): valeur is Photo =>
    typeof valeur === 'object' && valeur !== null && 'src' in valeur && 'alt' in valeur,
);

const RACINE_PUBLIQUE = join(process.cwd(), 'public');

describe('registre des photographies', () => {
  it('déclare au moins une photo', () => {
    expect(DECLAREES.length).toBeGreaterThan(0);
  });

  it('pointe vers des fichiers qui existent vraiment', () => {
    for (const photo of DECLAREES) {
      const chemin = join(RACINE_PUBLIQUE, photo.src);
      expect(existsSync(chemin), `fichier manquant : ${photo.src}`).toBe(true);
      expect(statSync(chemin).size, `fichier vide : ${photo.src}`).toBeGreaterThan(1024);
    }
  });

  it('sert les photos depuis le site lui-même, jamais depuis un tiers', () => {
    // La politique de sécurité de la page est `default-src 'self'` : une image
    // hébergée ailleurs serait bloquée par le navigateur, sans message.
    for (const photo of DECLAREES) {
      expect(photo.src.startsWith('/photos/'), `chemin inattendu : ${photo.src}`).toBe(true);
      expect(photo.src).not.toMatch(/^https?:/);
    }
  });

  it('annonce des dimensions cohérentes, pour que la page ne saute pas au chargement', () => {
    for (const photo of DECLAREES) {
      expect(photo.width, photo.src).toBeGreaterThan(0);
      expect(photo.height, photo.src).toBeGreaterThan(0);
    }
  });
});

describe('photographies rendues dans la page', () => {
  function imagesDeLaPage(): HTMLImageElement[] {
    const { container } = render(<App />);
    return [...container.querySelectorAll('img')];
  }

  it('affiche au moins une photographie', () => {
    expect(imagesDeLaPage().length).toBeGreaterThan(0);
  });

  it('n’affiche que des photos passées par le registre', () => {
    const connues = new Set(DECLAREES.map((p) => p.src));

    for (const image of imagesDeLaPage()) {
      const src = image.getAttribute('src') ?? '';
      expect(connues.has(src), `image hors registre : « ${src} »`).toBe(true);
    }
  });

  it('décrit les photos porteuses de sens et masque les photos décoratives', () => {
    for (const image of imagesDeLaPage()) {
      const alt = image.getAttribute('alt') ?? '';
      const masquee = image.getAttribute('aria-hidden') === 'true';

      if (alt.trim() === '') {
        // Un `alt` vide est correct — à condition que l'image soit aussi
        // masquée. Sans cela, certains lecteurs d'écran annoncent le nom du
        // fichier, ce qui est pire que le silence.
        expect(masquee, `photo sans description ni aria-hidden : ${image.getAttribute('src')}`).toBe(
          true,
        );
      } else {
        expect(masquee, `photo décrite mais masquée : ${image.getAttribute('src')}`).toBe(false);
        expect(alt.length, `description trop courte : ${alt}`).toBeGreaterThan(15);
      }
    }
  });

  it('réserve la place de chaque image pour éviter les sauts de mise en page', () => {
    for (const image of imagesDeLaPage()) {
      expect(image.getAttribute('width'), image.getAttribute('src') ?? '').toBeTruthy();
      expect(image.getAttribute('height'), image.getAttribute('src') ?? '').toBeTruthy();
    }
  });
});
