import { useEffect, useState } from 'react';
import type { AppState, ExtensionEvent, ExtensionMessage } from '../types';
import { SyncConfigSchema, SyncState } from '../types';
import { AuthSection } from './components/AuthSection';
import './styles.css';

const initialState: AppState = {
  syncState: SyncState.Idle,
  auth: { connected: false, tokenExpired: false },
  config: SyncConfigSchema.parse({}),
};

function isPopupEvent(message: unknown): message is ExtensionEvent {
  return typeof message === 'object' && message !== null && 'type' in message;
}

export function App(): JSX.Element {
  const [state, setState] = useState<AppState>(initialState);

  useEffect(() => {
    const requestState: ExtensionMessage = { type: 'GET_STATE' };

    chrome.runtime.sendMessage(requestState, (response: AppState | undefined) => {
      if (response) {
        setState(response);
      }
    });

    const listener = (message: unknown): void => {
      if (!isPopupEvent(message)) {
        return;
      }

      if (message.type === 'STATE_CHANGED') {
        setState((current) => ({ ...current, syncState: message.payload.state }));
        return;
      }

      if (message.type === 'AUTH_COMPLETE') {
        setState((current) => ({
          ...current,
          auth: {
            connected: true,
            tokenExpired: false,
            username: message.payload.username,
            avatarUrl: message.payload.avatarUrl,
          },
        }));
        return;
      }

      if (message.type === 'AUTH_REVOKED') {
        setState((current) => ({
          ...current,
          auth: { connected: false, tokenExpired: false },
        }));
        return;
      }

      if (message.type === 'TOKEN_EXPIRED') {
        setState((current) => ({
          ...current,
          auth: { ...current.auth, connected: false, tokenExpired: true },
        }));
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  return (
    <main className="gfe-popup">
      <header className="gfe-popup__header">
        <h1>GreatFrontend Sync</h1>
        <p>Auth status and sync state.</p>
      </header>
      <AuthSection auth={state.auth} />
    </main>
  );
}