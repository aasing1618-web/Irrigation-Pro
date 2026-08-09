/**
 * Tests de l'endpoint de supervision — Vague 0.
 *
 * Contrainte : ces tests tournent SANS PostgreSQL. La couche `db` est
 * entièrement moquée, ce qui permet aussi de simuler une base en panne — chose
 * impossible à provoquer proprement avec une vraie base.
 */

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Doit être déclaré avant l'import de l'application : `vi.mock` est remonté en
// tête de fichier par Vitest, et la factory ne doit référencer que des
// variables préfixées `mock` (règle de hoisting).
const mockCheckDatabase = vi.fn();

vi.mock('../src/db/index.js', () => ({
  checkDatabase: () => mockCheckDatabase(),
  query: vi.fn(),
  withTransaction: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));

const { createApp } = await import('../src/app.js');

const app = createApp();

beforeEach(() => {
  mockCheckDatabase.mockReset();
});

describe('GET /health', () => {
  it('répond 200 et « ok » quand la base répond', async () => {
    mockCheckDatabase.mockResolvedValue({ ok: true, latencyMs: 3 });

    const réponse = await request(app).get('/health');

    expect(réponse.status).toBe(200);
    expect(réponse.body).toMatchObject({
      status: 'ok',
      database: { ok: true, latencyMs: 3 },
    });
    expect(typeof réponse.body.version).toBe('string');
    expect(typeof réponse.body.uptime).toBe('number');
    expect(new Date(réponse.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('répond 503 et « degraded » quand la base ne répond pas', async () => {
    mockCheckDatabase.mockResolvedValue({
      ok: false,
      latencyMs: 42,
      error: 'connect ECONNREFUSED 127.0.0.1:5432',
    });

    const réponse = await request(app).get('/health');

    expect(réponse.status).toBe(503);
    expect(réponse.body.status).toBe('degraded');
    expect(réponse.body.database).toEqual({ ok: false, latencyMs: 42 });
  });

  it('ne divulgue aucun détail technique sur la base', async () => {
    mockCheckDatabase.mockResolvedValue({
      ok: false,
      latencyMs: 42,
      error: 'connect ECONNREFUSED 127.0.0.1:5432 — password authentication failed',
    });

    const réponse = await request(app).get('/health');
    const corps = JSON.stringify(réponse.body);

    expect(corps).not.toContain('ECONNREFUSED');
    expect(corps).not.toContain('postgres');
    expect(corps).not.toContain('5432');
    expect(réponse.body.database).not.toHaveProperty('error');
  });

  it('répond 503 même si la vérification de la base lève une exception', async () => {
    mockCheckDatabase.mockRejectedValue(new Error('pool détruit'));

    const réponse = await request(app).get('/health');

    expect(réponse.status).toBe(503);
    expect(réponse.body.status).toBe('degraded');
  });

  it('expose la même supervision sous /api/health', async () => {
    mockCheckDatabase.mockResolvedValue({ ok: true, latencyMs: 1 });

    const réponse = await request(app).get('/api/health');

    expect(réponse.status).toBe(200);
    expect(réponse.body.status).toBe('ok');
  });

  it('renvoie un en-tête X-Request-Id unique par requête', async () => {
    mockCheckDatabase.mockResolvedValue({ ok: true, latencyMs: 1 });

    const première = await request(app).get('/health');
    const seconde = await request(app).get('/health');

    expect(première.headers['x-request-id']).toBeTruthy();
    expect(seconde.headers['x-request-id']).toBeTruthy();
    expect(première.headers['x-request-id']).not.toBe(seconde.headers['x-request-id']);
  });
});

describe('GET /api/version', () => {
  it('renvoie le nom et la version de l’API', async () => {
    const réponse = await request(app).get('/api/version');

    expect(réponse.status).toBe(200);
    expect(réponse.body.name).toBe('Irrigation Pro API');
    expect(réponse.body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('Route inconnue', () => {
  it('renvoie un 404 au format d’erreur standard', async () => {
    const réponse = await request(app).get('/api/nexiste-pas');

    expect(réponse.status).toBe(404);
    expect(réponse.body).toHaveProperty('error');
    expect(réponse.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(typeof réponse.body.error.message).toBe('string');
  });

  it('renvoie aussi un 404 standard hors de /api', async () => {
    const réponse = await request(app).post('/quelque-chose');

    expect(réponse.status).toBe(404);
    expect(réponse.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Corps JSON invalide', () => {
  it('renvoie un 400 au format d’erreur standard sans trace', async () => {
    const réponse = await request(app)
      .post('/api/version')
      .set('Content-Type', 'application/json')
      .send('{ ceci n’est pas du json');

    expect(réponse.status).toBe(400);
    expect(réponse.body.error.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(réponse.body)).not.toContain('at ');
  });
});

describe('CORS', () => {
  it('accepte une origine de la liste blanche', async () => {
    mockCheckDatabase.mockResolvedValue({ ok: true, latencyMs: 1 });

    const réponse = await request(app).get('/health').set('Origin', 'http://localhost:5173');

    expect(réponse.status).toBe(200);
    expect(réponse.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('refuse une origine inconnue', async () => {
    mockCheckDatabase.mockResolvedValue({ ok: true, latencyMs: 1 });

    const réponse = await request(app).get('/health').set('Origin', 'https://site-malveillant.example');

    expect(réponse.status).toBe(403);
    expect(réponse.body.error.code).toBe('FORBIDDEN');
    expect(réponse.headers['access-control-allow-origin']).toBeUndefined();
  });
});
