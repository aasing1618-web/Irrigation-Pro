/**
 * Le lien WhatsApp est le seul appel à l'action du site. S'il est faux, le site
 * ne sert à rien : ces tests valident le numéro, le message et l'encodage.
 */

import { describe, expect, it } from 'vitest';

import { MESSAGE_VISITEUR, NUMERO_WHATSAPP, lienWhatsApp } from '../src/lib/whatsapp';

describe('lien WhatsApp du site', () => {
  it('porte le numéro du propriétaire', () => {
    expect(NUMERO_WHATSAPP).toBe('221778608247');
  });

  it('porte le message pré-rempli exigé par le contrat de la Vague 4', () => {
    expect(MESSAGE_VISITEUR).toBe(
      'Bonjour, je découvre Irrigation Pro et je souhaite en savoir plus.',
    );
  });

  it('produit une URL wa.me complète et correctement encodée', () => {
    expect(lienWhatsApp()).toBe(
      'https://wa.me/221778608247?text=' +
        'Bonjour%2C%20je%20d%C3%A9couvre%20Irrigation%20Pro%20et%20je%20souhaite%20en%20savoir%20plus.',
    );
  });

  it('laisse le message intact après décodage — accents et virgule compris', () => {
    const texte = new URL(lienWhatsApp()).searchParams.get('text');
    expect(texte).toBe(MESSAGE_VISITEUR);
  });

  it('encode les caractères qui casseraient l’URL', () => {
    const lien = lienWhatsApp('Périmètre & débit #1');
    expect(lien).toContain('%26');
    expect(lien).toContain('%23');
    expect(new URL(lien).searchParams.get('text')).toBe('Périmètre & débit #1');
  });
});
