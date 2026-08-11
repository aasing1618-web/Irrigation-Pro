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
});
