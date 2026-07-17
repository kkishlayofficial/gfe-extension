import { GitHubApiError } from '../types';
import { withRetry } from '../utils/Retry';
import { logger } from '../utils/Logger';

const BASE = 'https://api.github.com';

function encodeUtf8Base64(value: string): string {
  if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  return Buffer.from(value, 'utf-8').toString('base64');
}

function decodeUtf8Base64(value: string): string {
  const normalized = value.replace(/\s+/g, '');

  if (typeof atob === 'function') {
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(normalized, 'base64').toString('utf-8');
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token: string;
  body?: unknown;
  allow404?: boolean;
}

function isRetryableError(error: Error): boolean {
  if (error instanceof GitHubApiError) {
    if (error.rateLimited) return true;
    return error.status === 500 || error.status === 502 || error.status === 503;
  }

  return true;
}

export class GitHubClient {
  private async request<T>(path: string, options: RequestOptions): Promise<T | null> {
    const url = `${BASE}${path}`;

    const doRequest = async (): Promise<T | null> => {
      const requestInit: RequestInit = {
        method: options.method,
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
      };

      if (options.body !== undefined) {
        requestInit.body = JSON.stringify(options.body);
      }

      const response = await fetch(url, requestInit);

      if (options.allow404 && response.status === 404) {
        return null;
      }

      if (
        response.status === 429 ||
        (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0')
      ) {
        const retryAfter = response.headers.get('Retry-After');
        logger.warn('github-rate-limited', { path, retryAfter });
        throw new GitHubApiError(response.status, `Rate limited: ${path}`, true);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new GitHubApiError(
          response.status,
          `GitHub ${options.method} ${path} → ${response.status} ${text}`.trim(),
        );
      }

      if (response.status === 204) {
        return null;
      }

      const contentType = response.headers.get('Content-Type') ?? '';
      if (!contentType.includes('application/json')) {
        return null;
      }

      return (await response.json()) as T;
    };

    return withRetry(doRequest, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      shouldRetry: isRetryableError,
      onRetry: (attempt, error) =>
        logger.warn('github-retry', { path, attempt, err: String(error) }),
    });
  }

  async getRepo(
    owner: string,
    repo: string,
    token: string,
  ): Promise<{ owner: { login: string }; name: string } | null> {
    return this.request<{ owner: { login: string }; name: string }>(`/repos/${owner}/${repo}`, {
      method: 'GET',
      token,
      allow404: true,
    });
  }

  async createRepo(
    token: string,
    opts: { name: string; private: boolean; description: string },
  ): Promise<{ owner: { login: string }; name: string }> {
    const repo = await this.request<{ owner: { login: string }; name: string }>('/user/repos', {
      method: 'POST',
      token,
      body: {
        name: opts.name,
        private: opts.private,
        description: opts.description,
        auto_init: true,
      },
    });

    if (!repo) {
      throw new GitHubApiError(500, 'createRepo returned null');
    }

    return repo;
  }

  async getRef(
    owner: string,
    repo: string,
    token: string,
    ref: string,
  ): Promise<{ object: { sha: string } }> {
    const response = await this.request<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/ref/${ref}`,
      {
        method: 'GET',
        token,
      },
    );

    if (!response) {
      throw new GitHubApiError(500, `getRef null: ${ref}`);
    }

    return response;
  }

  async getCommit(
    owner: string,
    repo: string,
    token: string,
    sha: string,
  ): Promise<{ tree: { sha: string } }> {
    const response = await this.request<{ tree: { sha: string } }>(
      `/repos/${owner}/${repo}/git/commits/${sha}`,
      {
        method: 'GET',
        token,
      },
    );

    if (!response) {
      throw new GitHubApiError(500, `getCommit null: ${sha}`);
    }

    return response;
  }

  async createBlob(
    owner: string,
    repo: string,
    token: string,
    content: string,
    encoding: 'utf-8' | 'base64',
  ): Promise<{ sha: string }> {
    const response = await this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      token,
      body: { content, encoding },
    });

    if (!response) {
      throw new GitHubApiError(500, 'createBlob null');
    }

    return response;
  }

  async createTree(
    owner: string,
    repo: string,
    token: string,
    baseTreeSha: string,
    items: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }>,
  ): Promise<{ sha: string }> {
    const response = await this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      token,
      body: { base_tree: baseTreeSha, tree: items },
    });

    if (!response) {
      throw new GitHubApiError(500, 'createTree null');
    }

    return response;
  }

  async createCommit(
    owner: string,
    repo: string,
    token: string,
    opts: { message: string; treeSha: string; parentShas: string[] },
  ): Promise<{ sha: string }> {
    const response = await this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      token,
      body: { message: opts.message, tree: opts.treeSha, parents: opts.parentShas },
    });

    if (!response) {
      throw new GitHubApiError(500, 'createCommit null');
    }

    return response;
  }

  async updateRef(
    owner: string,
    repo: string,
    token: string,
    ref: string,
    sha: string,
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/git/refs/${ref}`, {
      method: 'PATCH',
      token,
      body: { sha, force: false },
    });
  }

  async getContents(
    owner: string,
    repo: string,
    token: string,
    path: string,
  ): Promise<{ content: string; sha: string } | null> {
    const response = await this.request<{ content: string; sha: string; encoding: string }>(
      `/repos/${owner}/${repo}/contents/${path}`,
      { method: 'GET', token, allow404: true },
    );

    if (!response) {
      return null;
    }

    return { content: decodeUtf8Base64(response.content), sha: response.sha };
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    token: string,
    path: string,
    opts: { message: string; content: string; sha?: string },
  ): Promise<{ commitSha: string }> {
    const body: Record<string, unknown> = {
      message: opts.message,
      content: encodeUtf8Base64(opts.content),
    };

    if (opts.sha) {
      body.sha = opts.sha;
    }

    const response = await this.request<{ commit: { sha: string } }>(
      `/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        token,
        body,
      },
    );

    if (!response) {
      throw new GitHubApiError(500, 'createOrUpdateFile null');
    }

    return { commitSha: response.commit.sha };
  }
}
