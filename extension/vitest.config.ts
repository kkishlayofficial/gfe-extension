import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['../tests/setup.ts'],
    include: ['../tests/**/*.test.ts', '../tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['**/*.ts', '**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', 'dist/**', 'popup/**', 'options/**'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});