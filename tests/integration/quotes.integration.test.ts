import { describe, it, expect, beforeAll } from '@jest/globals';

describe('Quotes API (floci integration)', () => {
    let baseUrl: string;

    beforeAll(() => {
        baseUrl = process.env.API_BASE_URL as string;
        if (!baseUrl) {
            throw new Error('API_BASE_URL was not set by globalSetup');
        }
    });

    it('GET /quotes/{quoteId} returns hello world', async () => {
        const response = await fetch(`${baseUrl}/quotes/123`);
        const body = await response.json();

        expect(response.status).toEqual(200);
        expect(body).toEqual({ message: 'hello world' });
    });

    it('POST /quotes echoes the request body', async () => {
        const payload = { premium: 42, coverage: 'auto' };
        const response = await fetch(`${baseUrl}/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await response.json();

        expect(response.status).toEqual(200);
        expect(body).toEqual(payload);
    });

    it('POST /quotes with invalid JSON returns 500', async () => {
        const response = await fetch(`${baseUrl}/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{not valid json',
        });
        const body = await response.json();

        expect(response.status).toEqual(500);
        expect(body).toEqual({ message: 'some error happened' });
    });
});
