import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { server } from '../../setup';
import { GitHubClient } from '../../../extension/github/GitHubClient';
import { RepoManager } from '../../../extension/github/RepoManager';
import { SyncConfigSchema } from '../../../extension/types';

const require = createRequire(import.meta.url);
const { http, HttpResponse } = await import(pathToFileURL(require.resolve('msw')).href);

const cfg = SyncConfigSchema.parse({ repoName: 'my-repo', repoVisibility: 'private' });

describe('RepoManager', () => {
  const client = new GitHubClient();
  const rm = new RepoManager(client);

  it('returns existing repo when present', async () => {
    server.use(
      http.get('https://api.github.com/user', () =>
        HttpResponse.json({ login: 'alice' }),
      ),
      http.get('https://api.github.com/repos/alice/my-repo', () =>
        HttpResponse.json({ owner: { login: 'alice' }, name: 'my-repo' }),
      ),
    );
    expect(await rm.ensureRepo('T', cfg)).toEqual({ owner: 'alice', repo: 'my-repo' });
  });

  it('creates repo when not found', async () => {
    let created = false;
    server.use(
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'alice' })),
      http.get('https://api.github.com/repos/alice/my-repo', () => new HttpResponse(null, { status: 404 })),
      http.post('https://api.github.com/user/repos', async ({ request }) => {
        created = true;
        const body = await request.json();
        expect(body).toMatchObject({ name: 'my-repo', private: true });
        return HttpResponse.json({ owner: { login: 'alice' }, name: 'my-repo' }, { status: 201 });
      }),
    );
    expect(await rm.ensureRepo('T', cfg)).toEqual({ owner: 'alice', repo: 'my-repo' });
    expect(created).toBe(true);
  });

  it('honors repoVisibility=public when creating', async () => {
    const cfgPub = SyncConfigSchema.parse({ repoName: 'p', repoVisibility: 'public' });
    server.use(
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'a' })),
      http.get('https://api.github.com/repos/a/p', () => new HttpResponse(null, { status: 404 })),
      http.post('https://api.github.com/user/repos', async ({ request }) => {
        const body = (await request.json()) as { private: boolean };
        expect(body.private).toBe(false);
        return HttpResponse.json({ owner: { login: 'a' }, name: 'p' }, { status: 201 });
      }),
    );
    await rm.ensureRepo('T', cfgPub);
  });
});