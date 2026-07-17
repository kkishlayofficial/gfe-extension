import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageBridge } from '../../../extension/content/PageBridge';

describe('PageBridge', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    chrome.runtime.getURL = vi.fn(() => 'chrome-extension://abc/injected.js') as never;
    chrome.runtime.sendMessage = vi.fn();
  });

  describe('inject', () => {
    it('appends script tag with correct src', () => {
      new PageBridge().inject();
      const script = document.head.querySelector('script') ?? document.documentElement.querySelector('script');
      expect(script).toBeTruthy();
      expect(script?.getAttribute('src')).toBe('chrome-extension://abc/injected.js');
      expect(script?.getAttribute('type')).toBe('module');
    });
  });

  describe('listen', () => {
    it('forwards valid GFE_COMPLETE message to chrome.runtime.sendMessage', () => {
      new PageBridge().listen();
      const payload = {
        type: 'GFE_COMPLETE',
        workspace: [{ path: 'a', content: 'x', language: 'js' }],
        metadata: {},
        timestamp: 1,
        pageUrl: 'https://x/y',
      };
      window.dispatchEvent(new MessageEvent('message', { data: payload, origin: location.origin }));
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'QUESTION_COMPLETED',
        payload: {
          workspace: payload.workspace,
          metadata: payload.metadata,
          timestamp: payload.timestamp,
          pageUrl: payload.pageUrl,
        },
      });
    });

    it('ignores messages from other origins', () => {
      new PageBridge().listen();
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'GFE_COMPLETE' },
          origin: 'https://evil.example',
        }),
      );
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('ignores messages with wrong type', () => {
      new PageBridge().listen();
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'OTHER' }, origin: location.origin }),
      );
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('ignores non-object data', () => {
      new PageBridge().listen();
      window.dispatchEvent(new MessageEvent('message', { data: null, origin: location.origin }));
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
  });
});