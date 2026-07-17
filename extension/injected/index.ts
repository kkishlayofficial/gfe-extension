import { FetchInterceptor } from './FetchInterceptor';
import { MonacoExtractor } from './MonacoExtractor';
import { RawMetadataCapture } from './RawMetadataCapture';
import type { CaptureResult } from '../types';

new FetchInterceptor().install();

window.addEventListener('GFE_COMPLETE', () => {
  try {
    const workspace = new MonacoExtractor().extract();
    const metadata = new RawMetadataCapture().capture();
    const result: CaptureResult = {
      workspace,
      metadata,
      timestamp: Date.now(),
      pageUrl: location.href,
    };

    window.postMessage({ type: 'GFE_COMPLETE', ...result }, location.origin);
  } catch (error) {
    console.error('[GFE Sync] capture failed:', error);
  }
});

export {};
