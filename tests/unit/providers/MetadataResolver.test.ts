import { describe, it, expect, vi } from 'vitest';
import { MetadataResolver } from '../../../extension/providers/MetadataResolver';
import {
  IMetadataProvider,
  MetadataUnavailableError,
  QuestionMetadata,
  RawMetadata,
} from '../../../extension/types';

const meta: QuestionMetadata = {
  title: 't',
  slug: 's',
  difficulty: 'easy',
  format: 'javascript',
  duration: 1,
  description: '',
  url: 'https://x/questions/javascript/s',
  languages: [],
  companies: [],
};

function provider(canHandle: boolean, result: QuestionMetadata | Error): IMetadataProvider {
  return {
    canHandle: vi.fn(() => canHandle),
    getMetadata: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('MetadataResolver', () => {
  it('uses first provider that canHandle and succeeds', async () => {
    const p1 = provider(true, meta);
    const p2 = provider(true, new Error('nope'));
    const resolver = new MetadataResolver([p1, p2]);
    const out = await resolver.getMetadata({} as RawMetadata);
    expect(out).toBe(meta);
    expect(p2.getMetadata).not.toHaveBeenCalled();
  });

  it('falls through when first provider throws', async () => {
    const p1 = provider(true, new Error('first fails'));
    const p2 = provider(true, meta);
    const resolver = new MetadataResolver([p1, p2]);
    const out = await resolver.getMetadata({} as RawMetadata);
    expect(out).toBe(meta);
  });

  it('skips providers that cannot handle', async () => {
    const p1 = provider(false, meta);
    const p2 = provider(true, meta);
    const resolver = new MetadataResolver([p1, p2]);
    await resolver.getMetadata({} as RawMetadata);
    expect(p1.getMetadata).not.toHaveBeenCalled();
    expect(p2.getMetadata).toHaveBeenCalled();
  });

  it('throws MetadataUnavailableError when all providers fail', async () => {
    const p1 = provider(true, new Error('a'));
    const p2 = provider(true, new Error('b'));
    const resolver = new MetadataResolver([p1, p2]);
    await expect(resolver.getMetadata({} as RawMetadata)).rejects.toThrow(
      MetadataUnavailableError,
    );
  });

  it('throws MetadataUnavailableError when no provider can handle', async () => {
    const resolver = new MetadataResolver([provider(false, meta), provider(false, meta)]);
    await expect(resolver.getMetadata({} as RawMetadata)).rejects.toThrow(
      MetadataUnavailableError,
    );
  });
});