import type { CaptureResult } from '../types';

export class PageBridge {
  inject(): void {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.type = 'module';
    console.warn('[GFE Sync] injecting script:', script.src);

    const parent = document.head ?? document.documentElement;
    parent.appendChild(script);
    script.addEventListener('load', () => {
      console.warn('[GFE Sync] injected.js loaded');
      script.remove();
    });
    script.addEventListener('error', (e) => console.warn('[GFE Sync] injected.js load error:', e));
  }

  listen(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.origin !== location.origin) {
        return;
      }

      const data = event.data as {
        type?: string;
        workspace?: CaptureResult['workspace'];
        metadata?: CaptureResult['metadata'];
        timestamp?: number;
        pageUrl?: string;
      } | null;

      if (!data || data.type !== 'GFE_COMPLETE') {
        return;
      }

      console.warn('[GFE Sync] content bridge: forwarding to background');
      chrome.runtime.sendMessage({
        type: 'QUESTION_COMPLETED',
        payload: {
          workspace: data.workspace as CaptureResult['workspace'],
          metadata: data.metadata as CaptureResult['metadata'],
          timestamp: data.timestamp as number,
          pageUrl: data.pageUrl as string,
        },
      });
    });
  }
}
