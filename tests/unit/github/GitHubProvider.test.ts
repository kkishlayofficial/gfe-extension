import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { server } from '../../setup';
import { GitHubProvider } from '../../../extension/github/GitHubProvider';
import { SyncConfigSchema, SNAPSHOT_VERSION } from '../../../extension/types';
import type { QuestionSnapshot } from '../../../extension/types';

const require = createRequire(import.meta.url);
const { http, HttpResponse } = await import(pathToFileURL(require.resolve('msw')).href);

const cfg = SyncConfigSchema.parse({ repoName: 'sol', repoVisibility: 'private' });

const snapshot: QuestionSnapshot = {
  metadata: {
    title: 'Event Emitter', slug: 'event-emitter', difficulty: 'medium',
    format: 'javascript', duration: 20, description: 'D',
    url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
    languages: ['js'], companies: ['G'],
  },
  files: [
    { path: 'src/solution.js', content: 'const x = 1;', language: 'javascript' },
    { path: 'package.json', content: '{}', language: 'json' },
  ],
  hash: 'HASH', completedAt: '2026-01-01T00:00:00Z',
  extensionVersion: '0.1.0', snapshotVersion: SNAPSHOT_VERSION,
};

describe('GitHubProvider', () => {
  const provider = new GitHubProvider();

  function wireBaseline(committedPaths: string[]): void {
    server.use(
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'alice' })),
      http.get('https://api.github.com/repos/alice/sol', () =>
        HttpResponse.json({ owner: { login: 'alice' }, name: 'sol' }),
      ),
      http.get('https://api.github.com/repos/alice/sol/contents/index.json', () =>
        new HttpResponse(null, { status: 404 }),
      ),
      http.get('https://api.github.com/repos/alice/sol/git/ref/heads/main', () =>
        HttpResponse.json({ object: { sha: 'HEAD' } }),
      ),
      http.get('https://api.github.com/repos/alice/sol/git/commits/HEAD', () =>
        HttpResponse.json({ tree: { sha: 'BASE' } }),
      ),
      http.post('https://api.github.com/repos/alice/sol/git/blobs', () =>
        HttpResponse.json({ sha: 'B' }, { status: 201 }),
      ),
      http.post('https://api.github.com/repos/alice/sol/git/trees', async ({ request }) => {
        const body = (await request.json()) as { tree: Array<{ path: string }> };
        for (const item of body.tree) committedPaths.push(item.path);
        return HttpResponse.json({ sha: 'TREE' }, { status: 201 });
      }),
      http.post('https://api.github.com/repos/alice/sol/git/commits', async ({ request }) => {
        const body = (await request.json()) as { message: string };
        (committedPaths as unknown as { message?: string }).message = body.message;
        return HttpResponse.json({ sha: 'COMMIT' }, { status: 201 });
      }),
      http.patch('https://api.github.com/repos/alice/sol/git/refs/heads/main', () =>
        HttpResponse.json({ ref: 'refs/heads/main' }),
      ),
    );
  }

  it('ensureRepository returns owner/repo', async () => {
    server.use(
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'alice' })),
      http.get('https://api.github.com/repos/alice/sol', () =>
        HttpResponse.json({ owner: { login: 'alice' }, name: 'sol' }),
      ),
    );
    expect(await provider.ensureRepository('T', cfg)).toEqual({ owner: 'alice', repo: 'sol' });
  });

  it('synchronize commits categorized paths with workspace prefix', async () => {
    const paths: string[] = [];
    wireBaseline(paths);
    const result = await provider.synchronize(snapshot, 'T', cfg);
    expect(result.commitSha).toBe('COMMIT');
    expect(paths).toContain('javascript/event-emitter/workspace/src/solution.js');
    expect(paths).toContain('javascript/event-emitter/workspace/package.json');
    expect(paths).toContain('javascript/event-emitter/README.md');
    expect(paths).toContain('javascript/event-emitter/metadata.json');
  });

  it('synchronize honors flat folderLayout', async () => {
    const paths: string[] = [];
    wireBaseline(paths);
    const flat = SyncConfigSchema.parse({ repoName: 'sol', folderLayout: 'flat' });
    await provider.synchronize(snapshot, 'T', flat);
    expect(paths).toContain('event-emitter/workspace/src/solution.js');
    expect(paths).toContain('event-emitter/README.md');
    expect(paths).not.toContain('javascript/event-emitter/README.md');
  });

  it('substitutes {slug} {title} {date} in commit message', async () => {
    const paths: string[] = [];
    wireBaseline(paths);
    const withTemplate = SyncConfigSchema.parse({
      repoName: 'sol',
      commitMessageTemplate: 'feat: {title} ({slug}) — {date}',
    });
    await provider.synchronize(snapshot, 'T', withTemplate);
    const msg = (paths as unknown as { message: string }).message;
    expect(msg).toContain('Event Emitter');
    expect(msg).toContain('event-emitter');
    expect(msg).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});