import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { ManifestV3Export } from '@crxjs/vite-plugin';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), crx({ manifest: manifest as ManifestV3Export })],
  define: {
    'import.meta.env.EXTENSION_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    target: 'chrome109',
    outDir: 'dist',
    emptyOutDir: true,
    minify: process.env.NODE_ENV === 'production',
    rollupOptions: {
      input: {
        injected: 'injected/index.ts',
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'injected' ? 'injected.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});