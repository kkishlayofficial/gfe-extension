import '@testing-library/jest-dom/vitest';
import { chrome } from 'vitest-chrome/lib/index.esm.js';
import { vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

(globalThis as unknown as { chrome: typeof chrome }).chrome = chrome;

const require = createRequire(import.meta.url);
const { setupServer } = await import(pathToFileURL(require.resolve('msw/node')).href);

export const server = setupServer();

if (!(chrome.storage as any).session) {
  (chrome.storage as unknown as { session: typeof chrome.storage.local }).session = {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  } as typeof chrome.storage.local;
}

let storageState: Record<string, unknown> = {};
let sessionState: Record<string, unknown> = {};

function ensureSessionStorage(): void {
  if (!(chrome.storage as any).session) {
    (chrome.storage as unknown as { session: typeof chrome.storage.local }).session = {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    } as typeof chrome.storage.local;
  }
}

function applyStorageMock<T extends 'local' | 'session'>(
  area: typeof chrome.storage.local,
  state: Record<string, unknown>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (area.get as any).mockImplementation((keys: any, callback?: (items: Record<string, unknown>) => void) => {
    const result: Record<string, unknown> = {};

    if (keys == null) {
      Object.assign(result, state);
    } else if (typeof keys === 'string') {
      if (keys in state) {
        result[keys] = state[keys];
      }
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        if (key in state) {
          result[key] = state[key];
        }
      }
    } else {
      for (const [key, defaultValue] of Object.entries(keys)) {
        result[key] = key in state ? state[key] : defaultValue;
      }
    }

    if (callback) {
      (callback as (items: Record<string, unknown>) => void)(result);
      return;
    }

    return Promise.resolve(result);
  });

  area.set.mockImplementation((items: Record<string, unknown>, callback?: () => void) => {
    Object.assign(state, items);
    if (callback) {
      callback();
      return;
    }

    return Promise.resolve();
  });

  area.remove.mockImplementation((keys: string | string[], callback?: () => void) => {
    const list = typeof keys === 'string' ? [keys] : keys;
    for (const key of list) {
      delete state[key];
    }
    if (callback) {
      callback();
      return;
    }

    return Promise.resolve();
  });

  area.clear.mockImplementation((callback?: () => void) => {
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    if (callback) {
      callback();
      return;
    }

    return Promise.resolve();
  });
}

function installStorageMocks(): void {
  ensureSessionStorage();
  applyStorageMock(chrome.storage.local, storageState);
  applyStorageMock((chrome.storage as any).session, sessionState);
}

installStorageMocks();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  storageState = {};
  sessionState = {};
  installStorageMocks();
});

afterAll(() => server.close());

beforeEach(() => {
  storageState = {};
  sessionState = {};
  installStorageMocks();
});