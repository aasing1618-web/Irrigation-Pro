/**
 * Tests du hachage des mots de passe.
 *
 * Chaque calcul `scrypt` coûte volontairement ~200 ms (c'est le but d'une
 * fonction de dérivation lente), d'où les délais élargis sur certains tests.
 */

import { randomBytes, scrypt } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  LONGUEUR_MAX_MOT_DE_PASSE,
  LONGUEUR_MIN_MOT_DE_PASSE,
  LONGUEUR_MOT_DE_PASSE_TEMPORAIRE,
  checkPasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from '../src/auth/password.js';

const MOT_DE_PASSE = 'une-phrase-de-passe-correcte-2026';

describe('hashPassword / verifyPassword', () => {
  it('produit une empreinte auto-descriptive au format attendu', async () => {
    const empreinte = await hashPassword(MOT_DE_PASSE);

    const morceaux = empreinte.split('$');
    expect(morceaux).toHaveLength(6);
    expect(morceaux[0]).toBe('scrypt');
    expect(Number(morceaux[1])).toBe(65_536);
    expect(Number(morceaux[2])).toBe(8);
    expect(Number(morceaux[3])).toBe(1);
    // Le mot de passe en clair n'apparaît nulle part dans la chaîne stockée.
    expect(empreinte).not.toContain(MOT_DE_PASSE);
  }, 20_000);

  it('vérifie un mot de passe correct', async () => {
    const empreinte = await hashPassword(MOT_DE_PASSE);
    await expect(verifyPassword(MOT_DE_PASSE, empreinte)).resolves.toBe(true);
  }, 20_000);

  it('refuse un mot de passe faux', async () => {
    const empreinte = await hashPassword(MOT_DE_PASSE);
    await expect(verifyPassword('mauvais-mot-de-passe', empreinte)).resolves.toBe(false);
    await expect(verifyPassword('', empreinte)).resolves.toBe(false);
    await expect(verifyPassword(`${MOT_DE_PASSE} `, empreinte)).resolves.toBe(false);
  }, 20_000);

  it('produit deux empreintes différentes pour le même mot de passe (sel aléatoire)', async () => {
    const [premiere, seconde] = await Promise.all([
      hashPassword(MOT_DE_PASSE),
      hashPassword(MOT_DE_PASSE),
    ]);

    expect(premiere).not.toBe(seconde);
    // Les deux restent vérifiables : c'est bien le sel qui diffère, pas le reste.
    await expect(verifyPassword(MOT_DE_PASSE, premiere)).resolves.toBe(true);
    await expect(verifyPassword(MOT_DE_PASSE, seconde)).resolves.toBe(true);
  }, 20_000);

  it('relit les paramètres depuis la chaîne stockée', async () => {
    // Empreinte fabriquée avec des réglages plus faibles (N = 2^14, sortie de
    // 32 octets), comme si elle datait d'avant un durcissement. Elle doit
    // rester vérifiable : c'est ce qui permettra de changer les paramètres sans
    // invalider les comptes existants.
    const sel = randomBytes(16);
    const ancienneEmpreinte: Buffer = await new Promise((resoudre, rejeter) => {
      scrypt(MOT_DE_PASSE, sel, 32, { N: 16_384, r: 8, p: 1, maxmem: 128 * 16_384 * 8 * 2 }, (err, cle) =>
        err ? rejeter(err) : resoudre(cle),
      );
    });

    const stockee = [
      'scrypt',
      16_384,
      8,
      1,
      sel.toString('base64'),
      ancienneEmpreinte.toString('base64'),
    ].join('$');

    await expect(verifyPassword(MOT_DE_PASSE, stockee)).resolves.toBe(true);
    await expect(verifyPassword('autre-chose', stockee)).resolves.toBe(false);
  }, 20_000);

  it('renvoie false sans lever d’exception sur une chaîne stockée corrompue', async () => {
    const empreinteValide = await hashPassword(MOT_DE_PASSE);

    const chainesCorrompues = [
      '',
      'nimportequoi',
      'scrypt$65536$8$1$selincomplet',
      'scrypt$65536$8$1$sel$hash$de$trop',
      'argon2$65536$8$1$c2Vs$aGFzaA==',
      'scrypt$zero$8$1$c2Vs$aGFzaA==',
      'scrypt$65536$8$1$$aGFzaA==',
      'scrypt$65536$8$1$c2Vs$',
      // N non puissance de deux : refusé plutôt que passé à scrypt.
      'scrypt$65537$8$1$c2Vs$aGFzaA==',
      // N absurde : refusé sans jamais lancer un calcul de plusieurs minutes.
      'scrypt$1073741824$8$1$c2Vs$aGFzaA==',
      // Empreinte tronquée d'une chaîne par ailleurs valide.
      empreinteValide.slice(0, empreinteValide.length - 10),
    ];

    for (const corrompue of chainesCorrompues) {
      await expect(verifyPassword(MOT_DE_PASSE, corrompue)).resolves.toBe(false);
    }
  }, 30_000);
});

describe('verifyDummyPassword', () => {
  it('s’exécute sans erreur et prend un temps comparable à une vraie vérification', async () => {
    const empreinte = await hashPassword(MOT_DE_PASSE);

    const departReel = Date.now();
    await verifyPassword('mauvais', empreinte);
    const dureeReelle = Date.now() - departReel;

    const departFactice = Date.now();
    await verifyDummyPassword();
    const dureeFactice = Date.now() - departFactice;

    // Tolérance large : une machine partagée fait varier les mesures. Ce qu'on
    // vérifie, c'est l'ordre de grandeur — pas 1 ms contre 200 ms.
    expect(dureeFactice).toBeGreaterThan(dureeReelle / 4);
    expect(dureeFactice).toBeLessThan(dureeReelle * 4 + 500);
  }, 20_000);
});

describe('generateTemporaryPassword', () => {
  it('a la longueur attendue et dépasse 16 caractères', () => {
    const motDePasse = generateTemporaryPassword();
    expect(motDePasse).toHaveLength(LONGUEUR_MOT_DE_PASSE_TEMPORAIRE);
    expect(motDePasse.length).toBeGreaterThanOrEqual(16);
  });

  it('varie à chaque appel', () => {
    const tirages = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
    expect(tirages.size).toBe(50);
  });

  it('n’utilise aucun caractère ambigu', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(generateTemporaryPassword()).toMatch(/^[A-HJ-NP-Za-km-z2-9-]+$/);
    }
  });

  it('respecte la politique de mot de passe', () => {
    expect(checkPasswordPolicy(generateTemporaryPassword())).toEqual({ ok: true });
  });
});

describe('checkPasswordPolicy', () => {
  it('accepte un mot de passe suffisamment long', () => {
    expect(checkPasswordPolicy('une phrase que je retiens')).toEqual({ ok: true });
    // Exactement à la limite basse.
    expect(checkPasswordPolicy('kR7pmZq2vt')).toEqual({ ok: true });
    expect(checkPasswordPolicy('kR7pmZq2v'.padEnd(LONGUEUR_MAX_MOT_DE_PASSE, 'x'))).toEqual({
      ok: true,
    });
  });

  it('refuse un mot de passe trop court', () => {
    const resultat = checkPasswordPolicy('court1');
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toContain('10 caractères');
  });

  it('refuse un mot de passe trop long', () => {
    const resultat = checkPasswordPolicy('x'.repeat(LONGUEUR_MAX_MOT_DE_PASSE + 1));
    expect(resultat.ok).toBe(false);
  });

  it('refuse une chaîne vide', () => {
    expect(checkPasswordPolicy('').ok).toBe(false);
  });

  it('refuse une suite d’espaces déguisée en mot de passe', () => {
    expect(checkPasswordPolicy('   a         ').ok).toBe(false);
  });

  it('refuse les mots de passe manifestement courants, quelle que soit la casse', () => {
    for (const courant of ['password123', 'Password123', 'MOTDEPASSE123', 'azertyuiop']) {
      const resultat = checkPasswordPolicy(courant);
      expect(resultat.ok).toBe(false);
      if (!resultat.ok) expect(resultat.reason).toContain('trop courant');
    }
  });

  it('renvoie un message en français, affichable tel quel', () => {
    const resultat = checkPasswordPolicy('abc');
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.reason).toMatch(/^Le mot de passe/);
      expect(resultat.reason).not.toMatch(/[Ee]rror|undefined|null/);
    }
  });
});
