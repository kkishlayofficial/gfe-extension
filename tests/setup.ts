import '@testing-library/jest-dom/vitest';
import { chrome } from 'vitest-chrome/lib/index.esm.js';
import { vi, beforeEach } from 'vitest';

(globalThis as unknown as { chrome: typeof chrome }).chrome = chrome;

let storageState: Record<string, unknown> = {};

chrome.storage.local.get.mockImplementation((keys, callback) => {
  const result: Record<string, unknown> = {};

  if (keys == null) {
    Object.assign(result, storageState);
  } else if (typeof keys === 'string') {
    if (keys in storageState) {
      result[keys] = storageState[keys];
    }
  } else if (Array.isArray(keys)) {
    for (const key of keys) {
      if (key in storageState) {
        result[key] = storageState[key];
      }
    }
  } else {
    for (const [key, defaultValue] of Object.entries(keys)) {
      result[key] = key in storageState ? storageState[key] : defaultValue;
    }
  }

  callback(result);
});

chrome.storage.local.set.mockImplementation((items, callback) => {
  storageState = { ...storageState, ...items };
  callback?.();
});

chrome.storage.local.remove.mockImplementation((keys, callback) => {
  const list = typeof keys === 'string' ? [keys] : keys;
  for (const key of list) {
    delete storageState[key];
  }
  callback?.();
});

chrome.storage.local.clear.mockImplementation((callback) => {
  storageState = {};
  callback?.();
});

beforeEach(() => {
  vi.clearAllMocks();
  storageState = {};
});