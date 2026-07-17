import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../../extension/test-utils/testing-library';
import { AuthSection } from '../../../extension/popup/components/AuthSection';
import { SyncState, type AppState } from '../../../extension/types';

function makeState(auth: AppState['auth']): AppState {
  return {
    syncState: SyncState.Idle,
    auth,
    config: {
      repoName: 'greatfrontend-solutions',
      folderLayout: 'categorized',
      commitMessageTemplate: 'feat: add {slug}',
      autoSync: true,
      generateRootReadme: true,
      repoVisibility: 'private',
    },
  };
}

describe('AuthSection', () => {
  beforeEach(() => {
    chrome.runtime.sendMessage = vi.fn();
  });

  it('shows DisconnectedView when not connected', () => {
    render(<AuthSection state={makeState({ connected: false, tokenExpired: false })} />);

    expect(screen.getByRole('button', { name: /connect github/i })).toBeInTheDocument();
  });

  it('shows ReconnectView when token expired', () => {
    render(<AuthSection state={makeState({ connected: false, tokenExpired: true })} />);

    expect(screen.getByRole('button', { name: /reconnect github/i })).toBeInTheDocument();
    expect(screen.getByText(/token expired/i)).toBeInTheDocument();
  });

  it('shows ConnectedView with username and avatar', () => {
    render(
      <AuthSection
        state={makeState({ connected: true, tokenExpired: false, username: 'alice', avatarUrl: 'https://av' })}
      />,
    );

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /alice/i })).toHaveAttribute('src', 'https://av');
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
  });

  it('Connect button sends AUTH_START message', () => {
    render(<AuthSection state={makeState({ connected: false, tokenExpired: false })} />);

    screen.getByRole('button', { name: /connect github/i }).click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_START' });
  });

  it('Reconnect button sends AUTH_START message', () => {
    render(<AuthSection state={makeState({ connected: false, tokenExpired: true })} />);

    screen.getByRole('button', { name: /reconnect github/i }).click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_START' });
  });

  it('Disconnect button sends AUTH_REVOKE message', () => {
    render(
      <AuthSection
        state={makeState({ connected: true, tokenExpired: false, username: 'a', avatarUrl: 'x' })}
      />,
    );

    screen.getByRole('button', { name: /disconnect/i }).click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_REVOKE' });
  });
});