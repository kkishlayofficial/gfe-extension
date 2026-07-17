import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { server } from '../../setup';
import { GitHubProvider } from '../../../extension/github/GitHubProvider';
import type { QuestionSnapshot, SyncConfig } from '../../../extension/types';

const require = createRequire(import.meta.url);
const { http, HttpResponse } = await import(pathToFileURL(require.resolve('msw')).href);

const config: SyncConfig = {
  repoName: 'greatfrontend-solutions',
  folderLayout: 'categorized',
  commitMessageTemplate: 'feat: add {slug} ({date})',
  autoSync: true,
  generateRootReadme: true,
  repoVisibility: 'private',
};

const snapshot: QuestionSnapshot = {
  metadata: {
    title: 'Event Emitter',
    slug: 'event-emitter',
    difficulty: 'medium',
    format: 'javascript',
    duration: 30,
    description: 'desc',
    url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
    languages: ['js'],
    companies: ['Google'],
  },
  files: [
    { path: 'src/solution.js', content: 'const x = 1;', language: 'javascript' },
    { path: 'package.json', content: '{}', language: 'json' },
  ],
  hash: 'abc',
  completedAt: '2025-01-01T00:00:00.000Z',
  extensionVersion: '0.1.0',
  snapshotVersion: 1,
};

describe('GitHubProvider integration', () => {
  let treeItems: Array<{ path: string; sha?: string; content?: string }> = [];
  let blobContents: Record<string, string> = {};
  let contentsPutCount = 0;

  beforeEach(() => {
    treeItems = [];
    blobContents = {};
    contentsPutCount = 0;
    server.use(
      http.get('https://api.github.com/repos/me/greatfrontend-solutions', () =>
        HttpResponse.json({ owner: { login: 'me' }, name: 'greatfrontend-solutions' }),
      ),
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'me' })),
      http.get(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/ref/heads/main',
        () => HttpResponse.json({ object: { sha: 'refsha' } }),
      ),
      http.get(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/commits/refsha',
        () => HttpResponse.json({ tree: { sha: 'basetree' } }),
      ),
      http.post(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/blobs',
        async ({ request }) => {
          const body = (await request.json()) as { content: string };
          const sha = `blobsha-${Object.keys(blobContents).length + 1}`;
          blobContents[sha] = body.content;
          return HttpResponse.json({ sha });
        },
      ),
      http.post(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/trees',
        async ({ request }) => {
          const body = (await request.json()) as { tree: Array<{ path: string; sha?: string }> };
          treeItems = body.tree.map((item) => ({
            ...item,
            content: item.sha ? blobContents[item.sha] : undefined,
          }));
          return HttpResponse.json({ sha: 'treesha' });
        },
      ),
      http.post(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/commits',
        () => HttpResponse.json({ sha: 'commitsha' }),
      ),
      http.patch(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/refs/heads/main',
        () => new HttpResponse(null, { status: 200 }),
      ),
      http.get(
        'https://api.github.com/repos/me/greatfrontend-solutions/contents/index.json',
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.put(
        'https://api.github.com/repos/me/greatfrontend-solutions/contents/:path',
        () => {
          contentsPutCount += 1;
          return HttpResponse.json({ commit: { sha: 'unexpected' } });
        },
      ),
    );
  });

  it('emits ONE atomic commit containing per-problem files, index.json, and root README', async () => {
    const provider = new GitHubProvider();
    const { commitSha } = await provider.synchronize(snapshot, 'tok', config);
    expect(commitSha).toBe('commitsha');
    const paths = treeItems.map((item) => item.path).sort();
    expect(paths).toEqual(
      [
        'README.md',
        'index.json',
        'javascript/event-emitter/README.md',
        'javascript/event-emitter/metadata.json',
        'javascript/event-emitter/workspace/package.json',
        'javascript/event-emitter/workspace/src/solution.js',
      ].sort(),
    );
    expect(contentsPutCount).toBe(0);
  });

  it('records the parent HEAD sha as the entry commitSha inside index.json', async () => {
    const provider = new GitHubProvider();
    await provider.synchronize(snapshot, 'tok', config);
    const indexFile = treeItems.find((item) => item.path === 'index.json');
    expect(indexFile).toBeDefined();
    const parsed = JSON.parse(indexFile!.content!) as {
      solutions: Record<string, { commitSha: string }>;
    };
    expect(parsed.solutions['event-emitter'].commitSha).toBe('refsha');
  });

  it('omits root README from the commit when generateRootReadme is false', async () => {
    const provider = new GitHubProvider();
    await provider.synchronize(snapshot, 'tok', { ...config, generateRootReadme: false });
    const paths = treeItems.map((item) => item.path);
    expect(paths).not.toContain('README.md');
    expect(paths).toContain('index.json');
    expect(contentsPutCount).toBe(0);
  });
});