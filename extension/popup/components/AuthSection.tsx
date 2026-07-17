import type { AppState, ExtensionMessage } from '../../types';

interface Props {
  state: AppState;
}

function send(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message);
}

export function AuthSection({ state }: Props): JSX.Element {
  if (state.auth.connected) {
    return (
      <section className="gfe-auth gfe-auth--connected">
        {state.auth.avatarUrl ? (
          <img
            className="gfe-avatar"
            src={state.auth.avatarUrl}
            alt={state.auth.username ?? 'user'}
          />
        ) : null}
        <span className="gfe-username">{state.auth.username ?? 'GitHub user'}</span>
        <button type="button" onClick={() => send({ type: 'AUTH_REVOKE' })}>
          Disconnect
        </button>
      </section>
    );
  }

  if (state.auth.tokenExpired) {
    return (
      <section className="gfe-auth gfe-auth--reconnect">
        <p className="gfe-auth__message">Token expired, please reconnect.</p>
        <button type="button" onClick={() => send({ type: 'AUTH_START' })}>
          Reconnect GitHub
        </button>
      </section>
    );
  }

  return (
    <section className="gfe-auth gfe-auth--disconnected">
      <button type="button" onClick={() => send({ type: 'AUTH_START' })}>
        Connect GitHub
      </button>
    </section>
  );
}
