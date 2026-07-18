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

    // Always capture DOM so DOMProvider can fall back if RSCProvider fails.
    // GFE uses h2 for the question title (not h1).
    // Difficulty is displayed in a colored span: text-green (easy), text-yellow (medium), text-red (hard).
    // Duration is inside a <number-flow-react> component; text content from its parent span works.
    const difficultyEl =
      document.querySelector<HTMLElement>('.text-green') ??
      document.querySelector<HTMLElement>('.text-yellow') ??
      document.querySelector<HTMLElement>('.text-red');
    const durationEl = document.querySelector<HTMLElement>('number-flow-react');
    const domSnapshot = {
      title:
        document.querySelector('h2')?.textContent?.trim() ??
        document.querySelector('h1')?.textContent?.trim() ??
        '',
      difficulty: difficultyEl?.textContent?.trim() ?? '',
      duration: durationEl?.parentElement?.textContent?.trim() ?? durationEl?.textContent?.trim() ?? '',
      description: document.querySelector('.prose')?.innerHTML ?? '',
      url: location.href,
      companies: (() => {
        // Find the "Asked at these companies" section by heading text.
        const headings = document.querySelectorAll<HTMLElement>('h2');
        for (const h2 of Array.from(headings)) {
          if (h2.textContent?.toLowerCase().includes('compan')) {
            const container = h2.nextElementSibling;
            if (container) {
              return Array.from(container.querySelectorAll<HTMLElement>('span'))
                .map((s) => s.textContent?.trim() ?? '')
                .filter(Boolean);
            }
          }
        }
        return [];
      })(),
    };

    if (Array.isArray(nextF) && nextF.length > 0) {
      // Only keep [1, string] entries — the JSON chunks RSCProvider reads.
      // Filtering out functions/React objects prevents DataCloneError in postMessage.
      const safe = nextF.filter(
        (entry): entry is [number, string] =>
          Array.isArray(entry) && entry.length >= 2 && entry[0] === 1 && typeof entry[1] === 'string',
      );
      if (safe.length > 0) {
        return { __next_f: safe, domSnapshot };
      }
    }

    return { domSnapshot };
  }
}
