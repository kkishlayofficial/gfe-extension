import { useEffect, useState } from 'react';
import { AuthSection } from './components/AuthSection';
import { SyncSection } from './components/SyncSection';
import { RepoSection } from './components/RepoSection';
import { ErrorBanner } from './components/ErrorBanner';
import { OptionsPanel } from './components/OptionsPanel';
import { AppState, ExtensionEvent } from '../types';
import logoUrl from './assets/logo.png';

type View = 'main' | 'settings';

async function loadState(): Promise<AppState> {
  return await chrome.runtime.sendMessage({ type: 'GET_STATE' });
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [view, setView] = useState<View>('main');
  const [authPending, setAuthPending] = useState<'connect' | 'disconnect' | null>(null);
  const errorMessage = error ?? state?.lastError;

  useEffect(() => {
    // Load state and surface any error that occurred while the popup was closed.
    void loadState().then((initialState) => {
      setState(initialState);
      void chrome.storage.local
        .get('pendingNotification')
        .then((stored: Record<string, unknown>) => {
          const pending = stored['pendingNotification'] as
            | { type: 'success' | 'error'; message: string }
            | undefined;
          if (pending?.type === 'error') {
            setError(pending.message);
          }
          if (pending) {
            void chrome.storage.local.remove('pendingNotification');
            chrome.action.setBadgeText({ text: '' });
          }
        });
    });
    const listener = (event: ExtensionEvent) => {
      if (event.type === 'STATE_CHANGED') {
        setState((prev) => (prev ? { ...prev, syncState: event.payload.state } : prev));
      } else if (event.type === 'SYNC_COMPLETED') {
        void loadState().then((newState) => {
          setState(newState);
          void chrome.storage.local.remove('pendingNotification');
          chrome.action.setBadgeText({ text: '' });
        });
        setError(undefined);
      } else if (event.type === 'SYNC_FAILED') {
        setError(event.payload.error);
        void chrome.storage.local.remove('pendingNotification');
        chrome.action.setBadgeText({ text: '' });
      } else if (
        event.type === 'AUTH_COMPLETE' ||
        event.type === 'AUTH_REVOKED' ||
        event.type === 'TOKEN_EXPIRED'
      ) {
        void loadState().then(setState);
        setAuthPending(null);
      } else if (event.type === 'AUTH_FAILED') {
        setAuthPending(null);
        setError('Authentication failed. Please try again.');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = () => {
    setAuthPending('connect');
    chrome.runtime.sendMessage({ type: 'AUTH_START' });
  };

  const handleDisconnect = () => {
    setAuthPending('disconnect');
    chrome.runtime.sendMessage({ type: 'AUTH_REVOKE' });
  };

  if (!state) return <div className="loading">Loading…</div>;

  return (
    <main className="gfe-popup">
      <header className="gfe-popup__header">
        <img src={logoUrl} alt="GreatFrontend" className="gfe-popup__logo" />
        <div style={{ flex: 1 }}>
          <h1 className="gfe-popup__title">GFE Sync</h1>
          <p className="gfe-popup__subtitle">GreatFrontend Solutions</p>
        </div>
        {view === 'settings' && (
          <button
            type="button"
            className="gfe-nav-btn"
            onClick={() => setView('main')}
          >
            ← Back
          </button>
        )}
      </header>

      {view === 'settings' ? (
        <OptionsPanel />
      ) : (
        <>
          <ErrorBanner {...(errorMessage ? { message: errorMessage } : {})} />
          <AuthSection
            state={state}
            authPending={authPending}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
          {state.auth.connected ? (
            <>
              <SyncSection state={state} />
              <RepoSection state={state} />
            </>
          ) : (
            <>
              <div className="section" aria-hidden="true">
                <header>
                  <h2>Sync Status</h2>
                </header>
                <p style={{ color: 'var(--t3)', fontStyle: 'italic' }}>
                  Connect to start syncing your solutions.
                </p>
              </div>
              <div className="section" aria-hidden="true">
                <header>
                  <h2>Repository</h2>
                </header>
                <p style={{ color: 'var(--t3)', fontStyle: 'italic' }}>
                  Your repo will be created on first sync.
                </p>
              </div>
            </>
          )}
          <footer className="gfe-footer">
            <button
              type="button"
              className="gfe-footer-btn"
              onClick={() => setView('settings')}
            >
              Options
            </button>
          </footer>
        </>
      )}
    </main>
  );
}
