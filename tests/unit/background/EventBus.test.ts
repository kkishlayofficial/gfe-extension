import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../../extension/background/EventBus';
import { SyncState } from '../../../extension/types';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    chrome.runtime.sendMessage = vi.fn();
  });

  it('invokes registered handler on emit', async () => {
    const handler = vi.fn();
    bus.on('SYNC_STARTED', handler);
    await bus.emit({ type: 'SYNC_STARTED', payload: { slug: 'x' } });
    expect(handler).toHaveBeenCalledWith({ type: 'SYNC_STARTED', payload: { slug: 'x' } });
  });

  it('supports multiple handlers per type', async () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.on('SYNC_STARTED', a);
    bus.on('SYNC_STARTED', b);
    await bus.emit({ type: 'SYNC_STARTED', payload: { slug: 'y' } });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('does not invoke other-type handlers and supports off', async () => {
    const otherTypeHandler = vi.fn();
    bus.on('SYNC_STARTED', otherTypeHandler);
    await bus.emit({ type: 'SYNC_FAILED', payload: { error: 'nope' } });
    expect(otherTypeHandler).not.toHaveBeenCalled();

    bus.off('SYNC_STARTED', otherTypeHandler);
    await bus.emit({ type: 'SYNC_STARTED', payload: { slug: 'x' } });
    expect(otherTypeHandler).not.toHaveBeenCalled();
  });

  it('bridges STATE_CHANGED to chrome.runtime.sendMessage', async () => {
    await bus.emit({ type: 'STATE_CHANGED', payload: { state: SyncState.Syncing } });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'STATE_CHANGED',
      payload: { state: SyncState.Syncing },
    });
  });

  it.each([
    ['SYNC_COMPLETED', { slug: 's', commitSha: 'c', duration: 1, fileCount: 1 }],
    ['SYNC_FAILED', { error: 'e' }],
    ['SYNC_SKIPPED', { slug: 's', reason: 'hash_match' as const }],
    ['AUTH_COMPLETE', { username: 'u', avatarUrl: 'a' }],
    ['AUTH_FAILED', { error: 'e' }],
    ['TOKEN_EXPIRED', {}],
  ])('bridges %s to chrome.runtime.sendMessage', async (type, payload) => {
    await bus.emit({ type, payload } as never);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type, payload });
  });

  it('does NOT bridge QUESTION_COMPLETED (internal only)', async () => {
    await bus.emit({
      type: 'QUESTION_COMPLETED',
      payload: {
        workspace: [{ path: 'a', content: 'x', language: 'js' }],
        metadata: {},
        timestamp: 0,
        pageUrl: 'https://x',
      },
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('swallows chrome.runtime.sendMessage errors (popup closed)', async () => {
    chrome.runtime.sendMessage = vi.fn().mockImplementation(() => {
      throw new Error('Could not establish connection');
    });
    await expect(
      bus.emit({ type: 'STATE_CHANGED', payload: { state: SyncState.Idle } }),
    ).resolves.toBeUndefined();
  });

  it('awaits async handlers before returning', async () => {
    const order: string[] = [];
    bus.on('SYNC_STARTED', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('handler-done');
    });
    await bus.emit({ type: 'SYNC_STARTED', payload: { slug: 'x' } });
    order.push('emit-returned');
    expect(order).toEqual(['handler-done', 'emit-returned']);
  });
});