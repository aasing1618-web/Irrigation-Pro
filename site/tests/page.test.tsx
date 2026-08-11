/**
 * Ce que le site n'a pas le droit d'être.
 *
 * Le cahier des charges (`CLAUDE.md`, `docs/API-VAGUE-4.md` § 5) exclut
 * explicitement le prix, le panier, le paiement, l'inscription en ligne, le
 * mouchard analytique et toute ressource chargée depuis un tiers. Ces
 * interdictions ne sont pas des intentions : elles sont vérifiées ici, sur la
 * page réellement rendue et sur le fichier `index.html` réellement livré.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../src/App';
import { FAMILLES_DE_MODULES, NOMBRE_DE_MODULES } from '../src/contenu';
import { lienWhatsApp } from '../src/lib/whatsapp';

/**
 * Hôtes qui ne comptent pas comme une ressource distante :
 *
 *  - `www.w3.org` : identifiants d'espace de noms XML, ajoutés par le
 *    sérialiseur HTML autour des `<svg>`. Rien n'est jamais téléchargé.
 *  - `localhost` : autorisé par la politique de sécurité uniquement pour le
 *    rechargement à chaud du serveur de développement.
 */
const HOTES_TOLERES = new Set(['www.w3.org', 'localhost']);

/** Les hôtes réellement contactés par un morceau de balisage. */
function hotesExternes(balisage: string): string[] {
  const adresses = balisage.match(/(?:https?|wss?):\/\/[^"'\s<>)]+/g) ?? [];
  return adresses
    .map((adresse) => {
      // Les jokers de la politique de sécurité (`http://localhost:*`) ne sont
      // pas des URL valides : on retombe sur une extraction textuelle.
      const hote = /^[a-z]+:\/\/([^/:*]+)/.exec(adresse)?.[1] ?? adresse;
      return hote;
    })
    .filter((hote) => !HOTES_TOLERES.has(hote));
}

/** Le `index.html` réellement livré, lu depuis la racine du projet `site/`. */
const INDEX_HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');

describe('structure de la page', () => {
  it('n’a qu’un seul titre de premier niveau, qui annonce le produit', () => {
    render(<App />);
    const titres = screen.getAllByRole('heading', { level: 1 });
    expect(titres).toHaveLength(1);
    expect(titres[0]?.textContent ?? '').toMatch(/périmètre irrigué/i);
  });

  it('rend toutes les sections attendues', () => {
    const { container } = render(<App />);
    for (const id of ['haut', 'remplace', 'pour-qui', 'modules', 'rapport', 'acces']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('annonce chaque module de calcul réellement disponible', () => {
    render(<App />);
    const modules = FAMILLES_DE_MODULES.flatMap((famille) => famille.modules);
    expect(modules).toHaveLength(NOMBRE_DE_MODULES);
    for (const module of modules) {
      expect(screen.getAllByRole('heading', { name: module.nom }).length).toBeGreaterThan(0);
    }
  });

  it('dit ce que produit le logiciel et comment on l’obtient', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /note de calcul, pas une feuille de résultats/i }),
    ).toBeDefined();
    expect(screen.getByRole('heading', { name: /comment obtenir un accès/i })).toBeDefined();
  });

  it('affiche la version dans le pied de page', () => {
    const { container } = render(<App />);
    const pied = container.querySelector('footer');
    expect(pied).not.toBeNull();
    expect(pied?.textContent ?? '').toMatch(/Version du site/i);
    expect(pied?.textContent ?? '').toMatch(/\d+\.\d+\.\d+/);
  });
});

describe('le lien WhatsApp est le seul appel à l’action', () => {
  it('pointe le bon numéro avec le bon message, partout où il apparaît', () => {
    const { container } = render(<App />);
    const liens = Array.from(container.querySelectorAll('a[href^="http"]'));

    expect(liens.length).toBeGreaterThan(0);
    for (const lien of liens) {
      expect(lien.getAttribute('href')).toBe(lienWhatsApp());
      expect(lien.getAttribute('target')).toBe('_blank');
      expect(lien.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });
});

describe('interdits du cahier des charges', () => {
  it('ne contacte aucun hôte externe autre que wa.me', () => {
    const { container } = render(<App />);
    for (const hote of hotesExternes(container.innerHTML)) {
      expect(hote).toBe('wa.me');
    }
  });

  it('ne charge aucune ressource distante depuis index.html', () => {
    expect(hotesExternes(INDEX_HTML)).toHaveLength(0);
    expect(INDEX_HTML).not.toMatch(/fonts\.(googleapis|gstatic)/i);
    expect(INDEX_HTML).not.toMatch(/googletagmanager|google-analytics|plausible|matomo|hotjar/i);
  });

  it('ne contient aucun formulaire ni champ de saisie', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('form, input, select, textarea')).toHaveLength(0);
  });

  it('n’affiche ni prix, ni panier, ni invitation à créer un compte soi-même', () => {
    const { container } = render(<App />);
    const texte = container.textContent ?? '';

    for (const interdit of [
      /\bpanier\b/i,
      /\bacheter\b/i,
      /\bachat\b/i,
      /\bprix\b/i,
      /\btarifs?\b/i,
      /\babonnements?\b/i,
      /\bs[’']inscrire\b/i,
      /\binscription\b/i,
      /\bcréer\s+(?:un|votre)\s+compte\b/i,
      /(?:€|\$|FCFA|XOF)/,
    ]) {
      expect(texte).not.toMatch(interdit);
    }
  });

  it('n’invente aucun témoignage ni aucun chiffre de notoriété', () => {
    const { container } = render(<App />);
    const texte = container.textContent ?? '';
    expect(texte).not.toMatch(/nous font confiance|clients satisfaits|témoignages?\b/i);
    expect(texte).not.toMatch(/\bplus de \d/i);
  });

  it('n’effectue aucun appel réseau au rendu', () => {
    render(<App />);
    expect(fetch).not.toHaveBeenCalled();
  });
});
