import '@testing-library/jest-dom/vitest';
import { chrome } from 'vitest-chrome';
import { vi, beforeEach } from 'vitest';

(globalThis as unknown as { chrome: typeof chrome }).chrome = chrome;

beforeEach(() => {
  vi.clearAllMocks();
  chrome.storage.local.clear(() => undefined);
});