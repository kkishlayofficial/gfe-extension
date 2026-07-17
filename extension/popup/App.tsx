import { useEffect, useState } from 'react';
import { AuthSection } from './components/AuthSection';
import { SyncSection } from './components/SyncSection';
import { RepoSection } from './components/RepoSection';
import { ErrorBanner } from './components/ErrorBanner';
import { AppState, ExtensionEvent } from '../types';

async function loadState(): Promise<AppState> {
  return await chrome.runtime.sendMessage({ type: 'GET_STATE' });
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | undefined>();
  const errorMessage = error ?? state?.lastError;

  useEffect(() => {
    void loadState().then(setState);
    const listener = (event: ExtensionEvent) => {
      if (event.type === 'STATE_CHANGED') {
        setState((prev) => (prev ? { ...prev, syncState: event.payload.state } : prev));
      } else if (event.type === 'SYNC_COMPLETED') {
        void loadState().then(setState);
        setError(undefined);
      } else if (event.type === 'SYNC_FAILED') {
        setError(event.payload.error);
      } else if (
        event.type === 'AUTH_COMPLETE' ||
        event.type === 'AUTH_REVOKED' ||
        event.type === 'TOKEN_EXPIRED'
      ) {
        void loadState().then(setState);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  if (!state) return <div className="loading">Loading…</div>;
  return (
    <main>
      <ErrorBanner {...(errorMessage ? { message: errorMessage } : {})} />
      <AuthSection state={state} />
      {state.auth.connected && (
        <>
          <SyncSection state={state} />
          <RepoSection state={state} />
        </>
      )}
      <footer>
        <a href="options.html" target="_blank" rel="noreferrer">
          Options
        </a>
      </footer>
    </main>
  );
}
