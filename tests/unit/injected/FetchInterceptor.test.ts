import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchInterceptor } from '../../../extension/injected/FetchInterceptor';

describe('FetchInterceptor', () => {
  let originalFetch: typeof fetch;
  let dispatched: string[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    dispatched = [];
    window.addEventListener('GFE_COMPLETE', () => dispatched.push('GFE_COMPLETE'));
    new FetchInterceptor().install();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.removeEventListener('GFE_COMPLETE', () => {});
  });

  it('dispatches GFE_COMPLETE for tRPC questionProgress.add with status=complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { data: { json: { status: 'complete' } } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    await fetch('https://www.greatfrontend.com/api/trpc/questionProgress.add');
    expect(dispatched).toContain('GFE_COMPLETE');
    vi.unstubAllGlobals();
  });

  it('handles array tRPC envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify([{ result: { data: { json: { status: 'complete' } } } }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    await fetch('https://x/api/trpc/questionProgress.add?batch=1');
    expect(dispatched).toContain('GFE_COMPLETE');
    vi.unstubAllGlobals();
  });

  it('does NOT dispatch when status is not complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { data: { json: { status: 'in_progress' } } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    await fetch('https://x/api/trpc/questionProgress.add');
    expect(dispatched).not.toContain('GFE_COMPLETE');
    vi.unstubAllGlobals();
  });

  it('does NOT intercept non-matching URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
    new FetchInterceptor().install();
    await fetch('https://x/api/other');
    expect(dispatched).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('returns original response body unmodified', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { data: { json: { status: 'complete' } } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    const r = await fetch('https://x/api/trpc/questionProgress.add');
    const body = await r.json();
    expect(body.result.data.json.status).toBe('complete');
    vi.unstubAllGlobals();
  });

  it('swallows JSON parse errors without breaking fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      ),
    );
    new FetchInterceptor().install();
    const r = await fetch('https://x/api/trpc/questionProgress.add');
    expect(r.status).toBe(200);
    expect(dispatched).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});