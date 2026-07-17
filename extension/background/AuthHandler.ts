import { EventBus } from './EventBus';
import { ExtensionStorage } from '../storage/ExtensionStorage';
import { AuthError } from '../types';
import { logger } from '../utils/Logger';

const STATE_KEY = 'gfe.oauth.state';
const USER_INFO_URL = 'https://api.github.com/user';

interface UserProfile {
  login: string;
  avatar_url: string;
}

interface StoredUser {
  username: string;
  avatarUrl: string;
}

function requireEnv(name: 'VITE_GITHUB_CLIENT_ID' | 'VITE_WORKER_URL'): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name];

  if (!value) {
    throw new AuthError(`Missing ${name} at build time`);
  }

  return value;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function launchWebAuthFlow(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      const error = chrome.runtime.lastError;

      if (error || !redirectUrl) {
        reject(new AuthError(error?.message ?? 'OAuth flow returned no redirect'));
        return;
      }

      resolve(redirectUrl);
    });
  });
}

async function getStoredState(): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    chrome.storage.session.get(STATE_KEY, (stored) => {
      resolve((stored as Record<string, string | undefined>)[STATE_KEY]);
    });
  });
}

async function clearStoredState(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.session.remove(STATE_KEY, () => resolve());
  });
}

async function storeStoredState(value: string): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.session.set({ [STATE_KEY]: value }, () => resolve());
  });
}

async function storeUser(user: StoredUser): Promise<void> {
  await ExtensionStorage.set('user', user);
}

async function storeToken(token: string): Promise<void> {
  await ExtensionStorage.set('token', token);
}

async function readToken(): Promise<string | undefined> {
  return ExtensionStorage.get<string>('token');
}

async function clearAuthStorage(): Promise<void> {
  await ExtensionStorage.delete('token');
  await ExtensionStorage.delete('user');
}

async function fetchGitHubUser(token: string): Promise<StoredUser> {
  const response = await fetch(USER_INFO_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new AuthError(`GitHub user fetch failed: ${response.status}`);
  }

  const profile = (await response.json()) as UserProfile;
  return {
    username: profile.login,
    avatarUrl: profile.avatar_url,
  };
}

export class AuthHandler {
  constructor(private readonly bus: EventBus) {}

  async startAuth(): Promise<void> {
    try {
      const clientId = requireEnv('VITE_GITHUB_CLIENT_ID');
      const workerUrl = requireEnv('VITE_WORKER_URL');
      const redirectUri = chrome.identity.getRedirectURL('callback');
      const nonce = randomNonce();

      await storeStoredState(nonce);

      const authUrl = new URL('https://github.com/login/oauth/authorize');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', 'repo');
      authUrl.searchParams.set('state', nonce);

      const redirectUrl = await launchWebAuthFlow(authUrl.toString());
      const parsed = new URL(redirectUrl);
      const code = parsed.searchParams.get('code');
      const returnedState = parsed.searchParams.get('state');
      const storedState = await getStoredState();

      await clearStoredState();

      if (!code) {
        throw new AuthError('OAuth callback missing code');
      }

      if (!returnedState || returnedState !== storedState) {
        throw new AuthError('OAuth state nonce mismatch');
      }

      const tokenResponse = await fetch(`${workerUrl}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const tokenBody = (await tokenResponse.json()) as { access_token?: string; error?: string };

      if (!tokenResponse.ok || !tokenBody.access_token) {
        throw new AuthError(tokenBody.error ?? 'Worker token exchange failed');
      }

      await storeToken(tokenBody.access_token);

      const user = await fetchGitHubUser(tokenBody.access_token);
      await storeUser(user);

      await this.bus.emit({
        type: 'AUTH_COMPLETE',
        payload: user,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('auth-failed', { message });
      await this.bus.emit({
        type: 'AUTH_FAILED',
        payload: { error: message },
      });
    }
  }

  async revokeAuth(): Promise<void> {
    await clearAuthStorage();
    await this.bus.emit({
      type: 'AUTH_REVOKED',
      payload: {},
    });
  }

  async validateStoredToken(): Promise<boolean> {
    const token = await readToken();

    if (!token) {
      return false;
    }

    try {
      const user = await fetchGitHubUser(token);

      await storeUser(user);
      return true;
    } catch (error) {
      if (error instanceof AuthError && error.message.startsWith('GitHub user fetch failed: 401')) {
        await clearAuthStorage();
        await this.bus.emit({
          type: 'TOKEN_EXPIRED',
          payload: {},
        });
        return false;
      }

      logger.warn('validate-token-network-error', { err: String(error) });
      return false;
    }
  }
}