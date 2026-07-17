import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../index';

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

const env: Env = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'secret' };

function req(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: { Origin: 'https://abcdef.chromiumapp.org', ...(init.headers ?? {}) },
  });
}

describe('Worker /token', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: 'gh_tok_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('POST /token with valid code returns access_token', async () => {
    const r = await worker.fetch(
      req('https://w/token', { method: 'POST', body: JSON.stringify({ code: 'abc' }) }),
      env,
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ access_token: 'gh_tok_123' });
  });

  it('POST /token with missing code returns 400', async () => {
    const r = await worker.fetch(req('https://w/token', { method: 'POST', body: '{}' }), env);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Missing code' });
  });

  it('POST /token with invalid JSON returns 400', async () => {
    const r = await worker.fetch(req('https://w/token', { method: 'POST', body: 'not json' }), env);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('GET /token returns 404', async () => {
    const r = await worker.fetch(req('https://w/token', { method: 'GET' }), env);
    expect(r.status).toBe(404);
  });

  it('rejects non-chromiumapp.org origin with 403', async () => {
    const r = await worker.fetch(
      new Request('https://w/token', {
        method: 'POST',
        body: JSON.stringify({ code: 'x' }),
        headers: { Origin: 'https://evil.com' },
      }),
      env,
    );
    expect(r.status).toBe(403);
  });

  it('OPTIONS preflight returns 204 with CORS headers', async () => {
    const r = await worker.fetch(req('https://w/token', { method: 'OPTIONS' }), env);
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://abcdef.chromiumapp.org');
    expect(r.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('GitHub error is propagated as 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'bad_verification_code' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const r = await worker.fetch(
      req('https://w/token', { method: 'POST', body: JSON.stringify({ code: 'nope' }) }),
      env,
    );
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body).toEqual({ error: 'bad_verification_code' });
  });
});