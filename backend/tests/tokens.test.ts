/**
 * Tests des jetons de session.
 *
 * L'enjeu : un jeton d'accès ne doit être accepté que s'il vient de NOUS, qu'il
 * n'a pas été retouché, et qu'il n'est pas périmé. Chaque test ci-dessous
 * correspond à une façon connue de contourner une vérification JWT bâclée.
 */

import { SignJWT, decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';

import { config } from '../src/config.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_AUDIENCE,
  JWT_ISSUER,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '../src/auth/tokens.js';

const COMPTE = { id: '11111111-1111-4111-8111-111111111111', role: 'CLIENT' as const };

const cleLegitime = new TextEncoder().encode(config.jwtSecret);
const cleEtrangere = new TextEncoder().encode('une-autre-cle-totalement-differente-de-la-notre');

/** Fabrique un jeton sur mesure pour éprouver une vérification précise. */
async function fabriquerJeton(options: {
  cle?: Uint8Array;
  issuer?: string;
  audience?: string;
  expDansSecondes?: number;
  charge?: Record<string, unknown>;
}): Promise<string> {
  const maintenant = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: 'CLIENT', ...options.charge })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(COMPTE.id)
    .setJti('jeton-de-test')
    .setIssuedAt(maintenant)
    .setExpirationTime(maintenant + (options.expDansSecondes ?? 900))
    .setIssuer(options.issuer ?? JWT_ISSUER)
    .setAudience(options.audience ?? JWT_AUDIENCE)
    .sign(options.cle ?? cleLegitime);
}

describe('Jeton d’accès', () => {
  it('se vérifie et renvoie exactement les champs prévus par le contrat', async () => {
    const jeton = await signAccessToken(COMPTE);
    const charge = await verifyAccessToken(jeton);

    expect(Object.keys(charge).sort()).toEqual(['exp', 'iat', 'jti', 'role', 'sub']);
    expect(charge.sub).toBe(COMPTE.id);
    expect(charge.role).toBe('CLIENT');
    expect(charge.exp - charge.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('ne transporte ni le statut du compte ni mustChangePassword', async () => {
    const brut = decodeJwt(await signAccessToken(COMPTE)) as Record<string, unknown>;

    expect(brut).not.toHaveProperty('status');
    expect(brut).not.toHaveProperty('mustChangePassword');
    expect(brut).not.toHaveProperty('must_change_password');
    expect(brut).not.toHaveProperty('email');
    expect(brut).not.toHaveProperty('password_hash');
  });

  it('attribue un jti différent à chaque jeton', async () => {
    const premier = await verifyAccessToken(await signAccessToken(COMPTE));
    const second = await verifyAccessToken(await signAccessToken(COMPTE));
    expect(premier.jti).not.toBe(second.jti);
  });

  it('refuse un jeton expiré', async () => {
    const jeton = await fabriquerJeton({ expDansSecondes: -60 });
    await expect(verifyAccessToken(jeton)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('refuse un jeton signé avec un autre secret', async () => {
    const jeton = await fabriquerJeton({ cle: cleEtrangere });
    await expect(verifyAccessToken(jeton)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('refuse un jeton dont la charge utile a été modifiée', async () => {
    const jeton = await signAccessToken(COMPTE);
    const [entete, charge, signature] = jeton.split('.');
    expect(entete && charge && signature).toBeTruthy();

    const chargeDecodee = JSON.parse(
      Buffer.from(charge as string, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    // Tentative d'élévation de privilège : passer CLIENT à ADMIN.
    chargeDecodee['role'] = 'ADMIN';
    const chargeFalsifiee = Buffer.from(JSON.stringify(chargeDecodee)).toString('base64url');

    const jetonFalsifie = `${entete}.${chargeFalsifiee}.${signature}`;
    await expect(verifyAccessToken(jetonFalsifie)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('refuse un jeton dont l’émetteur est inattendu', async () => {
    const jeton = await fabriquerJeton({ issuer: 'un-autre-service' });
    await expect(verifyAccessToken(jeton)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('refuse un jeton dont le destinataire est inattendu', async () => {
    const jeton = await fabriquerJeton({ audience: 'une-autre-application' });
    await expect(verifyAccessToken(jeton)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('refuse un jeton dont le rôle est absent ou fantaisiste', async () => {
    const sansRole = await fabriquerJeton({ charge: { role: undefined } });
    await expect(verifyAccessToken(sansRole)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });

    const roleInvente = await fabriquerJeton({ charge: { role: 'SUPERADMIN' } });
    await expect(verifyAccessToken(roleInvente)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('refuse une valeur qui n’est pas un jeton', async () => {
    for (const valeur of ['', 'pas-un-jeton', 'a.b.c', 'Bearer quelque-chose']) {
      await expect(verifyAccessToken(valeur)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    }
  });
});

describe('Jeton de rafraîchissement', () => {
  it('n’est pas un JWT et varie à chaque tirage', () => {
    const premier = generateRefreshToken();
    const second = generateRefreshToken();

    expect(premier.token).not.toBe(second.token);
    expect(premier.token).not.toContain('.');
    // 32 octets en base64url = 43 caractères.
    expect(premier.token).toHaveLength(43);
    expect(premier.token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produit une empreinte stable, différente du jeton lui-même', () => {
    const { token, tokenHash } = generateRefreshToken();

    expect(hashRefreshToken(token)).toBe(tokenHash);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).not.toContain(token);
    // SHA-256 en hexadécimal.
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('donne des empreintes distinctes pour deux jetons distincts', () => {
    const premier = generateRefreshToken();
    const second = generateRefreshToken();
    expect(premier.tokenHash).not.toBe(second.tokenHash);
  });

  it('expire à la durée configurée', () => {
    const { expiresAt } = generateRefreshToken();
    const joursAttendus = config.refreshTokenTtlDays;
    const ecartJours = (expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000);

    expect(ecartJours).toBeGreaterThan(joursAttendus - 0.01);
    expect(ecartJours).toBeLessThanOrEqual(joursAttendus);
  });
});
