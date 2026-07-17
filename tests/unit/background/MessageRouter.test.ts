import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageRouter } from '../../../extension/background/MessageRouter';
import { SyncState } from '../../../extension/types';

describe('MessageRouter', () => {
  let orch: { handleCapture: ReturnType<typeof vi.fn>; getState: () => SyncState };
  let auth: { startAuth: ReturnType<typeof vi.fn>; revokeAuth: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    orch = { handleCapture: vi.fn(async () => {}), getState: () => SyncState.Idle };
    auth = { startAuth: vi.fn(async () => {}), revokeAuth: vi.fn(async () => {}) };
    chrome.storage.local.clear();
  });

  it('dispatches QUESTION_COMPLETED to orchestrator', async () => {
    const router = new MessageRouter({ orchestrator: orch as never, auth: auth as never, eventBus: {} as never });
    const sendResponse = vi.fn();

    const handled = router.handle(
      {
        type: 'QUESTION_COMPLETED',
        payload: {
          workspace: [{ path: 'src/a.js', content: 'x', language: 'javascript' }],
          metadata: { __next_f: [] },
          timestamp: 0,
          pageUrl: 'https://x/questions/javascript/event-emitter',
        },
      } as never,
      sendResponse,
    );

    expect(handled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(orch.handleCapture).toHaveBeenCalled();
  });

  it('dispatches AUTH_START', async () => {
    const router = new MessageRouter({ orchestrator: orch as never, auth: auth as never, eventBus: {} as never });

    router.handle({ type: 'AUTH_START' } as never, vi.fn());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auth.startAuth).toHaveBeenCalled();
  });

  it('dispatches AUTH_REVOKE', async () => {
    const router = new MessageRouter({ orchestrator: orch as never, auth: auth as never, eventBus: {} as never });

    router.handle({ type: 'AUTH_REVOKE' } as never, vi.fn());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auth.revokeAuth).toHaveBeenCalled();
  });

  it('GET_STATE returns AppState via sendResponse', async () => {
    const router = new MessageRouter({ orchestrator: orch as never, auth: auth as never, eventBus: {} as never });
    const sendResponse = vi.fn();

    router.handle({ type: 'GET_STATE' } as never, sendResponse);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendResponse).toHaveBeenCalled();
    const arg = sendResponse.mock.calls[0]![0];
    expect(arg.syncState).toBe(SyncState.Idle);
    expect(arg.auth).toBeDefined();
    expect(arg.config).toBeDefined();
  });
});