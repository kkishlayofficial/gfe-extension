import { RawMetadata } from '../types';

declare global {
  interface Window {
    __next_f?: unknown[];
  }
}

export class RawMetadataCapture {
  capture(): RawMetadata {
    const nextF =
      (self as typeof globalThis & { __next_f?: unknown[] }).__next_f ??
      (globalThis as typeof globalThis & { __next_f?: unknown[] }).__next_f;

    if (Array.isArray(nextF) && nextF.length > 0) {
      return { __next_f: nextF };
    }

    return {
      domSnapshot: {
        title: document.querySelector('h1')?.textContent?.trim() ?? '',
        difficulty: document.querySelector('[data-testid="difficulty"]')?.textContent?.trim() ?? '',
        duration: document.querySelector('[data-testid="duration"]')?.textContent?.trim() ?? '',
        description: document.querySelector('.prose')?.innerHTML ?? '',
        url: location.href,
      },
    };
  }
}