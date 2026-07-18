import { describe, it, expect, afterEach } from 'vitest';
import { RawMetadataCapture } from '../../../extension/injected/RawMetadataCapture';

describe('RawMetadataCapture', () => {
  afterEach(() => {
    delete (globalThis as unknown as { __next_f?: unknown }).__next_f;
    document.body.innerHTML = '';
  });

  it('returns __next_f when present and non-empty', () => {
    (globalThis as unknown as { __next_f: unknown[] }).__next_f = [[0, 'x'], [1, '{}']];
    const raw = new RawMetadataCapture().capture();
    expect(raw.__next_f).toBeDefined();
    expect(raw.domSnapshot).toBeDefined(); // always captured for DOMProvider fallback
  });

  it('falls back to DOM snapshot when __next_f empty', () => {
    (globalThis as unknown as { __next_f?: unknown[] }).__next_f = [];
    document.body.innerHTML = `
      <h2>Event Emitter</h2>
      <span class="text-yellow">Medium</span>
      <number-flow-react></number-flow-react>
      <div class="prose"><p>Describe it.</p></div>
    `;
    const raw = new RawMetadataCapture().capture();
    expect(raw.__next_f).toBeUndefined();
    expect(raw.domSnapshot?.title).toBe('Event Emitter');
    expect(raw.domSnapshot?.difficulty).toBe('Medium');
    expect(raw.domSnapshot?.description).toContain('Describe it');
    expect(raw.domSnapshot?.url).toBe(location.href);
  });

  it('DOM snapshot uses empty strings when selectors missing', () => {
    delete (globalThis as unknown as { __next_f?: unknown }).__next_f;
    const raw = new RawMetadataCapture().capture();
    expect(raw.domSnapshot).toEqual({
      title: '',
      difficulty: '',
      duration: '',
      description: '',
      url: location.href,
      companies: [],
    });
  });
});