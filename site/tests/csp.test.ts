/**
 * La politique de sécurité du site publié.
 *
 * `index.html` porte une CSP qui autorise `ws://localhost:*` et
 * `http://localhost:*` dans `connect-src` : sans cela, le rechargement à chaud
 * de Vite ne fonctionnerait pas pendant le développement.
 *
 * Cette tolérance ne doit **jamais** se retrouver dans le site publié. Le site
 * ne parle à aucun serveur : `connect-src 'self'` lui suffit. Une CSP de
 * production qui autorise `localhost` est une porte laissée entrouverte sans
 * aucune contrepartie — et c'est le genre d'oubli qu'on ne voit pas, puisque
 * le site fonctionne parfaitement avec.
 *
 * Le défaut avait été introduit une première fois. Ce test est là pour qu'il
 * ne revienne pas.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { retirerToleranceDevCsp } from '../build/csp';

// `process.cwd()` plutôt que `import.meta.url` : sous jsdom, l'URL du module
// n'est pas une URL de fichier et `fileURLToPath` refuse de la convertir.
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');

describe('politique de sécurité du site publié', () => {
  it('part bien d’un index.html qui tolère localhost pour le développement', () => {
    // Si cette ligne casse un jour, c'est que la CSP a été réécrite : il faut
    // alors vérifier que le test ci-dessous a toujours du sens.
    expect(indexHtml).toContain('ws://localhost:*');
  });

  it('retire toute mention de localhost de la version compilée', () => {
    const publié = retirerToleranceDevCsp(indexHtml);

    expect(publié).not.toContain('localhost');
    expect(publié).toContain("connect-src 'self'");
  });

  it('conserve intactes les autres directives, qui sont l’essentiel', () => {
    const publié = retirerToleranceDevCsp(indexHtml);

    // `form-action 'none'` : le site ne soumet aucun formulaire, et ne doit
    // jamais pouvoir en soumettre un — c'est une vitrine, pas une boutique.
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ]) {
      expect(publié).toContain(directive);
    }
  });
});
