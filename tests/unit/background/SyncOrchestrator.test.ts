import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../extension/background/EventBus';
import { SyncOrchestrator } from '../../../extension/background/SyncOrchestrator';
import { ConfigStore } from '../../../extension/storage/ConfigStore';
import { ExtensionStorage } from '../../../extension/storage/ExtensionStorage';
import { HashStore } from '../../../extension/storage/HashStore';
import {
  CaptureResult,
  MetadataUnavailableError,
  QuestionMetadata,
  SyncState,
} from '../../../extension/types';

const meta: QuestionMetadata = {
  title: 'Event Emitter',
  slug: 'event-emitter',
  difficulty: 'medium',
  format: 'javascript',
  duration: 30,
  description: '',
  url: 'https://x/questions/javascript/event-emitter',
  languages: [],
  companies: [],
};

const capture: CaptureResult = {
  workspace: [{ path: 'src/a.js', content: 'x', language: 'javascript' }],
  metadata: { __next_f: [] },
  timestamp: 1,
  pageUrl: meta.url,
};

function makeDeps(
  overrides: Partial<{
    authValid: boolean;
    metaResult: QuestionMetadata | Error;
    provider: { ensureRepository: ReturnType<typeof vi.fn>; synchronize: ReturnType<typeof vi.fn> };
  }> = {},
) {
  const bus = new EventBus();
  const states: SyncState[] = [];
  bus.on('STATE_CHANGED', (event) => states.push(event.payload.state));
  const events: string[] = [];
  bus.on('SYNC_COMPLETED', () => events.push('COMPLETED'));
  bus.on('SYNC_FAILED', () => events.push('FAILED'));
  bus.on('SYNC_SKIPPED', () => events.push('SKIPPED'));

  const auth = {
    validateStoredToken: vi.fn(async () => overrides.authValid ?? true),
  };
  const resolver = {
    getMetadata: vi.fn(async () => {
      if (overrides.metaResult instanceof Error) {
        throw overrides.metaResult;
      }
      return overrides.metaResult ?? meta;
    }),
  };
  const provider =
    overrides.provider ?? {
      ensureRepository: vi.fn(async () => ({ owner: 'me', repo: 'repo' })),
      synchronize: vi.fn(async () => ({ commitSha: 'sha123' })),
    };

  return { bus, auth, resolver, provider, states, events };
}

function buildOrch(deps: ReturnType<typeof makeDeps>): SyncOrchestrator {
  return new SyncOrchestrator({
    eventBus: deps.bus,
    auth: deps.auth as never,
    resolver: deps.resolver as never,
    provider: deps.provider as never,
    extensionVersion: '0.1.0-test',
  });
}

beforeEach(async () => {
  chrome.storage.local.clear();
  chrome.storage.session.clear();
  await chrome.storage.local.set({ 'gfe.token': 'tok' });
  await ConfigStore.set({});
});

describe('SyncOrchestrator', () => {
  it('runs happy path Idle → Capturing → Building → Syncing → Success', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);

    await orch.handleCapture(capture);

    expect(deps.states).toEqual([
      SyncState.Capturing,
      SyncState.Building,
      SyncState.Syncing,
      SyncState.Success,
    ]);
    expect(deps.events).toContain('COMPLETED');
    expect(deps.provider.synchronize).toHaveBeenCalledOnce();
    const stored = await HashStore.get('event-emitter');
    expect(stored).toBeTruthy();
    const last = await ExtensionStorage.getLastSync();
    expect(last?.commitSha).toBe('sha123');
  });

  it('short-circuits with SYNC_SKIPPED when hash matches', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);

    await orch.handleCapture(capture);
    deps.provider.synchronize.mockClear();

    await orch.handleCapture(capture);

    expect(deps.provider.synchronize).not.toHaveBeenCalled();
    expect(deps.events).toContain('SKIPPED');
  });

  it('emits SYNC_FAILED when metadata resolution fails', async () => {
    const deps = makeDeps({ metaResult: new MetadataUnavailableError('nope') });
    const orch = buildOrch(deps);

    await orch.handleCapture(capture);

    expect(deps.events).toContain('FAILED');
    expect(deps.provider.synchronize).not.toHaveBeenCalled();
  });

  it('aborts sync when token invalid', async () => {
    const deps = makeDeps({ authValid: false });
    const orch = buildOrch(deps);

    await orch.handleCapture(capture);

    expect(deps.provider.synchronize).not.toHaveBeenCalled();
    expect(deps.events).toContain('FAILED');
  });

  it('rejects invalid workspace via Zod', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);

    await orch.handleCapture({
      ...capture,
      workspace: [{ path: '', content: '', language: '' }],
    });

    expect(deps.events).toContain('FAILED');
    expect(deps.provider.synchronize).not.toHaveBeenCalled();
  });

  it('calls validateStoredToken with NO arguments (bus is injected into AuthHandler)', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);

    await orch.handleCapture(capture);

    expect(deps.auth.validateStoredToken).toHaveBeenCalledTimes(1);
    expect(deps.auth.validateStoredToken).toHaveBeenCalledWith();
  });

  it('validates the stored token at most once per session (subsequent captures skip)', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);

    await orch.handleCapture(capture);

    const modified = {
      ...capture,
      workspace: [{ path: 'src/a.js', content: 'y', language: 'javascript' }],
    };

    await orch.handleCapture(modified);

    expect(deps.auth.validateStoredToken).toHaveBeenCalledTimes(1);
  });
});