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
  const onConnect = vi.fn();
  const onDisconnect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderSection(auth: AppState['auth'], authPending: 'connect' | 'disconnect' | null = null) {
    return render(
      <AuthSection
        state={makeState(auth)}
        authPending={authPending}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />,
    );
  }

  it('shows DisconnectedView when not connected', () => {
    renderSection({ connected: false, tokenExpired: false });

    expect(screen.getByRole('button', { name: /connect.*github/i })).toBeInTheDocument();
  });

  it('shows ReconnectView when token expired', () => {
    renderSection({ connected: false, tokenExpired: true });

    expect(screen.getByRole('button', { name: /reconnect github/i })).toBeInTheDocument();
    expect(screen.getByText(/token expired/i)).toBeInTheDocument();
  });

  it('shows ConnectedView with username and avatar', () => {
    renderSection({ connected: true, tokenExpired: false, username: 'alice', avatarUrl: 'https://av' });

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /alice/i })).toHaveAttribute('src', 'https://av');
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
  });

  it('Connect button calls onConnect', () => {
    renderSection({ connected: false, tokenExpired: false });

    screen.getByRole('button', { name: /connect.*github/i }).click();

    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('Reconnect button calls onConnect', () => {
    renderSection({ connected: false, tokenExpired: true });

    screen.getByRole('button', { name: /reconnect github/i }).click();

    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('Disconnect button calls onDisconnect', () => {
    renderSection({ connected: true, tokenExpired: false, username: 'a', avatarUrl: 'x' });

    screen.getByRole('button', { name: /disconnect/i }).click();

    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});