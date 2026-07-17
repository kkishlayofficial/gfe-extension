import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../../extension/test-utils/testing-library';
import { App } from '../../../extension/popup/App';
import { SyncState } from '../../../extension/types';

describe('App', () => {
  beforeEach(() => {
    chrome.runtime.sendMessage = vi.fn(async () => ({
      syncState: SyncState.Idle,
      auth: { connected: true, tokenExpired: false, username: 'me', avatarUrl: '' },
      config: {
        repoName: 'greatfrontend-solutions',
        folderLayout: 'categorized',
        commitMessageTemplate: 'feat: add {slug}',
        autoSync: true,
        generateRootReadme: true,
        repoVisibility: 'private',
      },
    })) as never;
  });

  it('renders sync + repo sections when connected', async () => {
    render(<App />);
    await screen.findByText(/Sync status/i);
    expect(screen.getByText(/Idle/)).toBeInTheDocument();
    expect(screen.getByText(/me\/greatfrontend-solutions/)).toBeInTheDocument();
  });
});