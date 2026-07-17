import '@testing-library/jest-dom/vitest';
import { chrome } from 'vitest-chrome/lib/index.esm.js';
import { vi, beforeEach } from 'vitest';

(globalThis as unknown as { chrome: typeof chrome }).chrome = chrome;

if (!chrome.storage.session) {
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
  if (!chrome.storage.session) {
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
  area.get.mockImplementation((keys, callback) => {
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
      callback(result);
      return;
    }

    return Promise.resolve(result);
  });

  area.set.mockImplementation((items, callback) => {
    Object.assign(state, items);
    if (callback) {
      callback();
      return;
    }

    return Promise.resolve();
  });

  area.remove.mockImplementation((keys, callback) => {
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

  area.clear.mockImplementation((callback) => {
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
  applyStorageMock(chrome.storage.session, sessionState);
}

installStorageMocks();

beforeEach(() => {
  vi.clearAllMocks();
  storageState = {};
  sessionState = {};
  installStorageMocks();
});