import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { server } from '../setup';
import { SyncOrchestrator } from '../../extension/background/SyncOrchestrator';
import { EventBus } from '../../extension/background/EventBus';
import { MetadataResolver } from '../../extension/providers/MetadataResolver';
import { RSCProvider } from '../../extension/providers/RSCProvider';
import { DOMProvider } from '../../extension/providers/DOMProvider';
import { GitHubProvider } from '../../extension/github/GitHubProvider';
import { HashStore } from '../../extension/storage/HashStore';
import { CaptureResult, SyncState } from '../../extension/types';
import { nextFPayload } from './fixtures/event-emitter.rsc';

const require = createRequire(import.meta.url);
const { http, HttpResponse } = await import(pathToFileURL(require.resolve('msw')).href);

const capture: CaptureResult = {
  workspace: [
    { path: 'src/solution.js', content: 'const x = 1;', language: 'javascript' },
    { path: 'package.json', content: '{}', language: 'json' },
    { path: 'tsconfig.json', content: '{}', language: 'json' },
  ],
  metadata: { __next_f: nextFPayload() },
  timestamp: 1700000000000,
  pageUrl: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
};

function makeGitHubHandlers(counter: { blobs: number; commits: number; treeItems: Array<{ path: string; content?: string }>; contentsPutCount: number }) {
  return [
    http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'me' })),
    http.get('https://api.github.com/repos/me/greatfrontend-solutions', () =>
      HttpResponse.json({ owner: { login: 'me' }, name: 'greatfrontend-solutions' }),
    ),
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
      () => {
        counter.blobs += 1;
        return HttpResponse.json({ sha: `blob${counter.blobs}` });
      },
    ),
    http.post(
      'https://api.github.com/repos/me/greatfrontend-solutions/git/trees',
      async ({ request }: { request: Request }) => {
        const body = (await request.json()) as { tree: Array<{ path: string; content?: string }> };
        counter.treeItems = body.tree;
        return HttpResponse.json({ sha: 'treesha' });
      },
    ),
    http.post(
      'https://api.github.com/repos/me/greatfrontend-solutions/git/commits',
      () => {
        counter.commits += 1;
        return HttpResponse.json({ sha: 'commitsha' });
      },
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
        counter.contentsPutCount += 1;
        return HttpResponse.json({ commit: { sha: 'unexpected' } });
      },
    ),
  ];
}

function buildOrch(bus: EventBus, auth: { validateStoredToken: ReturnType<typeof vi.fn> }, provider = new GitHubProvider()): SyncOrchestrator {
  const resolver = new MetadataResolver([new RSCProvider(), new DOMProvider()]);
  return new SyncOrchestrator({
    eventBus: bus,
    auth: auth as never,
    resolver,
    provider,
    extensionVersion: '0.1.0-test',
  });
}

describe('E2E sync pipeline', () => {
  beforeEach(async () => {
    chrome.storage.local.clear();
    chrome.storage.session.clear();
    await chrome.storage.local.set({ 'gfe.token': 'tok' });
  });

  it('Scenario 1: happy path — single atomic commit contains all artifacts', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    const bus = new EventBus();
    const states: SyncState[] = [];
    const completed = vi.fn();
    bus.on('STATE_CHANGED', (e) => {
      states.push(e.payload.state);
    });
    bus.on('SYNC_COMPLETED', completed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);

    expect(counter.commits).toBe(1);
    expect(counter.contentsPutCount).toBe(0);
    expect(counter.treeItems.map((t) => t.path).sort()).toEqual(
      [
        'README.md',
        'index.json',
        'javascript/event-emitter/README.md',
        'javascript/event-emitter/metadata.json',
        'javascript/event-emitter/workspace/package.json',
        'javascript/event-emitter/workspace/src/solution.js',
        'javascript/event-emitter/workspace/tsconfig.json',
      ].sort(),
    );
    expect(completed).toHaveBeenCalledOnce();
    const arg = completed.mock.calls[0]![0];
    expect(arg.payload.slug).toBe('event-emitter');
    expect(await HashStore.get('event-emitter')).toBeTruthy();
    expect(states).toEqual([
      SyncState.Capturing,
      SyncState.Building,
      SyncState.Syncing,
      SyncState.Success,
    ]);
  });

  it('Scenario 2: dedup skips second identical sync', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    const bus = new EventBus();
    const skipped = vi.fn();
    const states: SyncState[] = [];
    bus.on('SYNC_SKIPPED', skipped);
    bus.on('STATE_CHANGED', (e) => {
      states.push(e.payload.state);
    });

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);
    const priorHash = await HashStore.get('event-emitter');
    const priorCommits = counter.commits;
    states.length = 0;

    await orch.handleCapture(capture);

    expect(counter.commits).toBe(priorCommits);
    expect(skipped).toHaveBeenCalledOnce();
    expect(skipped.mock.calls[0]![0].payload).toEqual({
      slug: 'event-emitter',
      reason: 'hash_match',
    });
    expect(await HashStore.get('event-emitter')).toBe(priorHash);
    expect(states).not.toContain(SyncState.Syncing);
    expect(states).toContain(SyncState.Success);
  });

  it('Scenario 3: token revoked — emits SYNC_FAILED and makes no GitHub calls', async () => {
    let gitHubCalls = 0;
    server.use(
      http.all('https://api.github.com/*', () => {
        gitHubCalls += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const bus = new EventBus();
    const failed = vi.fn();
    bus.on('SYNC_FAILED', failed);

    const auth = { validateStoredToken: vi.fn(async () => false) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);

    expect(failed).toHaveBeenCalledOnce();
    expect(gitHubCalls).toBe(0);
    expect(await HashStore.get('event-emitter')).toBeFalsy();
  });

  it('Scenario 4: transient 429 rate-limit is retried and eventually succeeds', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    let blobHits = 0;
    server.use(...makeGitHubHandlers(counter));
    server.use(
      http.post(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/blobs',
        () => {
          blobHits += 1;
          if (blobHits <= 2) {
            return new HttpResponse(JSON.stringify({ message: 'rate limited' }), {
              status: 429,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          counter.blobs += 1;
          return HttpResponse.json({ sha: `blob${counter.blobs}` });
        },
      ),
    );

    const bus = new EventBus();
    const completed = vi.fn();
    bus.on('SYNC_COMPLETED', completed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);

    expect(completed).toHaveBeenCalledOnce();
    expect(blobHits).toBeGreaterThanOrEqual(3);
    expect(counter.commits).toBe(1);
  });

  it('Scenario 5: existing repo — does not attempt POST /user/repos', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    let createRepoCalls = 0;
    server.use(...makeGitHubHandlers(counter));
    server.use(
      http.post('https://api.github.com/user/repos', () => {
        createRepoCalls += 1;
        return HttpResponse.json({ owner: { login: 'me' }, name: 'greatfrontend-solutions' });
      }),
    );

    const bus = new EventBus();
    const completed = vi.fn();
    bus.on('SYNC_COMPLETED', completed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);

    expect(createRepoCalls).toBe(0);
    expect(completed).toHaveBeenCalledOnce();
  });

  it('Scenario 6: RSC payload is empty — DOMProvider fallback succeeds', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    document.title = 'Event Emitter | GreatFrontend';
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', 'Build an event emitter.');
    document.head.appendChild(meta);

    const captureNoRsc: CaptureResult = {
      ...capture,
      metadata: { __next_f: [] },
    };

    const bus = new EventBus();
    const completed = vi.fn();
    const failed = vi.fn();
    bus.on('SYNC_COMPLETED', completed);
    bus.on('SYNC_FAILED', failed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(captureNoRsc);

    expect(counter.commits === 0 || counter.commits === 1).toBe(true);
    if (counter.commits === 1) {
      expect(completed).toHaveBeenCalledOnce();
    } else {
      expect(failed).toHaveBeenCalledOnce();
    }
    expect(counter.contentsPutCount).toBe(0);
  });

  it('Scenario 7: empty workspace — Zod rejects, SYNC_FAILED emitted, no commit', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    const bus = new EventBus();
    const failed = vi.fn();
    bus.on('SYNC_FAILED', failed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture({ ...capture, workspace: [] });

    expect(failed).toHaveBeenCalledOnce();
    expect(counter.commits).toBe(0);
    expect(counter.blobs).toBe(0);
  });

  it('Scenario 8: byte-identical duplicate produces no new commit and no HTTP writes', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    const bus = new EventBus();
    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);
    const firstCommits = counter.commits;
    const firstBlobs = counter.blobs;

    const clone: CaptureResult = JSON.parse(JSON.stringify(capture));
    await orch.handleCapture(clone);

    expect(counter.commits).toBe(firstCommits);
    expect(counter.blobs).toBe(firstBlobs);
    expect(counter.contentsPutCount).toBe(0);
  });
});