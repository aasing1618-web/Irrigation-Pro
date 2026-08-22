import express from 'express';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('Routage statique et API', () => {
  it("renvoie un 404 JSON pour une route d'API inexistante, jamais de HTML", async () => {
    const app = createApp();

    const reponse = await supertest(app).get('/api/n-existe-pas').expect(404);

    expect(reponse.headers['content-type']).toMatch(/json/);
    expect(reponse.body.error.code).toBe('NOT_FOUND');
  });

  it("renvoie un 404 JSON pour une méthode POST sur route d'API inexistante", async () => {
    const app = createApp();

    const reponse = await supertest(app).post('/api/inconnu').expect(404);

    expect(reponse.headers['content-type']).toMatch(/json/);
    expect(reponse.body.error.code).toBe('NOT_FOUND');
  });

  it("sert l'application cliente sur la racine / avec du HTML", async () => {
    const app = createApp();

    const reponse = await supertest(app).get('/').expect(200);

    expect(reponse.headers['content-type']).toMatch(/html/);
    expect(reponse.text).toContain('<html');
  });

  it("retombe sur index.html pour les routes du navigateur client (SPA)", async () => {
    const app = createApp();

    const reponse = await supertest(app).get('/projets/calculs').expect(200);

    expect(reponse.headers['content-type']).toMatch(/html/);
    expect(reponse.text).toContain('<html');
  });

  it("sert le dashboard d'administration sous /admin/ (avec 301 sur /admin sans slash)", async () => {
    const app = createApp();

    await supertest(app).get('/admin').expect(301);

    const reponse = await supertest(app).get('/admin/').expect(200);

    expect(reponse.headers['content-type']).toMatch(/html/);
    expect(reponse.text).toContain('<html');
  });

  it("retombe sur index.html administrateur pour les sous-routes /admin/* (SPA)", async () => {
    const app = createApp();

    const reponse = await supertest(app).get('/admin/comptes/123').expect(200);

    expect(reponse.headers['content-type']).toMatch(/html/);
    expect(reponse.text).toContain('<html');
  });

  it("autorise CORS pour la même origine que le hôte du serveur", async () => {
    const app = createApp();

    const reponse = await supertest(app)
      .get('/')
      .set('Host', 'irrigation-pro-yn5z.onrender.com')
      .set('Origin', 'https://irrigation-pro-yn5z.onrender.com')
      .expect(200);

    expect(reponse.headers['access-control-allow-origin']).toBe('https://irrigation-pro-yn5z.onrender.com');
  });
});

