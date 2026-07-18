import { PageBridge } from './PageBridge';
import { PageToast } from './PageToast';

const bridge = new PageBridge();
bridge.inject();
bridge.listen();

const pageToast = new PageToast();

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: string }).type === 'SHOW_PAGE_TOAST'
  ) {
    const { payload } = message as {
      type: string;
      payload: { type: 'success' | 'error'; message: string };
    };
    pageToast.show(payload.type, payload.message);
  }
});
