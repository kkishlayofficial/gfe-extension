import { describe, it, expect } from 'vitest';
import { ConfigStore } from '../../../extension/storage/ConfigStore';

describe('ConfigStore', () => {
  it('returns defaults when nothing stored', async () => {
    const cfg = await ConfigStore.get();
    expect(cfg.repoName).toBe('greatfrontend-solutions');
    expect(cfg.folderLayout).toBe('categorized');
    expect(cfg.autoSync).toBe(true);
    expect(cfg.generateRootReadme).toBe(true);
    expect(cfg.repoVisibility).toBe('private');
  });

  it('set merges partial config', async () => {
    await ConfigStore.set({ repoName: 'custom' });
    const cfg = await ConfigStore.get();
    expect(cfg.repoName).toBe('custom');
    expect(cfg.folderLayout).toBe('categorized');
  });

  it('multiple partial writes accumulate', async () => {
    await ConfigStore.set({ repoName: 'a' });
    await ConfigStore.set({ folderLayout: 'flat' });
    const cfg = await ConfigStore.get();
    expect(cfg.repoName).toBe('a');
    expect(cfg.folderLayout).toBe('flat');
  });
});