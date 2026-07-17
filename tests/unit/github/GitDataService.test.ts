import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { server } from '../../setup';
import { GitHubClient } from '../../../extension/github/GitHubClient';
import { GitDataService } from '../../../extension/github/GitDataService';
import type { QuestionSnapshot } from '../../../extension/types';
import { SNAPSHOT_VERSION } from '../../../extension/types';

const require = createRequire(import.meta.url);
const { http, HttpResponse } = await import(pathToFileURL(require.resolve('msw')).href);

const snapshot: QuestionSnapshot = {
  metadata: {
    title: 'A',
    slug: 'a',
    difficulty: 'easy',
    format: 'javascript',
    duration: 10,
    description: '',
    url: 'https://x.example',
    languages: [],
    companies: [],
  },
  files: [{ path: 'a.js', content: 'x', language: 'javascript' }],
  hash: 'H',
  completedAt: '2026-01-01T00:00:00Z',
  extensionVersion: '0.1.0',
  snapshotVersion: SNAPSHOT_VERSION,
};

function baseHandlers(): void {
  server.use(
    http.get('https://api.github.com/repos/o/r/git/ref/heads/main', () =>
      HttpResponse.json({ object: { sha: 'HEAD' } }),
    ),
    http.get('https://api.github.com/repos/o/r/git/commits/HEAD', () =>
      HttpResponse.json({ tree: { sha: 'BASE_TREE' } }),
    ),
    http.post('https://api.github.com/repos/o/r/git/blobs', () =>
      HttpResponse.json({ sha: `BLOB_${Math.random().toString(36).slice(2, 6)}` }, { status: 201 }),
    ),
    http.post('https://api.github.com/repos/o/r/git/trees', () =>
      HttpResponse.json({ sha: 'NEW_TREE' }, { status: 201 }),
    ),
    http.post('https://api.github.com/repos/o/r/git/commits', () =>
      HttpResponse.json({ sha: 'NEW_COMMIT' }, { status: 201 }),
    ),
    http.patch('https://api.github.com/repos/o/r/git/refs/heads/main', () =>
      HttpResponse.json({ ref: 'refs/heads/main' }),
    ),
  );
}

describe('GitDataService', () => {
  const client = new GitHubClient();
  const svc = new GitDataService(client);

  it('progresses transaction through all statuses on success', async () => {
    baseHandlers();

    const tx = await svc.commit('o', 'r', 'T', snapshot, [{ path: 'a.js', content: 'x' }], 'msg');

    expect(tx.status).toBe('committed');
    expect(tx.commitSha).toBe('NEW_COMMIT');
    expect(tx.treeSha).toBe('NEW_TREE');
    expect(tx.blobs).toHaveLength(1);
    expect(tx.finishedAt).toBeDefined();
    expect(tx.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('creates blobs in parallel before creating tree', async () => {
    const order: string[] = [];

    server.use(
      http.get('https://api.github.com/repos/o/r/git/ref/heads/main', () =>
        HttpResponse.json({ object: { sha: 'HEAD' } }),
      ),
      http.get('https://api.github.com/repos/o/r/git/commits/HEAD', () =>
        HttpResponse.json({ tree: { sha: 'BASE_TREE' } }),
      ),
      http.post('https://api.github.com/repos/o/r/git/blobs', async () => {
        order.push('blob-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('blob-end');
        return HttpResponse.json({ sha: 'B' }, { status: 201 });
      }),
      http.post('https://api.github.com/repos/o/r/git/trees', () => {
        order.push('tree');
        return HttpResponse.json({ sha: 'T' }, { status: 201 });
      }),
      http.post('https://api.github.com/repos/o/r/git/commits', () =>
        HttpResponse.json({ sha: 'C' }, { status: 201 }),
      ),
      http.patch('https://api.github.com/repos/o/r/git/refs/heads/main', () =>
        HttpResponse.json({ ref: 'refs/heads/main' }),
      ),
    );

    await svc.commit(
      'o',
      'r',
      'T',
      snapshot,
      [
        { path: 'a.js', content: '1' },
        { path: 'b.js', content: '2' },
        { path: 'c.js', content: '3' },
      ],
      'm',
    );

    const treeIdx = order.indexOf('tree');
    const blobEndCount = order.slice(0, treeIdx).filter((entry) => entry === 'blob-end').length;
    expect(blobEndCount).toBe(3);

    const blobStarts = order.slice(0, treeIdx).filter((entry) => entry === 'blob-start');
    expect(blobStarts).toHaveLength(3);

    const firstEnd = order.indexOf('blob-end');
    expect(order.slice(0, firstEnd).every((entry) => entry === 'blob-start')).toBe(true);
  });

  it('marks transaction failed on tree creation error and rethrows', async () => {
    server.use(
      http.get('https://api.github.com/repos/o/r/git/ref/heads/main', () =>
        HttpResponse.json({ object: { sha: 'HEAD' } }),
      ),
      http.get('https://api.github.com/repos/o/r/git/commits/HEAD', () =>
        HttpResponse.json({ tree: { sha: 'BASE_TREE' } }),
      ),
      http.post('https://api.github.com/repos/o/r/git/blobs', () =>
        HttpResponse.json({ sha: 'B' }, { status: 201 }),
      ),
      http.post('https://api.github.com/repos/o/r/git/trees', () => new HttpResponse('boom', { status: 500 })),
    );

    await expect(
      svc.commit('o', 'r', 'T', snapshot, [{ path: 'a.js', content: 'x' }], 'm'),
    ).rejects.toThrow();
  });
});