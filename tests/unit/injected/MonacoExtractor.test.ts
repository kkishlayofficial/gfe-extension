import { describe, it, expect, vi, afterEach } from 'vitest';
import { MonacoExtractor } from '../../../extension/injected/MonacoExtractor';
import { MonacoUnavailableError } from '../../../extension/types';

function stubMonaco(models: Array<{ path: string; content: string; language: string }>): void {
  const monacoModels = models.map((m) => ({
    uri: { path: `/${m.path}` },
    getValue: () => m.content,
    getLanguageId: () => m.language,
  }));
  (window as unknown as { monaco: unknown }).monaco = {
    editor: { getModels: () => monacoModels },
  };
}

describe('MonacoExtractor', () => {
  afterEach(() => {
    delete (window as unknown as { monaco?: unknown }).monaco;
    vi.restoreAllMocks();
  });

  it('extracts models and strips leading slash from path', () => {
    stubMonaco([
      { path: 'src/a.js', content: 'a', language: 'javascript' },
      { path: 'package.json', content: '{}', language: 'json' },
    ]);
    const files = new MonacoExtractor().extract();
    expect(files).toEqual([
      { path: 'package.json', content: '{}', language: 'json' },
      { path: 'src/a.js', content: 'a', language: 'javascript' },
    ]);
  });

  it('returns files sorted by path ascending', () => {
    stubMonaco([
      { path: 'z.js', content: 'z', language: 'javascript' },
      { path: 'a.js', content: 'a', language: 'javascript' },
    ]);

    const files = new MonacoExtractor().extract();

    expect(files.map((file) => file.path)).toEqual(['a.js', 'z.js']);
  });

  it('throws MonacoUnavailableError when monaco missing', () => {
    expect(() => new MonacoExtractor().extract()).toThrow(MonacoUnavailableError);
  });
});