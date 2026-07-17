import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { server } from '../../setup';
import { GitHubClient } from '../../../extension/github/GitHubClient';
import { IndexManager } from '../../../extension/github/IndexManager';
import type { RepoIndexEntry } from '../../../extension/types';

const require = createRequire(import.meta.url);
const { http, HttpResponse } = await import(pathToFileURL(require.resolve('msw')).href);

const entry: RepoIndexEntry = {
  hash: 'H', commitSha: 'C', syncedAt: '2026-01-01T00:00:00Z',
  extensionVersion: '0.1.0', snapshotVersion: 1,
  category: 'javascript', title: 'Event Emitter',
};

describe('IndexManager', () => {
  const client = new GitHubClient();
  const im = new IndexManager(client);

  it('returns empty index on 404', async () => {
    server.use(
      http.get('https://api.github.com/repos/o/r/contents/index.json', () => new HttpResponse(null, { status: 404 })),
    );
    expect(await im.get('o', 'r', 'T')).toEqual({ version: 1, solutions: {} });
  });

  it('parses existing index', async () => {
    const idx = { version: 1, solutions: { 'event-emitter': entry } };
    const content = Buffer.from(JSON.stringify(idx)).toString('base64');
    server.use(
      http.get('https://api.github.com/repos/o/r/contents/index.json', () =>
        HttpResponse.json({ content, sha: 'SHA', encoding: 'base64' }),
      ),
    );
    expect(await im.get('o', 'r', 'T')).toEqual(idx);
  });

  it('returns empty index when stored JSON is invalid', async () => {
    const content = Buffer.from('not json').toString('base64');
    server.use(
      http.get('https://api.github.com/repos/o/r/contents/index.json', () =>
        HttpResponse.json({ content, sha: 'SHA', encoding: 'base64' }),
      ),
    );
    expect(await im.get('o', 'r', 'T')).toEqual({ version: 1, solutions: {} });
  });
});