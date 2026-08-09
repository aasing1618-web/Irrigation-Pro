/**
 * Règle « HTTPS partout » du cahier des charges.
 *
 * L'application ne doit accepter une adresse en clair que sur la machine du
 * développeur. Partout ailleurs, elle doit échouer bruyamment plutôt que de
 * laisser passer des identifiants ou des données de projet non chiffrés.
 */

import { describe, expect, it } from 'vitest';
import { ConfigurationError, resolveApiUrl } from '../src/lib/config';

describe('adresse du serveur', () => {
  it('accepte une adresse https en production', () => {
    expect(resolveApiUrl('https://api.irrigation-pro.example', false)).toBe(
      'https://api.irrigation-pro.example',
    );
  });

  it('retire la barre oblique finale', () => {
    expect(resolveApiUrl('https://api.irrigation-pro.example/', false)).toBe(
      'https://api.irrigation-pro.example',
    );
  });

  it('refuse une adresse http en production', () => {
    expect(() => resolveApiUrl('http://api.irrigation-pro.example', false)).toThrow(
      ConfigurationError,
    );
  });

  it('refuse http vers une machine distante, même en développement', () => {
    expect(() => resolveApiUrl('http://192.168.1.40:4000', true)).toThrow(
      ConfigurationError,
    );
  });

  it('tolère http vers la machine locale en développement uniquement', () => {
    expect(resolveApiUrl('http://localhost:4000', true)).toBe('http://localhost:4000');
    expect(() => resolveApiUrl('http://localhost:4000', false)).toThrow(ConfigurationError);
  });

  it('refuse une adresse absente en production', () => {
    expect(() => resolveApiUrl(undefined, false)).toThrow(ConfigurationError);
    expect(() => resolveApiUrl('   ', false)).toThrow(ConfigurationError);
  });

  it('refuse une adresse illisible', () => {
    expect(() => resolveApiUrl('pas-une-adresse', false)).toThrow(ConfigurationError);
  });

  it('retombe sur le serveur local par défaut en développement', () => {
    expect(resolveApiUrl(undefined, true)).toBe('http://localhost:4000');
  });
});
