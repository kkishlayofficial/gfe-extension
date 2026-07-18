import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchInterceptor } from '../../../extension/injected/FetchInterceptor';

const CORRECT_JS_RESPONSE = [
  {
    result: {
      data: {
        json: {
          id: 'abc',
          slug: 'classnames',
          code: 'export default function classNames() {}',
          language: 'JS',
          result: 'CORRECT',
        },
      },
    },
  },
];

const WRONG_JS_RESPONSE = [
  {
    result: {
      data: { json: { id: 'xyz', slug: 'classnames', code: '', language: 'JS', result: 'WRONG' } },
    },
  },
];

describe('FetchInterceptor', () => {
  let originalFetch: typeof fetch;
  let completedEvents: string[];
  let jsCompleteDetails: Array<{ slug: string; language: string; code: string }>;
  let onComplete: () => void;
  let onJsComplete: (e: Event) => void;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    completedEvents = [];
    jsCompleteDetails = [];

    onComplete = () => completedEvents.push('GFE_COMPLETE');
    onJsComplete = (e: Event) => {
      jsCompleteDetails.push(
        (e as CustomEvent<{ slug: string; language: string; code: string }>).detail,
      );
    };

    window.addEventListener('GFE_COMPLETE', onComplete);
    window.addEventListener('GFE_JS_COMPLETE', onJsComplete);
    new FetchInterceptor().install();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.removeEventListener('GFE_COMPLETE', onComplete);
    window.removeEventListener('GFE_JS_COMPLETE', onJsComplete);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── questionProgress.add ────────────────────────────────────────────────────

  it('dispatches GFE_COMPLETE for questionProgress.add on 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    new FetchInterceptor().install();
    await fetch('https://www.greatfrontend.com/api/trpc/questionProgress.add?batch=1');
    expect(completedEvents).toContain('GFE_COMPLETE');
  });

  it('does NOT dispatch GFE_COMPLETE for questionProgress.add on 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 400 })));
    new FetchInterceptor().install();
    await fetch('https://x/api/trpc/questionProgress.add');
    expect(completedEvents).toHaveLength(0);
  });

  // ── questionSubmission.javaScriptAdd ────────────────────────────────────────

  it('dispatches GFE_JS_COMPLETE with detail when result is CORRECT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify(CORRECT_JS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    await fetch('https://x/api/trpc/questionSubmission.javaScriptAdd?batch=1');
    expect(jsCompleteDetails).toHaveLength(1);
    expect(jsCompleteDetails[0]?.slug).toBe('classnames');
    expect(jsCompleteDetails[0]?.language).toBe('JS');
  });

  it('does NOT dispatch GFE_JS_COMPLETE when result is WRONG', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify(WRONG_JS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    await fetch('https://x/api/trpc/questionSubmission.javaScriptAdd?batch=1');
    expect(jsCompleteDetails).toHaveLength(0);
  });

  // ── shared behaviour ────────────────────────────────────────────────────────

  it('does NOT intercept non-matching URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
    new FetchInterceptor().install();
    await fetch('https://x/api/other');
    expect(completedEvents).toHaveLength(0);
    expect(jsCompleteDetails).toHaveLength(0);
  });

  it('returns original response body unmodified for javaScriptAdd', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify(CORRECT_JS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    const r = await fetch('https://x/api/trpc/questionSubmission.javaScriptAdd');
    const body = (await r.json()) as typeof CORRECT_JS_RESPONSE;
    expect(body[0]?.result.data.json.result).toBe('CORRECT');
  });

  it('swallows JSON parse errors without breaking fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      ),
    );
    new FetchInterceptor().install();
    const r = await fetch('https://x/api/trpc/questionSubmission.javaScriptAdd');
    expect(r.status).toBe(200);
    expect(jsCompleteDetails).toHaveLength(0);
  });
});
