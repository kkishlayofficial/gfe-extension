import type { AppState, ExtensionMessage } from '../../types';

interface Props {
  auth: AppState['auth'];
}

function send(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message);
}

export function AuthSection({ auth }: Props): JSX.Element {
  if (auth.connected) {
    return (
      <section className="gfe-auth gfe-auth--connected">
        {auth.avatarUrl ? (
          <img className="gfe-avatar" src={auth.avatarUrl} alt={auth.username ?? 'user'} />
        ) : null}
        <span className="gfe-username">{auth.username ?? 'GitHub user'}</span>
        <button type="button" onClick={() => send({ type: 'AUTH_REVOKE' })}>
          Disconnect
        </button>
      </section>
    );
  }

  if (auth.tokenExpired) {
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