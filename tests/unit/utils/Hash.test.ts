import { describe, it, expect } from 'vitest';
import { sha256 } from '../../../extension/utils/Hash';

describe('sha256', () => {
  it('produces a known digest for empty string', async () => {
    const h = await sha256('');
    expect(h).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('produces a known digest for "abc"', async () => {
    const h = await sha256('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('returns 64-char lowercase hex', async () => {
    const h = await sha256('anything');
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await sha256('same input');
    const b = await sha256('same input');
    expect(a).toBe(b);
  });
});