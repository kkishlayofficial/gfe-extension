import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthHandler } from '../../../extension/background/AuthHandler';
import { EventBus } from '../../../extension/background/EventBus';

const REDIRECT = 'https://ext-id.chromiumapp.org/callback';

function stubEnv(): void {
  (import.meta.env as Record<string, string>).VITE_GITHUB_CLIENT_ID = 'CID';
  (import.meta.env as Record<string, string>).VITE_WORKER_URL = 'https://worker.example';
}

describe('AuthHandler', () => {
  let bus: EventBus;
  let handler: AuthHandler;
  let emitSpy: any;

  beforeEach(() => {
    stubEnv();
    bus = new EventBus();
    emitSpy = vi.spyOn(bus as any, 'emit');
    handler = new AuthHandler(bus);
    chrome.runtime.sendMessage = vi.fn();
    (crypto as unknown as { getRandomValues: (a: Uint8Array) => Uint8Array }).getRandomValues = (arr: Uint8Array) => {
      arr.fill(7);
      return arr;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('startAuth', () => {
    it('emits AUTH_COMPLETE with username and avatar on success', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn((_o, cb) => {
        cb?.(`${REDIRECT}?code=abc&state=${'07'.repeat(16)}`);
      }) as never;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo) => {
          const url = typeof input === 'string' ? input : input.url;
          if (url.includes('/token')) {
            return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
          }
          if (url.includes('api.github.com/user')) {
            return new Response(
              JSON.stringify({ login: 'alice', avatar_url: 'https://av' }),
              { status: 200 },
            );
          }
          return new Response('', { status: 404 });
        }),
      );

      await handler.startAuth();

      expect(emitSpy).toHaveBeenCalledWith({
        type: 'AUTH_COMPLETE',
        payload: { username: 'alice', avatarUrl: 'https://av' },
      });
      const stored = await chrome.storage.local.get('gfe.token');
      expect(stored['gfe.token']).toBe('tok');
    });

    it('emits AUTH_FAILED on state nonce mismatch', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn((_o, cb) => {
        cb?.(`${REDIRECT}?code=abc&state=WRONG`);
      }) as never;
      await handler.startAuth();
      expect(emitSpy).toHaveBeenCalledWith({
        type: 'AUTH_FAILED',
        payload: { error: expect.stringMatching(/state/i) as unknown as string },
      });
    });

    it('emits AUTH_FAILED on worker error', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn((_o, cb) => {
        cb?.(`${REDIRECT}?code=abc&state=${'07'.repeat(16)}`);
      }) as never;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: 'bad' }), { status: 400 })),
      );
      await handler.startAuth();
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AUTH_FAILED' }),
      );
    });

    it('emits AUTH_FAILED when identity flow returns nothing', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn((_o, cb) => {
        (chrome.runtime as unknown as { lastError: { message: string } }).lastError = {
          message: 'user canceled',
        };
        cb?.(undefined);
      }) as never;
      await handler.startAuth();
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AUTH_FAILED' }),
      );
    });
  });

  describe('revokeAuth', () => {
    it('clears token + user and emits AUTH_REVOKED', async () => {
      await chrome.storage.local.set({ 'gfe.token': 'x', 'gfe.user': { username: 'u', avatarUrl: 'a' } });
      await handler.revokeAuth();
      const stored = await chrome.storage.local.get(['gfe.token', 'gfe.user']);
      expect(stored['gfe.token']).toBeUndefined();
      expect(stored['gfe.user']).toBeUndefined();
      expect(emitSpy).toHaveBeenCalledWith({ type: 'AUTH_REVOKED', payload: {} });
    });
  });

  describe('validateStoredToken', () => {
    it('returns false when no token stored', async () => {
      expect(await handler.validateStoredToken()).toBe(false);
    });

    it('returns true and refreshes user on 200', async () => {
      await chrome.storage.local.set({ 'gfe.token': 'tok' });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(JSON.stringify({ login: 'bob', avatar_url: 'https://b' }), { status: 200 }),
        ),
      );
      expect(await handler.validateStoredToken()).toBe(true);
      const stored = await chrome.storage.local.get('gfe.user');
      expect(stored['gfe.user']).toEqual({ username: 'bob', avatarUrl: 'https://b' });
    });

    it('deletes token and emits TOKEN_EXPIRED on 401', async () => {
      await chrome.storage.local.set({ 'gfe.token': 'tok' });
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
      expect(await handler.validateStoredToken()).toBe(false);
      expect(emitSpy).toHaveBeenCalledWith({ type: 'TOKEN_EXPIRED', payload: {} });
      const stored = await chrome.storage.local.get('gfe.token');
      expect(stored['gfe.token']).toBeUndefined();
    });
  });
});