import { describe, it, expect } from 'vitest';
import { ExtensionStorage } from '../../../extension/storage/ExtensionStorage';

describe('ExtensionStorage', () => {
  it('namespaces keys with gfe. prefix', async () => {
    await ExtensionStorage.set('foo', { a: 1 });
    const raw = await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get('gfe.foo', (result) => resolve(result));
    });
    expect(raw['gfe.foo']).toEqual({ a: 1 });
  });

  it('get returns undefined for missing key', async () => {
    const v = await ExtensionStorage.get<string>('missing');
    expect(v).toBeUndefined();
  });

  it('roundtrips values', async () => {
    await ExtensionStorage.set('x', 42);
    const v = await ExtensionStorage.get<number>('x');
    expect(v).toBe(42);
  });

  it('delete removes a key', async () => {
    await ExtensionStorage.set('gone', 'here');
    await ExtensionStorage.delete('gone');
    expect(await ExtensionStorage.get('gone')).toBeUndefined();
  });

  it('setLastSync / getLastSync roundtrip', async () => {
    const data = { slug: 'a', title: 'A', commitSha: 'abc', syncedAt: '2026-01-01T00:00:00Z' };
    await ExtensionStorage.setLastSync(data);
    expect(await ExtensionStorage.getLastSync()).toEqual(data);
  });
});