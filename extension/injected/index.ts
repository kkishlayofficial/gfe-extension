import { FetchInterceptor } from './FetchInterceptor';
import { MonacoExtractor } from './MonacoExtractor';
import { RawMetadataCapture } from './RawMetadataCapture';
import type { CaptureResult, WorkspaceFile } from '../types';

console.warn('[GFE Sync] injected script running, patching fetch...');
new FetchInterceptor().install();
console.warn('[GFE Sync] fetch patched');

function jsLangId(lang: string): string {
  const map: Record<string, string> = {
    JS: 'javascript',
    TS: 'typescript',
    JSX: 'javascript',
    TSX: 'typescript',
  };
  return map[lang.toUpperCase()] ?? 'javascript';
}

function jsFileExt(lang: string): string {
  const map: Record<string, string> = { JS: 'js', TS: 'ts', JSX: 'jsx', TSX: 'tsx' };
  return map[lang.toUpperCase()] ?? 'js';
}

// JavaScript/TypeScript submission — result CORRECT (code comes from API response)
window.addEventListener('GFE_JS_COMPLETE', (e: Event) => {
  try {
    const { code, slug, language } = (
      e as CustomEvent<{ code: string; slug: string; language: string }>
    ).detail;
    void slug; // slug is available for future use; metadata resolved from page
    const ext = jsFileExt(language);
    const workspace: WorkspaceFile[] = [
      { path: `solution.${ext}`, content: code, language: jsLangId(language) },
    ];
    const metadata = new RawMetadataCapture().capture();
    const result: CaptureResult = {
      workspace,
      metadata,
      timestamp: Date.now(),
      pageUrl: location.href,
    };
    window.postMessage({ type: 'GFE_COMPLETE', ...result }, location.origin);
    console.warn('[GFE Sync] postMessage sent, workspace files:', result.workspace.length);
  } catch (err) {
    console.error('[GFE Sync] JS capture failed:', err);
  }
});

// UI / system-design / manual mark-complete — workspace comes from Monaco
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
  } catch (err) {
    console.error('[GFE Sync] capture failed:', err);
  }
});

export {};

