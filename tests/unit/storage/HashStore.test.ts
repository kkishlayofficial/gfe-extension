import { describe, it, expect } from 'vitest';
import { HashStore } from '../../../extension/storage/HashStore';
import type { RepoIndex } from '../../../extension/types';

describe('HashStore', () => {
  it('get returns undefined when unset', async () => {
    expect(await HashStore.get('a')).toBeUndefined();
  });

  it('set and get roundtrip', async () => {
    await HashStore.set('slug-a', 'hash-a');
    expect(await HashStore.get('slug-a')).toBe('hash-a');
  });

  it('getAll returns all hashes', async () => {
    await HashStore.set('a', '1');
    await HashStore.set('b', '2');
    expect(await HashStore.getAll()).toEqual({ a: '1', b: '2' });
  });

  it('import populates from RepoIndex', async () => {
    const idx: RepoIndex = {
      version: 1,
      solutions: {
        'event-emitter': {
          hash: 'HASH1',
          commitSha: 'C',
          syncedAt: '2026-01-01T00:00:00Z',
          extensionVersion: '0.1.0',
          snapshotVersion: 1,
          category: 'javascript',
          title: 'Event Emitter',
        },
        debounce: {
          hash: 'HASH2',
          commitSha: 'D',
          syncedAt: '2026-01-01T00:00:00Z',
          extensionVersion: '0.1.0',
          snapshotVersion: 1,
          category: 'javascript',
          title: 'Debounce',
        },
      },
    };
    await HashStore.import(idx);
    expect(await HashStore.get('event-emitter')).toBe('HASH1');
    expect(await HashStore.get('debounce')).toBe('HASH2');
  });
});