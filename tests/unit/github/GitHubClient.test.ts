import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { server } from '../../setup';
import { GitHubClient } from '../../../extension/github/GitHubClient';
import { GitHubApiError } from '../../../extension/types';

const require = createRequire(import.meta.url);
const { http, HttpResponse } = await import(pathToFileURL(require.resolve('msw')).href);

const T = 'tok';

describe('GitHubClient', () => {
  const c = new GitHubClient();

  describe('getRepo', () => {
    it('returns repo when present', async () => {
      server.use(
        http.get('https://api.github.com/repos/o/r', () =>
          HttpResponse.json({ owner: { login: 'o' }, name: 'r' }),
        ),
      );
      const r = await c.getRepo('o', 'r', T);
      expect(r).toEqual({ owner: { login: 'o' }, name: 'r' });
    });

    it('returns null on 404', async () => {
      server.use(
        http.get('https://api.github.com/repos/o/r', () => new HttpResponse(null, { status: 404 })),
      );
      expect(await c.getRepo('o', 'r', T)).toBeNull();
    });

    it('throws GitHubApiError on 500', async () => {
      server.use(
        http.get(
          'https://api.github.com/repos/o/r',
          () => new HttpResponse('boom', { status: 500 }),
        ),
      );
      await expect(c.getRepo('o', 'r', T)).rejects.toBeInstanceOf(GitHubApiError);
    });
  });

  describe('createRepo', () => {
    it('POSTs to /user/repos with name/private/description', async () => {
      let received: unknown;
      server.use(
        http.post('https://api.github.com/user/repos', async ({ request }: { request: Request }) => {
          received = await request.json();
          return HttpResponse.json({ owner: { login: 'o' }, name: 'r' }, { status: 201 });
        }),
      );
      const r = await c.createRepo(T, { name: 'r', private: true, description: 'd' });
      expect(r.name).toBe('r');
      expect(received).toEqual({ name: 'r', private: true, description: 'd', auto_init: true });
    });
  });

  describe('getRef / getCommit / createBlob / createTree / createCommit / updateRef', () => {
    it('getRef returns object.sha', async () => {
      server.use(
        http.get('https://api.github.com/repos/o/r/git/ref/heads/main', () =>
          HttpResponse.json({ object: { sha: 'REF' } }),
        ),
      );
      expect(await c.getRef('o', 'r', T, 'heads/main')).toEqual({ object: { sha: 'REF' } });
    });

    it('getCommit returns tree.sha', async () => {
      server.use(
        http.get('https://api.github.com/repos/o/r/git/commits/REF', () =>
          HttpResponse.json({ tree: { sha: 'TREE' } }),
        ),
      );
      expect(await c.getCommit('o', 'r', T, 'REF')).toEqual({ tree: { sha: 'TREE' } });
    });

    it('createBlob base64-encodes content', async () => {
      let received: unknown;
      server.use(
        http.post('https://api.github.com/repos/o/r/git/blobs', async ({ request }: { request: Request }) => {
          received = await request.json();
          return HttpResponse.json({ sha: 'BLOB' }, { status: 201 });
        }),
      );
      const r = await c.createBlob('o', 'r', T, 'hello', 'utf-8');
      expect(r).toEqual({ sha: 'BLOB' });
      expect(received).toEqual({ content: 'hello', encoding: 'utf-8' });
    });

    it('createTree posts base_tree + tree items', async () => {
      let received: unknown;
      server.use(
        http.post('https://api.github.com/repos/o/r/git/trees', async ({ request }: { request: Request }) => {
          received = await request.json();
          return HttpResponse.json({ sha: 'TREE2' }, { status: 201 });
        }),
      );
      const r = await c.createTree('o', 'r', T, 'BASE', [
        { path: 'a.txt', mode: '100644', type: 'blob', sha: 'B' },
      ]);
      expect(r).toEqual({ sha: 'TREE2' });
      expect(received).toEqual({
        base_tree: 'BASE',
        tree: [{ path: 'a.txt', mode: '100644', type: 'blob', sha: 'B' }],
      });
    });

    it('createCommit posts message/tree/parents', async () => {
      let received: unknown;
      server.use(
        http.post('https://api.github.com/repos/o/r/git/commits', async ({ request }: { request: Request }) => {
          received = await request.json();
          return HttpResponse.json({ sha: 'CMT' }, { status: 201 });
        }),
      );
      const r = await c.createCommit('o', 'r', T, {
        message: 'm',
        treeSha: 'T',
        parentShas: ['P'],
      });
      expect(r).toEqual({ sha: 'CMT' });
      expect(received).toEqual({ message: 'm', tree: 'T', parents: ['P'] });
    });

    it('updateRef PATCHes ref', async () => {
      let received: unknown;
      server.use(
        http.patch('https://api.github.com/repos/o/r/git/refs/heads/main', async ({ request }: { request: Request }) => {
          received = await request.json();
          return HttpResponse.json({ ref: 'refs/heads/main' });
        }),
      );
      await c.updateRef('o', 'r', T, 'heads/main', 'NEW');
      expect(received).toEqual({ sha: 'NEW', force: false });
    });

    it('createOrUpdateFile omits sha when not provided', async () => {
      let received: unknown;
      server.use(
        http.put('https://api.github.com/repos/o/r/contents/foo.md', async ({ request }: { request: Request }) => {
          received = await request.json();
          return HttpResponse.json({ commit: { sha: 'CMT2' } }, { status: 200 });
        }),
      );
      const r = await c.createOrUpdateFile('o', 'r', T, 'foo.md', {
        message: 'm',
        content: 'hi',
      });
      expect(r).toEqual({ commitSha: 'CMT2' });
      expect(received).toEqual({ message: 'm', content: Buffer.from('hi').toString('base64') });
    });
  });

  describe('getContents', () => {
    it('decodes base64 content', async () => {
      const content = Buffer.from('hello world').toString('base64');
      server.use(
        http.get('https://api.github.com/repos/o/r/contents/index.json', () =>
          HttpResponse.json({ content, sha: 'FSHA', encoding: 'base64' }),
        ),
      );
      expect(await c.getContents('o', 'r', T, 'index.json')).toEqual({
        content: 'hello world',
        sha: 'FSHA',
      });
    });

    it('returns null on 404', async () => {
      server.use(
        http.get(
          'https://api.github.com/repos/o/r/contents/missing',
          () => new HttpResponse(null, { status: 404 }),
        ),
      );
      expect(await c.getContents('o', 'r', T, 'missing')).toBeNull();
    });
  });

  describe('createOrUpdateFile', () => {
    it('base64-encodes content and optionally passes sha', async () => {
      let received: unknown;
      server.use(
        http.put('https://api.github.com/repos/o/r/contents/foo.md', async ({ request }: { request: Request }) => {
          received = await request.json();
          return HttpResponse.json({ commit: { sha: 'CMT2' } }, { status: 200 });
        }),
      );
      const r = await c.createOrUpdateFile('o', 'r', T, 'foo.md', {
        message: 'm',
        content: 'hi',
        sha: 'OLD',
      });
      expect(r).toEqual({ commitSha: 'CMT2' });
      expect(received).toMatchObject({
        message: 'm',
        content: Buffer.from('hi').toString('base64'),
        sha: 'OLD',
      });
    });
  });

  describe('rate limiting', () => {
    it('retries after 429 and eventually succeeds', async () => {
      let n = 0;
      server.use(
        http.get('https://api.github.com/repos/o/r', () => {
          n++;
          if (n === 1) {
            return new HttpResponse('rate', { status: 429, headers: { 'Retry-After': '0' } });
          }
          return HttpResponse.json({ owner: { login: 'o' }, name: 'r' });
        }),
      );
      const r = await c.getRepo('o', 'r', T);
      expect(r?.name).toBe('r');
      expect(n).toBe(2);
    });

    it('retries after secondary rate limiting signaled by 403 + X-RateLimit-Remaining: 0', async () => {
      let n = 0;
      server.use(
        http.get('https://api.github.com/repos/o/r', () => {
          n++;
          if (n === 1) {
            return new HttpResponse('rate', {
              status: 403,
              headers: { 'X-RateLimit-Remaining': '0', 'Retry-After': '0' },
            });
          }
          return HttpResponse.json({ owner: { login: 'o' }, name: 'r' });
        }),
      );
      const r = await c.getRepo('o', 'r', T);
      expect(r?.name).toBe('r');
      expect(n).toBe(2);
    });

    it('throws GitHubApiError with rateLimited=true after exhausting retries', async () => {
      server.use(
        http.get(
          'https://api.github.com/repos/o/r',
          () => new HttpResponse('rate', { status: 429, headers: { 'Retry-After': '0' } }),
        ),
      );
      const err = await c.getRepo('o', 'r', T).catch((e) => e);
      expect(err).toBeInstanceOf(GitHubApiError);
      expect((err as GitHubApiError).rateLimited).toBe(true);
    });

    it('retries on 500 (transient server error)', async () => {
      let n = 0;
      server.use(
        http.get('https://api.github.com/repos/o/r', () => {
          n++;
          if (n < 3) return new HttpResponse('boom', { status: 500 });
          return HttpResponse.json({ owner: { login: 'o' }, name: 'r' });
        }),
      );
      await c.getRepo('o', 'r', T);
      expect(n).toBe(3);
    });

    it('does NOT retry on 404 (allow404 short-circuits)', async () => {
      let n = 0;
      server.use(
        http.get('https://api.github.com/repos/o/r', () => {
          n++;
          return new HttpResponse(null, { status: 404 });
        }),
      );
      const r = await c.getRepo('o', 'r', T);
      expect(r).toBeNull();
      expect(n).toBe(1);
    });

    it('does NOT retry on 401 (auth failure)', async () => {
      let n = 0;
      server.use(
        http.get('https://api.github.com/repos/o/r', () => {
          n++;
          return new HttpResponse(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
        }),
      );
      await expect(c.getRepo('o', 'r', T)).rejects.toBeInstanceOf(GitHubApiError);
      expect(n).toBe(1);
    });

    it('does NOT retry on 400 (bad request)', async () => {
      let n = 0;
      server.use(
        http.post('https://api.github.com/repos/o/r/git/blobs', () => {
          n++;
          return new HttpResponse('bad', { status: 400 });
        }),
      );
      await expect(c.createBlob('o', 'r', T, 'x', 'utf-8')).rejects.toBeInstanceOf(GitHubApiError);
      expect(n).toBe(1);
    });

    it('uses Buffer fallback when base64 DOM helpers are unavailable', async () => {
      const globals = globalThis as typeof globalThis & {
        btoa?: typeof btoa;
        atob?: typeof atob;
      };

      let received: unknown;
      try {
        vi.stubGlobal('btoa', undefined);
        vi.stubGlobal('atob', undefined);

        server.use(
          http.put('https://api.github.com/repos/o/r/contents/foo.md', async ({ request }: { request: Request }) => {
            received = await request.json();
            return HttpResponse.json({ commit: { sha: 'CMT2' } }, { status: 200 });
          }),
          http.get('https://api.github.com/repos/o/r/contents/index.json', () =>
            HttpResponse.json({
              content: Buffer.from('hello world').toString('base64'),
              sha: 'FSHA',
              encoding: 'base64',
            }),
          ),
        );
        await expect(
          c.createOrUpdateFile('o', 'r', T, 'foo.md', {
            message: 'm',
            content: 'hello',
          }),
        ).resolves.toEqual({ commitSha: 'CMT2' });
        expect(received).toEqual({
          message: 'm',
          content: Buffer.from('hello').toString('base64'),
        });
        expect(await c.getContents('o', 'r', T, 'index.json')).toEqual({
          content: 'hello world',
          sha: 'FSHA',
        });
      } finally {
        vi.unstubAllGlobals();
        if (globals.btoa) {
          vi.stubGlobal('btoa', globals.btoa);
        }
        if (globals.atob) {
          vi.stubGlobal('atob', globals.atob);
        }
      }
    });

    it('returns null for non-JSON responses', async () => {
      server.use(
        http.get(
          'https://api.github.com/repos/o/r/contents/readme.txt',
          () =>
            new HttpResponse('plain text', {
              status: 200,
              headers: { 'Content-Type': 'text/plain' },
            }),
        ),
      );

      expect(await c.getContents('o', 'r', T, 'readme.txt')).toBeNull();
    });
  });
});
