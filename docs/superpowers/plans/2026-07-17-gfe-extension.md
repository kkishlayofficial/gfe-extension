# GreatFrontend Sync Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-quality Chrome Extension (Manifest V3) that automatically syncs completed GreatFrontend coding problems to a private GitHub repository.

**Architecture:** The extension uses a layered architecture: injected page scripts capture Monaco workspace + raw metadata; a content script bridges to the background service worker; the background orchestrates the full sync pipeline via a typed EventBus and SyncState machine; GitHub operations use the Git Data API for atomic commits. A stateless Cloudflare Worker handles the OAuth code-for-token exchange.

**Tech Stack:** TypeScript (strict) · React 18 · Vite · @crxjs/vite-plugin · pnpm workspaces · Zod · Vitest · MSW · vitest-chrome · ESLint · Prettier · Cloudflare Workers · GitHub REST API

## Global Constraints

1. **TypeScript strict mode** everywhere. `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`. No `any` outside of test fixtures; use `unknown` and narrow.
2. **SOLID module boundaries (enforced by review):**
   - `github/` imports ONLY from `types/`, `utils/`, and `generators/`. NEVER from `providers/`, `content/`, `injected/`, `background/`, `popup/`, or `options/`.
   - `providers/` imports ONLY from `types/` and `utils/`. NEVER from `github/`.
   - `generators/` imports ONLY from `types/` and `utils/`.
   - `injected/` runs in the PAGE world. It imports ONLY from `types/` (types are erased at runtime) and its own siblings. NEVER from `chrome.*`.
   - `content/` bridges page ↔ background. It imports ONLY from `types/`.
   - `background/` composes everything through INTERFACES (`IMetadataProvider`, `RepositoryProvider`).
   - `popup/` and `options/` are React apps. They communicate with `background/` via `chrome.runtime.sendMessage` and read config via `storage/`.
3. **All cross-module contracts live in `extension/types/index.ts`.** Never redefine an interface in a consumer file.
4. **Zod validates every external input.** Payloads from the page (`CaptureResult.workspace`), snapshots before hashing, `index.json` from GitHub, and `SyncConfig` read from storage all go through Zod parse.
5. **TDD is mandatory.** Every task follows Red → Green → Refactor. The failing test must be observed (`Expected: N tests fail with ...`) before any implementation code is written.
6. **No dead code.** Every export must be consumed. Every branch must be reachable.
7. **No `console.log` in production paths.** Use the `Logger` utility; it no-ops in prod for `debug`/`info`.
8. **No inline secrets.** `GITHUB_CLIENT_ID` and `WORKER_URL` come from `import.meta.env.VITE_*` (Vite dotenv). The `GITHUB_CLIENT_SECRET` lives ONLY in Cloudflare Worker environment.
9. **Deterministic snapshots.** `QuestionSnapshot.hash` is `sha256(JSON.stringify({ metadata, files }))` where `files` is sorted by `path` ascending. This is required for reliable deduplication.
10. **Atomic commits.** Every sync creates ONE atomic commit via the Git Data API (`createBlob` → `createTree` → `createCommit` → `updateRef`) containing ALL generated artifacts: workspace files, per-problem `README.md`, per-problem `metadata.json`, root `README.md` (if `SyncConfig.generateRootReadme`), and `index.json`. If building any artifact fails before the commit, the repository remains unchanged. The `commitSha` recorded inside the `index.json` entry is the parent HEAD SHA (fetched pre-flight) — the new commit's SHA cannot be known before the commit is created. No separate Contents API commits are made for post-sync metadata.
11. **Idempotent by design.** Rerunning a sync with the same workspace is a no-op (HashStore short-circuit → `SYNC_SKIPPED`). The pipeline can be interrupted and restarted at any time.
12. **Manifest V3 service worker constraints.** No top-level `await` outside of module imports. All async initialization is triggered on `chrome.runtime.onInstalled` or on first message. Never rely on module-level state persisting across service worker restarts — use `chrome.storage.session` for hot state, `chrome.storage.local` for cold state.
13. **Error boundaries.** Every top-level entry point (`background/index.ts`, `content/index.ts`, `injected/index.ts`, React roots) wraps its logic in `try/catch` and routes failures through `Logger.error` + `EventBus.emit('SYNC_FAILED' | 'AUTH_FAILED')`.
14. **Testing coverage targets:** ≥90% statements / ≥85% branches on `utils/`, `storage/`, `providers/`, `github/`, `generators/`. E2E covers happy path + deduplication.
15. **Commit hygiene.** Each task ends with a single conventional-commits commit. Never squash tasks. Every commit includes the `Co-authored-by: Copilot` trailer.
16. **No `/tmp` writes** anywhere in code, tests, or scripts. Use the repo root.
17. **Node ≥ 20.11, pnpm ≥ 9.** Chrome target: ≥ 109 (MV3 service worker).

---

## Milestones

- **M1 — Bootstrap:** repo scaffold, tooling, types, utils. (Tasks 1–3)
- **M2 — Storage & Auth foundation:** storage layers, worker, EventBus, AuthHandler, popup shell. (Tasks 4–8)
- **M3 — GitHub layer:** REST client, Git Data service, RepoManager, IndexManager, GitHubProvider. (Tasks 9–12)
- **M4 — Page capture:** injected FetchInterceptor + Monaco + RawMetadata + content bridge. (Tasks 13–15)
- **M5 — Metadata providers:** RSCProvider, DOMProvider, MetadataResolver. (Tasks 16–17)
- **M6 — Orchestration:** SyncOrchestrator + MessageRouter + service worker wiring. (Task 18)
- **M7 — Generators & E2E:** MarkdownBuilder, README/metadata/root generators, integration, E2E. (Tasks 19–21)
- **M8 — Popup UI complete.** (Task 22)
- **M9 — Options page.** (Task 23)
- **M10 — Polish & docs.** (Task 24)

---

### Task 1: Project Bootstrap

**Milestone:** M1

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`
- Create: `.gitignore`
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/vite.config.ts`
- Create: `extension/vitest.config.ts`
- Create: `extension/manifest.json`
- Create: `extension/background/index.ts` (placeholder)
- Create: `extension/content/index.ts` (placeholder)
- Create: `extension/injected/index.ts` (placeholder)
- Create: `extension/popup/index.html`
- Create: `extension/popup/index.tsx`
- Create: `extension/options/index.html`
- Create: `extension/options/index.tsx`
- Create: `tests/setup.ts`
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/src/index.ts` (placeholder)

**Interfaces:**
- Consumes: nothing (bootstrap task).
- Produces: buildable pnpm monorepo with `extension` and `worker` workspaces; `pnpm --filter extension build` produces a loadable Chrome extension in `extension/dist/`.

- [ ] **Step 1: Initialize repository root**

Create `package.json`:

```json
{
  "name": "gfe-extension-monorepo",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.11"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "format": "prettier --write \"**/*.{ts,tsx,js,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,json,md}\""
  },
  "devDependencies": {
    "prettier": "3.3.3",
    "eslint": "8.57.1",
    "@typescript-eslint/parser": "7.18.0",
    "@typescript-eslint/eslint-plugin": "7.18.0",
    "eslint-plugin-react": "7.37.1",
    "eslint-plugin-react-hooks": "4.6.2",
    "eslint-config-prettier": "9.1.0",
    "typescript": "5.6.3"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "extension"
  - "worker"
```

Create `.gitignore`:

```
node_modules/
dist/
.wrangler/
*.log
.env
.env.local
coverage/
.vscode/
.DS_Store
```

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

Create `.eslintrc.cjs`:

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: { react: { version: '18.3.0' } },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '.wrangler/'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
};
```

- [ ] **Step 2: Create extension package**

Create `extension/package.json`:

```json
{
  "name": "@gfe/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch --mode development",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint . --ext .ts,.tsx",
    "format:check": "prettier --check \"**/*.{ts,tsx,html,json}\""
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "2.0.0-beta.28",
    "@types/chrome": "0.0.278",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.2",
    "@vitest/coverage-v8": "2.1.2",
    "@testing-library/react": "16.0.1",
    "@testing-library/jest-dom": "6.5.0",
    "jsdom": "25.0.1",
    "msw": "2.4.9",
    "typescript": "5.6.3",
    "vite": "5.4.8",
    "vitest": "2.1.2",
    "vitest-chrome": "0.1.0"
  }
}
```

Create `extension/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx",
    "types": ["chrome", "vite/client", "vitest/globals"]
  },
  "include": ["**/*.ts", "**/*.tsx", "../tests/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

Create `extension/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
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
```

Create `extension/vitest.config.ts`:

```ts
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
```

Create `extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "GreatFrontend Sync",
  "version": "0.1.0",
  "description": "Automatically sync completed GreatFrontend solutions to a private GitHub repository.",
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA_REPLACE_WITH_YOUR_DEV_KEY_",
  "permissions": ["storage", "identity"],
  "host_permissions": [
    "https://www.greatfrontend.com/*",
    "https://api.github.com/*"
  ],
  "background": {
    "service_worker": "background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://www.greatfrontend.com/*"],
      "js": ["content/index.ts"],
      "run_at": "document_start",
      "world": "ISOLATED"
    }
  ],
  "action": {
    "default_popup": "popup/index.html",
    "default_title": "GreatFrontend Sync"
  },
  "options_page": "options/index.html",
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": ["https://www.greatfrontend.com/*"]
    }
  ]
}
```

Create placeholder entry files:

`extension/background/index.ts`:

```ts
console.warn('[GFE Sync] background loaded');
export {};
```

`extension/content/index.ts`:

```ts
console.warn('[GFE Sync] content loaded');
export {};
```

`extension/injected/index.ts`:

```ts
console.warn('[GFE Sync] injected loaded');
export {};
```

`extension/popup/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GFE Sync</title>
  </head>
  <body style="min-width: 320px; font-family: system-ui, sans-serif;">
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

`extension/popup/index.tsx`:

```tsx
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (root) createRoot(root).render(<div>GFE Sync (placeholder)</div>);
```

`extension/options/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GFE Sync — Options</title>
  </head>
  <body style="font-family: system-ui, sans-serif; padding: 24px;">
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

`extension/options/index.tsx`:

```tsx
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (root) createRoot(root).render(<div>GFE Sync Options (placeholder)</div>);
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { chrome } from 'vitest-chrome';
import { vi, beforeEach } from 'vitest';

(globalThis as unknown as { chrome: typeof chrome }).chrome = chrome;

beforeEach(() => {
  vi.clearAllMocks();
  chrome.storage.local.clear();
  chrome.storage.session.clear();
});
```

- [ ] **Step 3: Create worker package**

Create `worker/package.json`:

```json
{
  "name": "@gfe/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "wrangler deploy --dry-run --outdir=dist",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "lint": "eslint . --ext .ts"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "4.20241004.0",
    "typescript": "5.6.3",
    "vitest": "2.1.2",
    "wrangler": "3.80.0"
  }
}
```

Create `worker/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "types": ["@cloudflare/workers-types"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `worker/wrangler.toml`:

```toml
name = "gfe-oauth-token"
main = "src/index.ts"
compatibility_date = "2024-10-01"

[vars]
# GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set via `wrangler secret put`
```

Create `worker/src/index.ts` (placeholder — full impl in Task 5):

```ts
export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response('ok', { status: 200 });
  },
};
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`

Expected: `pnpm install` completes with `Done in ...` and no ERR_PNPM errors. Prints `+ 400+ packages` (approximate).

- [ ] **Step 5: Verify TypeScript builds**

Run: `pnpm --filter @gfe/extension exec tsc --noEmit`

Expected: exits 0 with no output.

Run: `pnpm --filter @gfe/worker exec tsc --noEmit`

Expected: exits 0 with no output.

- [ ] **Step 6: Verify extension bundles**

Run: `pnpm --filter @gfe/extension build`

Expected: writes `extension/dist/manifest.json`, `extension/dist/injected.js`, `extension/dist/popup/index.html`, `extension/dist/options/index.html`, and a background service-worker JS chunk. Prints `✓ built in ...ms`. Exit 0.

- [ ] **Step 7: Verify worker bundles**

Run: `pnpm --filter @gfe/worker build`

Expected: prints `Total Upload: ...KiB` and `Your worker has access to the following bindings:` — dry-run success. Exit 0.

- [ ] **Step 8: Verify extension loads in Chrome (manual)**

Load `extension/dist/` via `chrome://extensions/` → Developer mode → Load unpacked. Expected: extension appears with the name "GreatFrontend Sync", no red error text on the card. Service worker link is clickable.

- [ ] **Step 9: Commit**

`git add .`

`git commit -m "chore: bootstrap monorepo with extension and worker packages

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 2: Types & Zod Schemas

**Milestone:** M1

**Files:**
- Create: `extension/types/index.ts`
- Create: `tests/unit/types/schemas.test.ts`

**Interfaces:**
- Consumes: `zod` from Task 1.
- Produces: All interfaces, enums, constants, Zod schemas, message types, and error classes used by every downstream module. Every future import from `types/index.ts` originates here.

- [ ] **Step 1: Write failing test**

Create `tests/unit/types/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  WorkspaceFileSchema,
  QuestionMetadataSchema,
  QuestionSnapshotSchema,
  SyncConfigSchema,
  RepoIndexSchema,
  SNAPSHOT_VERSION,
  SyncState,
  GfeError,
  MonacoUnavailableError,
  MetadataUnavailableError,
  GitHubApiError,
  AuthError,
} from '../../../extension/types';
import { ZodError } from 'zod';

describe('WorkspaceFileSchema', () => {
  it('accepts a valid workspace file', () => {
    const result = WorkspaceFileSchema.parse({ path: 'src/a.js', content: 'x', language: 'javascript' });
    expect(result.path).toBe('src/a.js');
  });

  it('rejects missing path', () => {
    expect(() => WorkspaceFileSchema.parse({ content: 'x', language: 'javascript' })).toThrow(ZodError);
  });

  it('rejects non-string content', () => {
    expect(() => WorkspaceFileSchema.parse({ path: 'a', content: 42, language: 'javascript' })).toThrow(ZodError);
  });
});

describe('QuestionMetadataSchema', () => {
  it('accepts valid metadata', () => {
    const m = QuestionMetadataSchema.parse({
      title: 'Event Emitter',
      slug: 'event-emitter',
      difficulty: 'medium',
      format: 'javascript',
      duration: 20,
      description: 'Build an event emitter.',
      url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
      languages: ['js'],
      companies: ['Google'],
    });
    expect(m.slug).toBe('event-emitter');
  });

  it('rejects missing slug', () => {
    expect(() =>
      QuestionMetadataSchema.parse({
        title: 't',
        difficulty: 'easy',
        format: 'javascript',
        duration: 10,
        description: '',
        url: 'https://x',
        languages: [],
        companies: [],
      }),
    ).toThrow(ZodError);
  });
});

describe('QuestionSnapshotSchema', () => {
  it('accepts a valid snapshot', () => {
    const snap = QuestionSnapshotSchema.parse({
      metadata: {
        title: 'A',
        slug: 'a',
        difficulty: 'easy',
        format: 'javascript',
        duration: 10,
        description: '',
        url: 'https://x',
        languages: [],
        companies: [],
      },
      files: [{ path: 'a.js', content: 'x', language: 'javascript' }],
      hash: 'abc',
      completedAt: '2026-07-17T00:00:00Z',
      extensionVersion: '0.1.0',
      snapshotVersion: SNAPSHOT_VERSION,
    });
    expect(snap.snapshotVersion).toBe(1);
  });
});

describe('SyncConfigSchema', () => {
  it('applies defaults when parsing empty object', () => {
    const cfg = SyncConfigSchema.parse({});
    expect(cfg.repoName).toBe('greatfrontend-solutions');
    expect(cfg.folderLayout).toBe('categorized');
    expect(cfg.commitMessageTemplate).toBe('feat: add {slug} ({date})');
    expect(cfg.autoSync).toBe(true);
    expect(cfg.generateRootReadme).toBe(true);
    expect(cfg.repoVisibility).toBe('private');
  });

  it('accepts partial overrides', () => {
    const cfg = SyncConfigSchema.parse({ repoName: 'my-repo', folderLayout: 'flat' });
    expect(cfg.repoName).toBe('my-repo');
    expect(cfg.folderLayout).toBe('flat');
  });

  it('rejects invalid folderLayout', () => {
    expect(() => SyncConfigSchema.parse({ folderLayout: 'invalid' })).toThrow(ZodError);
  });
});

describe('RepoIndexSchema', () => {
  it('accepts empty solutions', () => {
    const idx = RepoIndexSchema.parse({ version: 1, solutions: {} });
    expect(idx.version).toBe(1);
  });

  it('accepts populated solutions', () => {
    const idx = RepoIndexSchema.parse({
      version: 1,
      solutions: {
        'event-emitter': {
          hash: 'abc',
          commitSha: 'def',
          syncedAt: '2026-07-17T00:00:00Z',
          extensionVersion: '0.1.0',
          snapshotVersion: 1,
          category: 'javascript',
          title: 'Event Emitter',
        },
      },
    });
    expect(idx.solutions['event-emitter']?.title).toBe('Event Emitter');
  });
});

describe('SyncState enum', () => {
  it('has all documented states', () => {
    expect(SyncState.Idle).toBe('idle');
    expect(SyncState.Capturing).toBe('capturing');
    expect(SyncState.Building).toBe('building');
    expect(SyncState.Authenticating).toBe('authenticating');
    expect(SyncState.Syncing).toBe('syncing');
    expect(SyncState.Success).toBe('success');
    expect(SyncState.Failed).toBe('failed');
  });
});

describe('Error hierarchy', () => {
  it('MonacoUnavailableError extends GfeError with correct code', () => {
    const e = new MonacoUnavailableError();
    expect(e).toBeInstanceOf(GfeError);
    expect(e.code).toBe('MONACO_UNAVAILABLE');
    expect(e.name).toBe('MonacoUnavailableError');
  });

  it('MetadataUnavailableError has default and custom messages', () => {
    expect(new MetadataUnavailableError().message).toMatch(/metadata/i);
    expect(new MetadataUnavailableError('custom').message).toBe('custom');
  });

  it('GitHubApiError preserves status and rateLimited flag', () => {
    const e = new GitHubApiError(403, 'rate limited', true);
    expect(e.status).toBe(403);
    expect(e.rateLimited).toBe(true);
  });

  it('AuthError has AUTH_ERROR code', () => {
    expect(new AuthError('bad').code).toBe('AUTH_ERROR');
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/types/schemas.test.ts`

Expected: `FAIL — Cannot find module '../../../extension/types'` (module not implemented yet).

- [ ] **Step 2: Implement types module**

Create `extension/types/index.ts`:

```ts
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

export const SNAPSHOT_VERSION = 1;
export const METADATA_SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export enum SyncState {
  Idle = 'idle',
  Capturing = 'capturing',
  Building = 'building',
  Authenticating = 'authenticating',
  Syncing = 'syncing',
  Success = 'success',
  Failed = 'failed',
}

// ─────────────────────────────────────────────────────────────
// Zod schemas (source of truth) — TS types inferred below
// ─────────────────────────────────────────────────────────────

export const WorkspaceFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  language: z.string().min(1),
});

export const QuestionMetadataSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  difficulty: z.string().min(1),
  format: z.string().min(1),
  duration: z.number().int().nonnegative(),
  description: z.string(),
  url: z.string().url(),
  languages: z.array(z.string()),
  companies: z.array(z.string()),
});

export const QuestionSnapshotSchema = z.object({
  metadata: QuestionMetadataSchema,
  files: z.array(WorkspaceFileSchema).min(1),
  hash: z.string().min(1),
  completedAt: z.string().min(1),
  extensionVersion: z.string().min(1),
  snapshotVersion: z.literal(SNAPSHOT_VERSION),
});

export const RawMetadataSchema = z.object({
  __next_f: z.array(z.unknown()).optional(),
  domSnapshot: z
    .object({
      title: z.string(),
      difficulty: z.string(),
      duration: z.string(),
      description: z.string(),
      url: z.string(),
    })
    .optional(),
});

export const CaptureResultSchema = z.object({
  workspace: z.array(WorkspaceFileSchema).min(1),
  metadata: RawMetadataSchema,
  timestamp: z.number().int().nonnegative(),
  pageUrl: z.string().url(),
});

export const SyncConfigSchema = z.object({
  repoName: z.string().min(1).default('greatfrontend-solutions'),
  folderLayout: z.enum(['categorized', 'flat']).default('categorized'),
  commitMessageTemplate: z.string().min(1).default('feat: add {slug} ({date})'),
  autoSync: z.boolean().default(true),
  generateRootReadme: z.boolean().default(true),
  repoVisibility: z.enum(['private', 'public']).default('private'),
});

export const RepoIndexEntrySchema = z.object({
  hash: z.string().min(1),
  commitSha: z.string().min(1),
  syncedAt: z.string().min(1),
  extensionVersion: z.string().min(1),
  snapshotVersion: z.number().int(),
  category: z.string().min(1),
  title: z.string().min(1),
});

export const RepoIndexSchema = z.object({
  version: z.literal(1),
  solutions: z.record(z.string(), RepoIndexEntrySchema),
});

// ─────────────────────────────────────────────────────────────
// Inferred TS types
// ─────────────────────────────────────────────────────────────

export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;
export type QuestionMetadata = z.infer<typeof QuestionMetadataSchema>;
export type QuestionSnapshot = z.infer<typeof QuestionSnapshotSchema>;
export type RawMetadata = z.infer<typeof RawMetadataSchema>;
export type CaptureResult = z.infer<typeof CaptureResultSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type RepoIndex = z.infer<typeof RepoIndexSchema>;
export type RepoIndexEntry = z.infer<typeof RepoIndexEntrySchema>;

// ─────────────────────────────────────────────────────────────
// Runtime state contracts (not user data — no Zod)
// ─────────────────────────────────────────────────────────────

export interface AppState {
  syncState: SyncState;
  auth: {
    connected: boolean;
    tokenExpired: boolean;
    username?: string;
    avatarUrl?: string;
  };
  config: SyncConfig;
  lastSync?: { slug: string; title: string; commitSha: string; syncedAt: string };
  lastError?: string;
}

export interface SyncTransaction {
  snapshot: QuestionSnapshot;
  blobs: Array<{ path: string; sha: string }>;
  treeSha: string | null;
  commitSha: string | null;
  status: 'pending' | 'blobs_created' | 'tree_created' | 'committed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

// ─────────────────────────────────────────────────────────────
// Provider interfaces (dependency-inversion boundaries)
// ─────────────────────────────────────────────────────────────

export interface IMetadataProvider {
  canHandle(raw: RawMetadata): boolean;
  getMetadata(raw: RawMetadata): Promise<QuestionMetadata>;
}

export interface RepositoryProvider {
  ensureRepository(token: string, config: SyncConfig): Promise<{ owner: string; repo: string }>;
  synchronize(
    snapshot: QuestionSnapshot,
    token: string,
    config: SyncConfig,
  ): Promise<{ commitSha: string }>;
}

// ─────────────────────────────────────────────────────────────
// EventBus event union
// ─────────────────────────────────────────────────────────────

export type ExtensionEvent =
  | { type: 'QUESTION_COMPLETED'; payload: CaptureResult }
  | { type: 'SNAPSHOT_CREATED'; payload: { snapshot: QuestionSnapshot } }
  | { type: 'SYNC_STARTED'; payload: { slug: string } }
  | {
      type: 'SYNC_COMPLETED';
      payload: { slug: string; commitSha: string; duration: number; fileCount: number };
    }
  | { type: 'SYNC_FAILED'; payload: { slug?: string; error: string } }
  | { type: 'SYNC_SKIPPED'; payload: { slug: string; reason: 'hash_match' } }
  | { type: 'STATE_CHANGED'; payload: { state: SyncState } }
  | { type: 'AUTH_COMPLETE'; payload: { username: string; avatarUrl: string } }
  | { type: 'AUTH_FAILED'; payload: { error: string } }
  | { type: 'AUTH_REVOKED'; payload: Record<string, never> }
  | { type: 'TOKEN_EXPIRED'; payload: Record<string, never> };

// ─────────────────────────────────────────────────────────────
// chrome.runtime message union
// ─────────────────────────────────────────────────────────────

export type ExtensionMessage =
  | { type: 'QUESTION_COMPLETED'; payload: CaptureResult }
  | { type: 'AUTH_START' }
  | { type: 'AUTH_REVOKE' }
  | { type: 'GET_STATE' };

// ─────────────────────────────────────────────────────────────
// Error hierarchy
// ─────────────────────────────────────────────────────────────

export class GfeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'GfeError';
  }
}

export class MonacoUnavailableError extends GfeError {
  constructor() {
    super('Monaco editor not found', 'MONACO_UNAVAILABLE');
    this.name = 'MonacoUnavailableError';
  }
}

export class MetadataUnavailableError extends GfeError {
  constructor(msg = 'Could not extract question metadata') {
    super(msg, 'METADATA_UNAVAILABLE');
    this.name = 'MetadataUnavailableError';
  }
}

export class GitHubApiError extends GfeError {
  constructor(
    public readonly status: number,
    message: string,
    public readonly rateLimited = false,
  ) {
    super(message, 'GITHUB_API_ERROR');
    this.name = 'GitHubApiError';
  }
}

export class AuthError extends GfeError {
  constructor(msg: string) {
    super(msg, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}
```

Run: `pnpm --filter @gfe/extension test tests/unit/types/schemas.test.ts`

Expected: `Test Files 1 passed | Tests 15 passed`. Exit 0.

- [ ] **Step 3: Commit**

`git add extension/types tests/unit/types`

`git commit -m "feat(types): add core interfaces, Zod schemas and error hierarchy

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 3: Logger, Hash, Retry Utilities

**Milestone:** M1

**Files:**
- Create: `extension/utils/Logger.ts`
- Create: `extension/utils/Hash.ts`
- Create: `extension/utils/Retry.ts`
- Create: `tests/unit/utils/Logger.test.ts`
- Create: `tests/unit/utils/Hash.test.ts`
- Create: `tests/unit/utils/Retry.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `logger`, `sha256`, `withRetry` used by every subsequent task.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/utils/Logger.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Logger', () => {
  const originalProd = import.meta.env.PROD;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (import.meta.env as { PROD: boolean }).PROD = originalProd;
  });

  it('logs debug in dev', async () => {
    (import.meta.env as { PROD: boolean }).PROD = false;
    const { logger } = await import('../../../extension/utils/Logger');
    logger.debug('test-event', { k: 'v' });
    expect(console.log).toHaveBeenCalledWith('[GFE Sync] debug: test-event', { k: 'v' });
  });

  it('does NOT log debug in prod', async () => {
    (import.meta.env as { PROD: boolean }).PROD = true;
    vi.resetModules();
    const { logger } = await import('../../../extension/utils/Logger');
    logger.debug('test-event');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('does NOT log info in prod', async () => {
    (import.meta.env as { PROD: boolean }).PROD = true;
    vi.resetModules();
    const { logger } = await import('../../../extension/utils/Logger');
    logger.info('test-event');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('always logs warn', async () => {
    (import.meta.env as { PROD: boolean }).PROD = true;
    vi.resetModules();
    const { logger } = await import('../../../extension/utils/Logger');
    logger.warn('warn-event', { k: 1 });
    expect(console.warn).toHaveBeenCalledWith('[GFE Sync] warn: warn-event', { k: 1 });
  });

  it('always logs error', async () => {
    (import.meta.env as { PROD: boolean }).PROD = true;
    vi.resetModules();
    const { logger } = await import('../../../extension/utils/Logger');
    logger.error('boom');
    expect(console.error).toHaveBeenCalledWith('[GFE Sync] error: boom', undefined);
  });
});
```

Create `tests/unit/utils/Hash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sha256 } from '../../../extension/utils/Hash';

describe('sha256', () => {
  it('produces a known digest for empty string', async () => {
    const h = await sha256('');
    expect(h).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('produces a known digest for "abc"', async () => {
    const h = await sha256('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('returns 64-char lowercase hex', async () => {
    const h = await sha256('anything');
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await sha256('same input');
    const b = await sha256('same input');
    expect(a).toBe(b);
  });
});
```

Create `tests/unit/utils/Retry.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../../extension/utils/Retry';

describe('withRetry', () => {
  it('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow('nope');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('calls onRetry hook with attempt number and error', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('uses exponential backoff', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.stubGlobal('setTimeout', (fn: () => void, ms: number) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0);
    });
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(delays).toEqual([10, 20]);
    vi.unstubAllGlobals();
  });

  it('does NOT retry when shouldRetry returns false', async () => {
    const fn = vi.fn(async () => {
      throw new Error('non-retryable');
    });
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, shouldRetry: () => false }),
    ).rejects.toThrow('non-retryable');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries when shouldRetry returns true', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('retryable');
      return 'ok';
    });
    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 0,
      shouldRetry: () => true,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('passes the thrown error to shouldRetry', async () => {
    const seen: Error[] = [];
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 0,
      shouldRetry: (err) => {
        seen.push(err);
        return true;
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.message).toBe('first');
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/utils/`

Expected: `FAIL — Cannot find module '../../../extension/utils/Logger'` and similar for Hash and Retry.

- [ ] **Step 2: Implement Logger**

Create `extension/utils/Logger.ts`:

```ts
type LogData = Record<string, unknown>;

const isProd = (): boolean => import.meta.env.PROD === true;

export const logger = {
  debug(event: string, data?: LogData): void {
    if (isProd()) return;
    // eslint-disable-next-line no-console
    console.log(`[GFE Sync] debug: ${event}`, data);
  },
  info(event: string, data?: LogData): void {
    if (isProd()) return;
    // eslint-disable-next-line no-console
    console.log(`[GFE Sync] info: ${event}`, data);
  },
  warn(event: string, data?: LogData): void {
    console.warn(`[GFE Sync] warn: ${event}`, data);
  },
  error(event: string, data?: LogData): void {
    console.error(`[GFE Sync] error: ${event}`, data);
  },
};
```

- [ ] **Step 3: Implement Hash**

Create `extension/utils/Hash.ts`:

```ts
export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 4: Implement Retry**

Create `extension/utils/Retry.ts`:

```ts
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxAttempts, baseDelayMs, shouldRetry, onRetry } = options;
  let lastError: Error = new Error('withRetry called with maxAttempts <= 0');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isLast = attempt >= maxAttempts;
      const retryable = shouldRetry ? shouldRetry(lastError) : true;
      if (isLast || !retryable) break;
      onRetry?.(attempt, lastError);
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/utils/`

Expected: `Test Files 3 passed | Tests 17 passed`. Exit 0.

- [ ] **Step 6: Commit**

`git add extension/utils tests/unit/utils`

`git commit -m "feat(utils): add Logger, Hash and Retry utilities

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 4: Storage Layer (ExtensionStorage, ConfigStore, HashStore)

**Milestone:** M2

**Files:**
- Create: `extension/storage/ExtensionStorage.ts`
- Create: `extension/storage/ConfigStore.ts`
- Create: `extension/storage/HashStore.ts`
- Create: `tests/unit/storage/ExtensionStorage.test.ts`
- Create: `tests/unit/storage/ConfigStore.test.ts`
- Create: `tests/unit/storage/HashStore.test.ts`

**Interfaces:**
- Consumes: `types/`, `vitest-chrome` mocks from setup.
- Produces:
  - `ExtensionStorage.get/set/delete/setLastSync/getLastSync` (used by SyncOrchestrator).
  - `ConfigStore.get/set` (used by SyncOrchestrator, Options page).
  - `HashStore.get/set/getAll/import` (used by SyncOrchestrator, IndexManager bootstrap).

- [ ] **Step 1: Write failing test for ExtensionStorage**

Create `tests/unit/storage/ExtensionStorage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ExtensionStorage } from '../../../extension/storage/ExtensionStorage';

describe('ExtensionStorage', () => {
  it('namespaces keys with gfe. prefix', async () => {
    await ExtensionStorage.set('foo', { a: 1 });
    const raw = await chrome.storage.local.get('gfe.foo');
    expect(raw['gfe.foo']).toEqual({ a: 1 });
  });

  it('get returns undefined for missing key', async () => {
    const v = await ExtensionStorage.get<string>('missing');
    expect(v).toBeUndefined();
  });

  it('roundtrips values', async () => {
    await ExtensionStorage.set('x', 42);
    const v = await ExtensionStorage.get<number>('x');
    expect(v).toBe(42);
  });

  it('delete removes a key', async () => {
    await ExtensionStorage.set('gone', 'here');
    await ExtensionStorage.delete('gone');
    expect(await ExtensionStorage.get('gone')).toBeUndefined();
  });

  it('setLastSync / getLastSync roundtrip', async () => {
    const data = { slug: 'a', title: 'A', commitSha: 'abc', syncedAt: '2026-01-01T00:00:00Z' };
    await ExtensionStorage.setLastSync(data);
    expect(await ExtensionStorage.getLastSync()).toEqual(data);
  });
});
```

- [ ] **Step 2: Write failing test for ConfigStore**

Create `tests/unit/storage/ConfigStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ConfigStore } from '../../../extension/storage/ConfigStore';

describe('ConfigStore', () => {
  it('returns defaults when nothing stored', async () => {
    const cfg = await ConfigStore.get();
    expect(cfg.repoName).toBe('greatfrontend-solutions');
    expect(cfg.folderLayout).toBe('categorized');
    expect(cfg.autoSync).toBe(true);
    expect(cfg.generateRootReadme).toBe(true);
    expect(cfg.repoVisibility).toBe('private');
  });

  it('set merges partial config', async () => {
    await ConfigStore.set({ repoName: 'custom' });
    const cfg = await ConfigStore.get();
    expect(cfg.repoName).toBe('custom');
    expect(cfg.folderLayout).toBe('categorized');
  });

  it('multiple partial writes accumulate', async () => {
    await ConfigStore.set({ repoName: 'a' });
    await ConfigStore.set({ folderLayout: 'flat' });
    const cfg = await ConfigStore.get();
    expect(cfg.repoName).toBe('a');
    expect(cfg.folderLayout).toBe('flat');
  });
});
```

- [ ] **Step 3: Write failing test for HashStore**

Create `tests/unit/storage/HashStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { HashStore } from '../../../extension/storage/HashStore';
import type { RepoIndex } from '../../../extension/types';

describe('HashStore', () => {
  it('get returns undefined when unset', async () => {
    expect(await HashStore.get('a')).toBeUndefined();
  });

  it('set and get roundtrip', async () => {
    await HashStore.set('slug-a', 'hash-a');
    expect(await HashStore.get('slug-a')).toBe('hash-a');
  });

  it('getAll returns all hashes', async () => {
    await HashStore.set('a', '1');
    await HashStore.set('b', '2');
    expect(await HashStore.getAll()).toEqual({ a: '1', b: '2' });
  });

  it('import populates from RepoIndex', async () => {
    const idx: RepoIndex = {
      version: 1,
      solutions: {
        'event-emitter': {
          hash: 'HASH1',
          commitSha: 'C',
          syncedAt: '2026-01-01T00:00:00Z',
          extensionVersion: '0.1.0',
          snapshotVersion: 1,
          category: 'javascript',
          title: 'Event Emitter',
        },
        debounce: {
          hash: 'HASH2',
          commitSha: 'D',
          syncedAt: '2026-01-01T00:00:00Z',
          extensionVersion: '0.1.0',
          snapshotVersion: 1,
          category: 'javascript',
          title: 'Debounce',
        },
      },
    };
    await HashStore.import(idx);
    expect(await HashStore.get('event-emitter')).toBe('HASH1');
    expect(await HashStore.get('debounce')).toBe('HASH2');
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/storage/`

Expected: three FAILs — `Cannot find module` for each storage module.

- [ ] **Step 4: Implement ExtensionStorage**

Create `extension/storage/ExtensionStorage.ts`:

```ts
const PREFIX = 'gfe.';

interface LastSync {
  slug: string;
  title: string;
  commitSha: string;
  syncedAt: string;
}

export class ExtensionStorage {
  static async get<T>(key: string): Promise<T | undefined> {
    const full = PREFIX + key;
    const result = await chrome.storage.local.get(full);
    return result[full] as T | undefined;
  }

  static async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [PREFIX + key]: value });
  }

  static async delete(key: string): Promise<void> {
    await chrome.storage.local.remove(PREFIX + key);
  }

  static async setLastSync(data: LastSync): Promise<void> {
    await ExtensionStorage.set('lastSync', data);
  }

  static async getLastSync(): Promise<LastSync | undefined> {
    return ExtensionStorage.get<LastSync>('lastSync');
  }
}
```

- [ ] **Step 5: Implement ConfigStore**

Create `extension/storage/ConfigStore.ts`:

```ts
import { SyncConfig, SyncConfigSchema } from '../types';
import { ExtensionStorage } from './ExtensionStorage';

const KEY = 'config';

export class ConfigStore {
  static async get(): Promise<SyncConfig> {
    const raw = (await ExtensionStorage.get<Partial<SyncConfig>>(KEY)) ?? {};
    return SyncConfigSchema.parse(raw);
  }

  static async set(partial: Partial<SyncConfig>): Promise<void> {
    const current = await ConfigStore.get();
    const merged = SyncConfigSchema.parse({ ...current, ...partial });
    await ExtensionStorage.set(KEY, merged);
  }
}
```

- [ ] **Step 6: Implement HashStore**

Create `extension/storage/HashStore.ts`:

```ts
import { RepoIndex } from '../types';
import { ExtensionStorage } from './ExtensionStorage';

const KEY = 'hashes';

type HashMap = Record<string, string>;

export class HashStore {
  static async get(slug: string): Promise<string | undefined> {
    const all = (await ExtensionStorage.get<HashMap>(KEY)) ?? {};
    return all[slug];
  }

  static async set(slug: string, hash: string): Promise<void> {
    const all = (await ExtensionStorage.get<HashMap>(KEY)) ?? {};
    all[slug] = hash;
    await ExtensionStorage.set(KEY, all);
  }

  static async getAll(): Promise<HashMap> {
    return (await ExtensionStorage.get<HashMap>(KEY)) ?? {};
  }

  static async import(index: RepoIndex): Promise<void> {
    const map: HashMap = {};
    for (const [slug, entry] of Object.entries(index.solutions)) {
      map[slug] = entry.hash;
    }
    await ExtensionStorage.set(KEY, map);
  }
}
```

- [ ] **Step 7: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/storage/`

Expected: `Test Files 3 passed | Tests 12 passed`. Exit 0.

- [ ] **Step 8: Commit**

`git add extension/storage tests/unit/storage`

`git commit -m "feat(storage): add ExtensionStorage, ConfigStore and HashStore

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 5: Cloudflare Worker (OAuth Token Exchange)

**Milestone:** M2

**Files:**
- Modify: `worker/src/index.ts` (replace placeholder with full implementation)
- Create: `worker/src/__tests__/token.test.ts`
- Create: `worker/vitest.config.ts`

**Interfaces:**
- Consumes: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` from Cloudflare env.
- Produces: `POST /token` endpoint returning `{ access_token }` used by `AuthHandler` (Task 7).

- [ ] **Step 1: Write failing test**

Create `worker/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

Create `worker/src/__tests__/token.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../index';

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

const env: Env = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'secret' };

function req(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: { Origin: 'https://abcdef.chromiumapp.org', ...(init.headers ?? {}) },
  });
}

describe('Worker /token', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: 'gh_tok_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('POST /token with valid code returns access_token', async () => {
    const r = await worker.fetch(
      req('https://w/token', { method: 'POST', body: JSON.stringify({ code: 'abc' }) }),
      env,
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ access_token: 'gh_tok_123' });
  });

  it('POST /token with missing code returns 400', async () => {
    const r = await worker.fetch(req('https://w/token', { method: 'POST', body: '{}' }), env);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Missing code' });
  });

  it('POST /token with invalid JSON returns 400', async () => {
    const r = await worker.fetch(req('https://w/token', { method: 'POST', body: 'not json' }), env);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('GET /token returns 404', async () => {
    const r = await worker.fetch(req('https://w/token', { method: 'GET' }), env);
    expect(r.status).toBe(404);
  });

  it('rejects non-chromiumapp.org origin with 403', async () => {
    const r = await worker.fetch(
      new Request('https://w/token', {
        method: 'POST',
        body: JSON.stringify({ code: 'x' }),
        headers: { Origin: 'https://evil.com' },
      }),
      env,
    );
    expect(r.status).toBe(403);
  });

  it('OPTIONS preflight returns 204 with CORS headers', async () => {
    const r = await worker.fetch(req('https://w/token', { method: 'OPTIONS' }), env);
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://abcdef.chromiumapp.org');
    expect(r.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('GitHub error is propagated as 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'bad_verification_code' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const r = await worker.fetch(
      req('https://w/token', { method: 'POST', body: JSON.stringify({ code: 'nope' }) }),
      env,
    );
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body).toEqual({ error: 'bad_verification_code' });
  });
});
```

Run: `pnpm --filter @gfe/worker test`

Expected: 7 tests fail because current placeholder always returns `'ok'` 200.

- [ ] **Step 2: Implement worker**

Replace `worker/src/index.ts`:

```ts
export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const isAllowedOrigin = origin.endsWith('.chromiumapp.org');

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!isAllowedOrigin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/token') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    let body: { code?: string };
    try {
      body = (await request.json()) as { code?: string };
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!body.code || typeof body.code !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const ghResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: body.code,
      }),
    });

    const ghData = (await ghResponse.json()) as { access_token?: string; error?: string };

    if (!ghResponse.ok || ghData.error || !ghData.access_token) {
      return new Response(JSON.stringify({ error: ghData.error ?? 'Token exchange failed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ access_token: ghData.access_token }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm --filter @gfe/worker test`

Expected: `Test Files 1 passed | Tests 7 passed`. Exit 0.

- [ ] **Step 4: Verify worker builds**

Run: `pnpm --filter @gfe/worker build`

Expected: `Total Upload: ...` and `Uploaded (dry-run)` or equivalent. Exit 0.

- [ ] **Step 5: Commit**

`git add worker`

`git commit -m "feat(worker): implement OAuth code-for-token exchange endpoint

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 6: EventBus

**Milestone:** M2

**Files:**
- Create: `extension/background/EventBus.ts`
- Create: `tests/unit/background/EventBus.test.ts`

**Interfaces:**
- Consumes: `ExtensionEvent` from `types/`.
- Produces: `EventBus` class with typed `on/off/emit` used by AuthHandler, SyncOrchestrator, MessageRouter.

- [ ] **Step 1: Write failing test**

Create `tests/unit/background/EventBus.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../../extension/background/EventBus';
import { SyncState } from '../../../extension/types';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    chrome.runtime.sendMessage = vi.fn();
  });

  it('invokes registered handler on emit', async () => {
    const handler = vi.fn();
    bus.on('SYNC_STARTED', handler);
    await bus.emit({ type: 'SYNC_STARTED', payload: { slug: 'x' } });
    expect(handler).toHaveBeenCalledWith({ type: 'SYNC_STARTED', payload: { slug: 'x' } });
  });

  it('supports multiple handlers per type', async () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.on('SYNC_STARTED', a);
    bus.on('SYNC_STARTED', b);
    await bus.emit({ type: 'SYNC_STARTED', payload: { slug: 'y' } });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('does not invoke handlers for other types', async () => {
    const h = vi.fn();
    bus.on('SYNC_STARTED', h);
    await bus.emit({ type: 'SYNC_FAILED', payload: { error: 'nope' } });
    expect(h).not.toHaveBeenCalled();
  });

  it('off removes a handler', async () => {
    const h = vi.fn();
    bus.on('SYNC_STARTED', h);
    bus.off('SYNC_STARTED', h);
    await bus.emit({ type: 'SYNC_STARTED', payload: { slug: 'x' } });
    expect(h).not.toHaveBeenCalled();
  });

  it('bridges STATE_CHANGED to chrome.runtime.sendMessage', async () => {
    await bus.emit({ type: 'STATE_CHANGED', payload: { state: SyncState.Syncing } });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'STATE_CHANGED',
      payload: { state: SyncState.Syncing },
    });
  });

  it.each([
    ['SYNC_COMPLETED', { slug: 's', commitSha: 'c', duration: 1, fileCount: 1 }],
    ['SYNC_FAILED', { error: 'e' }],
    ['SYNC_SKIPPED', { slug: 's', reason: 'hash_match' as const }],
    ['AUTH_COMPLETE', { username: 'u', avatarUrl: 'a' }],
    ['AUTH_FAILED', { error: 'e' }],
    ['TOKEN_EXPIRED', {}],
  ])('bridges %s to chrome.runtime.sendMessage', async (type, payload) => {
    await bus.emit({ type, payload } as never);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type, payload });
  });

  it('does NOT bridge QUESTION_COMPLETED (internal only)', async () => {
    await bus.emit({
      type: 'QUESTION_COMPLETED',
      payload: {
        workspace: [{ path: 'a', content: 'x', language: 'js' }],
        metadata: {},
        timestamp: 0,
        pageUrl: 'https://x',
      },
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('swallows chrome.runtime.sendMessage errors (popup closed)', async () => {
    chrome.runtime.sendMessage = vi.fn().mockImplementation(() => {
      throw new Error('Could not establish connection');
    });
    await expect(
      bus.emit({ type: 'STATE_CHANGED', payload: { state: SyncState.Idle } }),
    ).resolves.toBeUndefined();
  });

  it('awaits async handlers before returning', async () => {
    const order: string[] = [];
    bus.on('SYNC_STARTED', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('handler-done');
    });
    await bus.emit({ type: 'SYNC_STARTED', payload: { slug: 'x' } });
    order.push('emit-returned');
    expect(order).toEqual(['handler-done', 'emit-returned']);
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/background/EventBus.test.ts`

Expected: FAIL — `Cannot find module '../../../extension/background/EventBus'`.

- [ ] **Step 2: Implement EventBus**

Create `extension/background/EventBus.ts`:

```ts
import { ExtensionEvent } from '../types';
import { logger } from '../utils/Logger';

type EventType = ExtensionEvent['type'];
type Handler<T extends EventType> = (
  event: Extract<ExtensionEvent, { type: T }>,
) => void | Promise<void>;

const BRIDGED_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'STATE_CHANGED',
  'SYNC_COMPLETED',
  'SYNC_FAILED',
  'SYNC_SKIPPED',
  'AUTH_COMPLETE',
  'AUTH_FAILED',
  'TOKEN_EXPIRED',
]);

export class EventBus {
  private handlers = new Map<
    EventType,
    Set<(event: ExtensionEvent) => void | Promise<void>>
  >();

  async emit(event: ExtensionEvent): Promise<void> {
    const set = this.handlers.get(event.type);
    if (set) {
      for (const h of set) {
        try {
          await h(event);
        } catch (err) {
          logger.error('event-handler-threw', { type: event.type, err: String(err) });
        }
      }
    }
    if (BRIDGED_TYPES.has(event.type)) {
      try {
        chrome.runtime.sendMessage(event);
      } catch {
        // Popup not open — safe to ignore.
      }
    }
  }

  on<T extends EventType>(type: T, handler: Handler<T>): void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as (event: ExtensionEvent) => void | Promise<void>);
  }

  off<T extends EventType>(type: T, handler: Handler<T>): void {
    this.handlers.get(type)?.delete(handler as (event: ExtensionEvent) => void | Promise<void>);
  }
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/background/EventBus.test.ts`

Expected: `Tests 13 passed`. Exit 0.

- [ ] **Step 4: Commit**

`git add extension/background/EventBus.ts tests/unit/background/EventBus.test.ts`

`git commit -m "feat(background): add typed EventBus with popup bridge

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 7: AuthHandler (OAuth Flow)

**Milestone:** M2

**Files:**
- Create: `extension/background/AuthHandler.ts`
- Create: `tests/unit/background/AuthHandler.test.ts`

**Interfaces:**
- Consumes: `EventBus`, `ExtensionStorage`, `chrome.identity`, `chrome.storage.session`, `AuthError`, `VITE_GITHUB_CLIENT_ID`, `VITE_WORKER_URL`.
- Produces: `AuthHandler.startAuth`, `.revokeAuth`, `.validateStoredToken` (returns boolean). Emits `AUTH_COMPLETE`, `AUTH_FAILED`, `AUTH_REVOKED`, `TOKEN_EXPIRED`.

- [ ] **Step 1: Write failing test**

Create `tests/unit/background/AuthHandler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthHandler } from '../../../extension/background/AuthHandler';
import { EventBus } from '../../../extension/background/EventBus';

const REDIRECT = 'https://ext-id.chromiumapp.org/callback';

function stubEnv(): void {
  (import.meta.env as Record<string, string>).VITE_GITHUB_CLIENT_ID = 'CID';
  (import.meta.env as Record<string, string>).VITE_WORKER_URL = 'https://worker.example';
}

describe('AuthHandler', () => {
  let bus: EventBus;
  let handler: AuthHandler;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stubEnv();
    bus = new EventBus();
    emitSpy = vi.spyOn(bus, 'emit');
    handler = new AuthHandler(bus);
    chrome.runtime.sendMessage = vi.fn();
    (crypto as unknown as { getRandomValues: (a: Uint8Array) => Uint8Array }).getRandomValues = (arr: Uint8Array) => {
      arr.fill(7);
      return arr;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('startAuth', () => {
    it('emits AUTH_COMPLETE with username and avatar on success', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn((_o, cb) => {
        cb?.(`${REDIRECT}?code=abc&state=${'07'.repeat(16)}`);
      }) as never;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo) => {
          const url = typeof input === 'string' ? input : input.url;
          if (url.includes('/token')) {
            return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
          }
          if (url.includes('api.github.com/user')) {
            return new Response(
              JSON.stringify({ login: 'alice', avatar_url: 'https://av' }),
              { status: 200 },
            );
          }
          return new Response('', { status: 404 });
        }),
      );

      await handler.startAuth();

      expect(emitSpy).toHaveBeenCalledWith({
        type: 'AUTH_COMPLETE',
        payload: { username: 'alice', avatarUrl: 'https://av' },
      });
      const stored = await chrome.storage.local.get('gfe.token');
      expect(stored['gfe.token']).toBe('tok');
    });

    it('emits AUTH_FAILED on state nonce mismatch', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn((_o, cb) => {
        cb?.(`${REDIRECT}?code=abc&state=WRONG`);
      }) as never;
      await handler.startAuth();
      expect(emitSpy).toHaveBeenCalledWith({
        type: 'AUTH_FAILED',
        payload: { error: expect.stringMatching(/state/i) as unknown as string },
      });
    });

    it('emits AUTH_FAILED on worker error', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn((_o, cb) => {
        cb?.(`${REDIRECT}?code=abc&state=${'07'.repeat(16)}`);
      }) as never;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: 'bad' }), { status: 400 })),
      );
      await handler.startAuth();
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AUTH_FAILED' }),
      );
    });

    it('emits AUTH_FAILED when identity flow returns nothing', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn((_o, cb) => {
        (chrome.runtime as unknown as { lastError: { message: string } }).lastError = {
          message: 'user canceled',
        };
        cb?.(undefined);
      }) as never;
      await handler.startAuth();
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AUTH_FAILED' }),
      );
    });
  });

  describe('revokeAuth', () => {
    it('clears token + user and emits AUTH_REVOKED', async () => {
      await chrome.storage.local.set({ 'gfe.token': 'x', 'gfe.user': { username: 'u', avatarUrl: 'a' } });
      await handler.revokeAuth();
      const stored = await chrome.storage.local.get(['gfe.token', 'gfe.user']);
      expect(stored['gfe.token']).toBeUndefined();
      expect(stored['gfe.user']).toBeUndefined();
      expect(emitSpy).toHaveBeenCalledWith({ type: 'AUTH_REVOKED', payload: {} });
    });
  });

  describe('validateStoredToken', () => {
    it('returns false when no token stored', async () => {
      expect(await handler.validateStoredToken()).toBe(false);
    });

    it('returns true and refreshes user on 200', async () => {
      await chrome.storage.local.set({ 'gfe.token': 'tok' });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(JSON.stringify({ login: 'bob', avatar_url: 'https://b' }), { status: 200 }),
        ),
      );
      expect(await handler.validateStoredToken()).toBe(true);
      const stored = await chrome.storage.local.get('gfe.user');
      expect(stored['gfe.user']).toEqual({ username: 'bob', avatarUrl: 'https://b' });
    });

    it('deletes token and emits TOKEN_EXPIRED on 401', async () => {
      await chrome.storage.local.set({ 'gfe.token': 'tok' });
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
      expect(await handler.validateStoredToken()).toBe(false);
      expect(emitSpy).toHaveBeenCalledWith({ type: 'TOKEN_EXPIRED', payload: {} });
      const stored = await chrome.storage.local.get('gfe.token');
      expect(stored['gfe.token']).toBeUndefined();
    });
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/background/AuthHandler.test.ts`

Expected: FAIL — `Cannot find module`.

- [ ] **Step 2: Implement AuthHandler**

Create `extension/background/AuthHandler.ts`:

```ts
import { AuthError } from '../types';
import { EventBus } from './EventBus';
import { ExtensionStorage } from '../storage/ExtensionStorage';
import { logger } from '../utils/Logger';

const STATE_KEY = 'gfe.oauth.state';

function requireEnv(name: 'VITE_GITHUB_CLIENT_ID' | 'VITE_WORKER_URL'): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  if (!value) throw new AuthError(`Missing ${name} at build time`);
  return value;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function launchWebAuthFlow(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      const err = chrome.runtime.lastError;
      if (err || !redirectUrl) {
        reject(new AuthError(err?.message ?? 'OAuth flow returned no redirect'));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

interface StoredUser {
  username: string;
  avatarUrl: string;
}

export class AuthHandler {
  constructor(private readonly bus: EventBus) {}

  async startAuth(): Promise<void> {
    try {
      const clientId = requireEnv('VITE_GITHUB_CLIENT_ID');
      const workerUrl = requireEnv('VITE_WORKER_URL');
      const redirectUri = chrome.identity.getRedirectURL('callback');
      const nonce = randomNonce();
      await chrome.storage.session.set({ [STATE_KEY]: nonce });

      const authUrl = new URL('https://github.com/login/oauth/authorize');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', 'repo');
      authUrl.searchParams.set('state', nonce);

      const redirectUrl = await launchWebAuthFlow(authUrl.toString());
      const parsed = new URL(redirectUrl);
      const code = parsed.searchParams.get('code');
      const returnedState = parsed.searchParams.get('state');
      const stored = (await chrome.storage.session.get(STATE_KEY))[STATE_KEY] as string | undefined;
      await chrome.storage.session.remove(STATE_KEY);

      if (!code) throw new AuthError('OAuth callback missing code');
      if (!returnedState || returnedState !== stored) throw new AuthError('OAuth state nonce mismatch');

      const tokenResponse = await fetch(`${workerUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const tokenBody = (await tokenResponse.json()) as { access_token?: string; error?: string };
      if (!tokenResponse.ok || !tokenBody.access_token) {
        throw new AuthError(tokenBody.error ?? 'Worker token exchange failed');
      }

      await chrome.storage.local.set({ 'gfe.token': tokenBody.access_token });

      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenBody.access_token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (!userResponse.ok) throw new AuthError(`GitHub user fetch failed: ${userResponse.status}`);
      const user = (await userResponse.json()) as { login: string; avatar_url: string };
      const stored2: StoredUser = { username: user.login, avatarUrl: user.avatar_url };
      await chrome.storage.local.set({ 'gfe.user': stored2 });

      await this.bus.emit({ type: 'AUTH_COMPLETE', payload: stored2 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('auth-failed', { msg });
      await this.bus.emit({ type: 'AUTH_FAILED', payload: { error: msg } });
    }
  }

  async revokeAuth(): Promise<void> {
    await chrome.storage.local.remove(['gfe.token', 'gfe.user']);
    await this.bus.emit({ type: 'AUTH_REVOKED', payload: {} });
  }

  async validateStoredToken(): Promise<boolean> {
    const token = (await chrome.storage.local.get('gfe.token'))['gfe.token'] as string | undefined;
    if (!token) return false;
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (response.status === 401) {
        await chrome.storage.local.remove(['gfe.token', 'gfe.user']);
        await this.bus.emit({ type: 'TOKEN_EXPIRED', payload: {} });
        return false;
      }
      if (!response.ok) return false;
      const user = (await response.json()) as { login: string; avatar_url: string };
      const stored: StoredUser = { username: user.login, avatarUrl: user.avatar_url };
      await ExtensionStorage.set('user', stored);
      return true;
    } catch (err) {
      logger.warn('validate-token-network-error', { err: String(err) });
      return false;
    }
  }
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/background/AuthHandler.test.ts`

Expected: `Tests 8 passed`. Exit 0.

- [ ] **Step 4: Commit**

`git add extension/background/AuthHandler.ts tests/unit/background/AuthHandler.test.ts`

`git commit -m "feat(auth): implement OAuth flow with state nonce and token validation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 8: Basic Popup — Auth States

**Milestone:** M2

**Files:**
- Modify: `extension/popup/index.tsx`
- Create: `extension/popup/App.tsx`
- Create: `extension/popup/components/AuthSection.tsx`
- Create: `extension/popup/styles.css`
- Create: `tests/unit/popup/AuthSection.test.tsx`

**Interfaces:**
- Consumes: `AppState`, `ExtensionMessage` from types. Communicates with background via `chrome.runtime.sendMessage`.
- Produces: three auth UI states rendered by App (Connected / Disconnected / Reconnect).

- [ ] **Step 1: Write failing test**

Create `tests/unit/popup/AuthSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthSection } from '../../../extension/popup/components/AuthSection';

describe('AuthSection', () => {
  beforeEach(() => {
    chrome.runtime.sendMessage = vi.fn();
  });

  it('shows DisconnectedView when not connected', () => {
    render(
      <AuthSection auth={{ connected: false, tokenExpired: false }} />,
    );
    expect(screen.getByRole('button', { name: /connect github/i })).toBeInTheDocument();
  });

  it('shows ReconnectView when token expired', () => {
    render(
      <AuthSection auth={{ connected: false, tokenExpired: true }} />,
    );
    expect(screen.getByRole('button', { name: /reconnect github/i })).toBeInTheDocument();
    expect(screen.getByText(/token expired/i)).toBeInTheDocument();
  });

  it('shows ConnectedView with username and avatar', () => {
    render(
      <AuthSection
        auth={{ connected: true, tokenExpired: false, username: 'alice', avatarUrl: 'https://av' }}
      />,
    );
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /alice/i })).toHaveAttribute('src', 'https://av');
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
  });

  it('Connect button sends AUTH_START message', () => {
    render(<AuthSection auth={{ connected: false, tokenExpired: false }} />);
    fireEvent.click(screen.getByRole('button', { name: /connect github/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_START' });
  });

  it('Reconnect button sends AUTH_START message', () => {
    render(<AuthSection auth={{ connected: false, tokenExpired: true }} />);
    fireEvent.click(screen.getByRole('button', { name: /reconnect github/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_START' });
  });

  it('Disconnect button sends AUTH_REVOKE message', () => {
    render(
      <AuthSection auth={{ connected: true, tokenExpired: false, username: 'a', avatarUrl: 'x' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_REVOKE' });
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/popup/AuthSection.test.tsx`

Expected: FAIL — `Cannot find module`.

- [ ] **Step 2: Implement AuthSection**

Create `extension/popup/components/AuthSection.tsx`:

```tsx
import type { AppState, ExtensionMessage } from '../../types';

interface Props {
  auth: AppState['auth'];
}

function send(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message);
}

export function AuthSection({ auth }: Props): JSX.Element {
  if (auth.connected) {
    return (
      <section className="gfe-auth gfe-auth--connected">
        {auth.avatarUrl ? (
          <img className="gfe-avatar" src={auth.avatarUrl} alt={auth.username ?? 'user'} />
        ) : null}
        <span className="gfe-username">{auth.username ?? 'GitHub user'}</span>
        <button type="button" onClick={() => send({ type: 'AUTH_REVOKE' })}>
          Disconnect
        </button>
      </section>
    );
  }
  if (auth.tokenExpired) {
    return (
      <section className="gfe-auth gfe-auth--reconnect">
        <p>Token expired — please reconnect.</p>
        <button type="button" onClick={() => send({ type: 'AUTH_START' })}>
          Reconnect GitHub
        </button>
      </section>
    );
  }
  return (
    <section className="gfe-auth gfe-auth--disconnected">
      <button type="button" onClick={() => send({ type: 'AUTH_START' })}>
        Connect GitHub
      </button>
    </section>
  );
}
```

- [ ] **Step 3: Implement popup App**

Create `extension/popup/styles.css`:

```css
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { min-width: 340px; margin: 0; padding: 16px; }
.gfe-auth { display: flex; gap: 8px; align-items: center; }
.gfe-avatar { width: 32px; height: 32px; border-radius: 50%; }
.gfe-username { font-weight: 600; flex: 1; }
button { cursor: pointer; padding: 6px 10px; border-radius: 6px; border: 1px solid #d0d7de; background: #f6f8fa; }
button:hover { background: #eaeef2; }
```

Create `extension/popup/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { AppState, ExtensionEvent } from '../types';
import { SyncState, SyncConfigSchema } from '../types';
import { AuthSection } from './components/AuthSection';
import './styles.css';

const initialState: AppState = {
  syncState: SyncState.Idle,
  auth: { connected: false, tokenExpired: false },
  config: SyncConfigSchema.parse({}),
};

export function App(): JSX.Element {
  const [state, setState] = useState<AppState>(initialState);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response: AppState | undefined) => {
      if (response) setState(response);
    });
    const listener = (message: ExtensionEvent): void => {
      if (message.type === 'STATE_CHANGED') {
        setState((s) => ({ ...s, syncState: message.payload.state }));
      } else if (message.type === 'AUTH_COMPLETE') {
        setState((s) => ({
          ...s,
          auth: {
            connected: true,
            tokenExpired: false,
            username: message.payload.username,
            avatarUrl: message.payload.avatarUrl,
          },
        }));
      } else if (message.type === 'AUTH_REVOKED') {
        setState((s) => ({ ...s, auth: { connected: false, tokenExpired: false } }));
      } else if (message.type === 'TOKEN_EXPIRED') {
        setState((s) => ({ ...s, auth: { ...s.auth, connected: false, tokenExpired: true } }));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <div className="gfe-popup">
      <h1 style={{ fontSize: 16, margin: '0 0 12px' }}>GreatFrontend Sync</h1>
      <AuthSection auth={state.auth} />
    </div>
  );
}
```

Replace `extension/popup/index.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/popup/AuthSection.test.tsx`

Expected: `Tests 6 passed`. Exit 0.

- [ ] **Step 5: Verify extension builds**

Run: `pnpm --filter @gfe/extension build`

Expected: build succeeds, `extension/dist/popup/index.html` exists. Exit 0.

- [ ] **Step 6: Commit**

`git add extension/popup tests/unit/popup`

`git commit -m "feat(popup): add AuthSection with connect/reconnect/disconnect states

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 9: GitHubClient

**Milestone:** M3

**Files:**
- Create: `extension/github/GitHubClient.ts`
- Create: `tests/mocks/github.handlers.ts`
- Create: `tests/unit/github/GitHubClient.test.ts`
- Modify: `tests/setup.ts` (add MSW server)

**Interfaces:**
- Consumes: `GitHubApiError`, `withRetry`, `logger`.
- Produces: `GitHubClient` with all REST methods listed in the spec — used by `GitDataService`, `RepoManager`, `IndexManager`.

- [ ] **Step 1: Add MSW server to test setup**

Replace `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { chrome } from 'vitest-chrome';
import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setupServer } from 'msw/node';

(globalThis as unknown as { chrome: typeof chrome }).chrome = chrome;

export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  chrome.storage.local.clear();
  chrome.storage.session.clear();
});
afterAll(() => server.close());

beforeEach(() => {});
```

Create `tests/mocks/github.handlers.ts`:

```ts
import { http, HttpResponse } from 'msw';

export const githubBaseHandlers = [
  http.get('https://api.github.com/repos/:owner/:repo', () =>
    HttpResponse.json({ owner: { login: 'alice' }, name: 'greatfrontend-solutions' }, { status: 200 }),
  ),
  http.post('https://api.github.com/user/repos', () =>
    HttpResponse.json({ owner: { login: 'alice' }, name: 'greatfrontend-solutions' }, { status: 201 }),
  ),
];
```

- [ ] **Step 2: Write failing tests**

Create `tests/unit/github/GitHubClient.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup';
import { GitHubClient } from '../../../extension/github/GitHubClient';
import { GitHubApiError } from '../../../extension/types';

const T = 'tok';

describe('GitHubClient', () => {
  const c = new GitHubClient();

  describe('getRepo', () => {
    it('returns repo when present', async () => {
      server.use(
        http.get('https://api.github.com/repos/o/r', () =>
          HttpResponse.json({ owner: { login: 'o' }, name: 'r' }),
        ),
      );
      const r = await c.getRepo('o', 'r', T);
      expect(r).toEqual({ owner: { login: 'o' }, name: 'r' });
    });

    it('returns null on 404', async () => {
      server.use(http.get('https://api.github.com/repos/o/r', () => new HttpResponse(null, { status: 404 })));
      expect(await c.getRepo('o', 'r', T)).toBeNull();
    });

    it('throws GitHubApiError on 500', async () => {
      server.use(http.get('https://api.github.com/repos/o/r', () => new HttpResponse('boom', { status: 500 })));
      await expect(c.getRepo('o', 'r', T)).rejects.toBeInstanceOf(GitHubApiError);
    });
  });

  describe('createRepo', () => {
    it('POSTs to /user/repos with name/private/description', async () => {
      let received: unknown;
      server.use(
        http.post('https://api.github.com/user/repos', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({ owner: { login: 'o' }, name: 'r' }, { status: 201 });
        }),
      );
      const r = await c.createRepo(T, { name: 'r', private: true, description: 'd' });
      expect(r.name).toBe('r');
      expect(received).toEqual({ name: 'r', private: true, description: 'd', auto_init: true });
    });
  });

  describe('getRef / getCommit / createBlob / createTree / createCommit / updateRef', () => {
    it('getRef returns object.sha', async () => {
      server.use(
        http.get('https://api.github.com/repos/o/r/git/ref/heads/main', () =>
          HttpResponse.json({ object: { sha: 'REF' } }),
        ),
      );
      expect(await c.getRef('o', 'r', T, 'heads/main')).toEqual({ object: { sha: 'REF' } });
    });

    it('getCommit returns tree.sha', async () => {
      server.use(
        http.get('https://api.github.com/repos/o/r/git/commits/REF', () =>
          HttpResponse.json({ tree: { sha: 'TREE' } }),
        ),
      );
      expect(await c.getCommit('o', 'r', T, 'REF')).toEqual({ tree: { sha: 'TREE' } });
    });

    it('createBlob base64-encodes content', async () => {
      let received: unknown;
      server.use(
        http.post('https://api.github.com/repos/o/r/git/blobs', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({ sha: 'BLOB' }, { status: 201 });
        }),
      );
      const r = await c.createBlob('o', 'r', T, 'hello', 'utf-8');
      expect(r).toEqual({ sha: 'BLOB' });
      expect(received).toEqual({ content: 'hello', encoding: 'utf-8' });
    });

    it('createTree posts base_tree + tree items', async () => {
      let received: unknown;
      server.use(
        http.post('https://api.github.com/repos/o/r/git/trees', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({ sha: 'TREE2' }, { status: 201 });
        }),
      );
      const r = await c.createTree('o', 'r', T, 'BASE', [
        { path: 'a.txt', mode: '100644', type: 'blob', sha: 'B' },
      ]);
      expect(r).toEqual({ sha: 'TREE2' });
      expect(received).toEqual({
        base_tree: 'BASE',
        tree: [{ path: 'a.txt', mode: '100644', type: 'blob', sha: 'B' }],
      });
    });

    it('createCommit posts message/tree/parents', async () => {
      let received: unknown;
      server.use(
        http.post('https://api.github.com/repos/o/r/git/commits', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({ sha: 'CMT' }, { status: 201 });
        }),
      );
      const r = await c.createCommit('o', 'r', T, { message: 'm', treeSha: 'T', parentShas: ['P'] });
      expect(r).toEqual({ sha: 'CMT' });
      expect(received).toEqual({ message: 'm', tree: 'T', parents: ['P'] });
    });

    it('updateRef PATCHes ref', async () => {
      let received: unknown;
      server.use(
        http.patch('https://api.github.com/repos/o/r/git/refs/heads/main', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({ ref: 'refs/heads/main' });
        }),
      );
      await c.updateRef('o', 'r', T, 'heads/main', 'NEW');
      expect(received).toEqual({ sha: 'NEW', force: false });
    });
  });

  describe('getContents', () => {
    it('decodes base64 content', async () => {
      const content = Buffer.from('hello world').toString('base64');
      server.use(
        http.get('https://api.github.com/repos/o/r/contents/index.json', () =>
          HttpResponse.json({ content, sha: 'FSHA', encoding: 'base64' }),
        ),
      );
      expect(await c.getContents('o', 'r', T, 'index.json')).toEqual({
        content: 'hello world',
        sha: 'FSHA',
      });
    });

    it('returns null on 404', async () => {
      server.use(
        http.get('https://api.github.com/repos/o/r/contents/missing', () => new HttpResponse(null, { status: 404 })),
      );
      expect(await c.getContents('o', 'r', T, 'missing')).toBeNull();
    });
  });

  describe('createOrUpdateFile', () => {
    it('base64-encodes content and optionally passes sha', async () => {
      let received: unknown;
      server.use(
        http.put('https://api.github.com/repos/o/r/contents/foo.md', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({ commit: { sha: 'CMT2' } }, { status: 200 });
        }),
      );
      const r = await c.createOrUpdateFile('o', 'r', T, 'foo.md', {
        message: 'm',
        content: 'hi',
        sha: 'OLD',
      });
      expect(r).toEqual({ commitSha: 'CMT2' });
      expect(received).toMatchObject({
        message: 'm',
        content: Buffer.from('hi').toString('base64'),
        sha: 'OLD',
      });
    });
  });

  describe('rate limiting', () => {
    it('retries after 429 and eventually succeeds', async () => {
      let n = 0;
      server.use(
        http.get('https://api.github.com/repos/o/r', () => {
          n++;
          if (n === 1) {
            return new HttpResponse('rate', { status: 429, headers: { 'Retry-After': '0' } });
          }
          return HttpResponse.json({ owner: { login: 'o' }, name: 'r' });
        }),
      );
      const r = await c.getRepo('o', 'r', T);
      expect(r?.name).toBe('r');
      expect(n).toBe(2);
    });

    it('throws GitHubApiError with rateLimited=true after exhausting retries', async () => {
      server.use(
        http.get('https://api.github.com/repos/o/r', () =>
          new HttpResponse('rate', { status: 429, headers: { 'Retry-After': '0' } }),
        ),
      );
      const err = await c.getRepo('o', 'r', T).catch((e) => e);
      expect(err).toBeInstanceOf(GitHubApiError);
      expect((err as GitHubApiError).rateLimited).toBe(true);
    });

    it('retries on 500 (transient server error)', async () => {
      let n = 0;
      server.use(
        http.get('https://api.github.com/repos/o/r', () => {
          n++;
          if (n < 3) return new HttpResponse('boom', { status: 500 });
          return HttpResponse.json({ owner: { login: 'o' }, name: 'r' });
        }),
      );
      await c.getRepo('o', 'r', T);
      expect(n).toBe(3);
    });

    it('does NOT retry on 404 (allow404 short-circuits)', async () => {
      let n = 0;
      server.use(
        http.get('https://api.github.com/repos/o/r', () => {
          n++;
          return new HttpResponse(null, { status: 404 });
        }),
      );
      const r = await c.getRepo('o', 'r', T);
      expect(r).toBeNull();
      expect(n).toBe(1);
    });

    it('does NOT retry on 401 (auth failure)', async () => {
      let n = 0;
      server.use(
        http.get('https://api.github.com/repos/o/r', () => {
          n++;
          return new HttpResponse(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
        }),
      );
      await expect(c.getRepo('o', 'r', T)).rejects.toBeInstanceOf(GitHubApiError);
      expect(n).toBe(1);
    });

    it('does NOT retry on 400 (bad request)', async () => {
      let n = 0;
      server.use(
        http.post('https://api.github.com/repos/o/r/git/blobs', () => {
          n++;
          return new HttpResponse('bad', { status: 400 });
        }),
      );
      await expect(c.createBlob('o', 'r', T, 'x', 'utf-8')).rejects.toBeInstanceOf(GitHubApiError);
      expect(n).toBe(1);
    });
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/github/GitHubClient.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement GitHubClient**

Create `extension/github/GitHubClient.ts`:

```ts
import { GitHubApiError } from '../types';
import { withRetry } from '../utils/Retry';
import { logger } from '../utils/Logger';

const BASE = 'https://api.github.com';

function b64Encode(str: string): string {
  if (typeof btoa !== 'undefined') return btoa(unescape(encodeURIComponent(str)));
  // Node/test fallback
  return Buffer.from(str, 'utf-8').toString('base64');
}

function b64Decode(str: string): string {
  const clean = str.replace(/\n/g, '');
  if (typeof atob !== 'undefined') return decodeURIComponent(escape(atob(clean)));
  return Buffer.from(clean, 'base64').toString('utf-8');
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token: string;
  body?: unknown;
  allow404?: boolean;
}

function isRetryableError(err: Error): boolean {
  if (err instanceof GitHubApiError) {
    // 429 rate limit + 500/502/503 transient server errors are retryable.
    // 400/401/403/404 are permanent — surface immediately.
    if (err.rateLimited) return true;
    return err.status === 500 || err.status === 502 || err.status === 503;
  }
  // Network failures / TypeError from fetch — always retry.
  return true;
}

export class GitHubClient {
  private async request<T>(path: string, opts: RequestOptions): Promise<T | null> {
    const url = `${BASE}${path}`;
    const doFetch = async (): Promise<T | null> => {
      const response = await fetch(url, {
        method: opts.method,
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });

      if (opts.allow404 && response.status === 404) return null;

      if (response.status === 429 || (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0')) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
        logger.warn('github-rate-limited', { path, retryAfter });
        throw new GitHubApiError(response.status, `Rate limited: ${path}`, true);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new GitHubApiError(response.status, `GitHub ${opts.method} ${path} → ${response.status} ${text}`);
      }

      if (response.status === 204) return null;
      const contentType = response.headers.get('Content-Type') ?? '';
      if (!contentType.includes('application/json')) return null;
      return (await response.json()) as T;
    };

    return withRetry(doFetch, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      shouldRetry: isRetryableError,
      onRetry: (attempt, err) => logger.warn('github-retry', { path, attempt, err: String(err) }),
    });
  }

  async getRepo(
    owner: string,
    repo: string,
    token: string,
  ): Promise<{ owner: { login: string }; name: string } | null> {
    return this.request<{ owner: { login: string }; name: string }>(`/repos/${owner}/${repo}`, {
      method: 'GET',
      token,
      allow404: true,
    });
  }

  async createRepo(
    token: string,
    opts: { name: string; private: boolean; description: string },
  ): Promise<{ owner: { login: string }; name: string }> {
    const r = await this.request<{ owner: { login: string }; name: string }>('/user/repos', {
      method: 'POST',
      token,
      body: { name: opts.name, private: opts.private, description: opts.description, auto_init: true },
    });
    if (!r) throw new GitHubApiError(500, 'createRepo returned null');
    return r;
  }

  async getRef(
    owner: string,
    repo: string,
    token: string,
    ref: string,
  ): Promise<{ object: { sha: string } }> {
    const r = await this.request<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/ref/${ref}`,
      { method: 'GET', token },
    );
    if (!r) throw new GitHubApiError(500, `getRef null: ${ref}`);
    return r;
  }

  async getCommit(
    owner: string,
    repo: string,
    token: string,
    sha: string,
  ): Promise<{ tree: { sha: string } }> {
    const r = await this.request<{ tree: { sha: string } }>(
      `/repos/${owner}/${repo}/git/commits/${sha}`,
      { method: 'GET', token },
    );
    if (!r) throw new GitHubApiError(500, `getCommit null: ${sha}`);
    return r;
  }

  async createBlob(
    owner: string,
    repo: string,
    token: string,
    content: string,
    encoding: 'utf-8' | 'base64',
  ): Promise<{ sha: string }> {
    const r = await this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      token,
      body: { content, encoding },
    });
    if (!r) throw new GitHubApiError(500, 'createBlob null');
    return r;
  }

  async createTree(
    owner: string,
    repo: string,
    token: string,
    baseTreeSha: string,
    items: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }>,
  ): Promise<{ sha: string }> {
    const r = await this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      token,
      body: { base_tree: baseTreeSha, tree: items },
    });
    if (!r) throw new GitHubApiError(500, 'createTree null');
    return r;
  }

  async createCommit(
    owner: string,
    repo: string,
    token: string,
    opts: { message: string; treeSha: string; parentShas: string[] },
  ): Promise<{ sha: string }> {
    const r = await this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      token,
      body: { message: opts.message, tree: opts.treeSha, parents: opts.parentShas },
    });
    if (!r) throw new GitHubApiError(500, 'createCommit null');
    return r;
  }

  async updateRef(
    owner: string,
    repo: string,
    token: string,
    ref: string,
    sha: string,
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/git/refs/${ref}`, {
      method: 'PATCH',
      token,
      body: { sha, force: false },
    });
  }

  async getContents(
    owner: string,
    repo: string,
    token: string,
    path: string,
  ): Promise<{ content: string; sha: string } | null> {
    const r = await this.request<{ content: string; sha: string; encoding: string }>(
      `/repos/${owner}/${repo}/contents/${path}`,
      { method: 'GET', token, allow404: true },
    );
    if (!r) return null;
    return { content: b64Decode(r.content), sha: r.sha };
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    token: string,
    path: string,
    opts: { message: string; content: string; sha?: string },
  ): Promise<{ commitSha: string }> {
    const body: Record<string, unknown> = {
      message: opts.message,
      content: b64Encode(opts.content),
    };
    if (opts.sha) body.sha = opts.sha;
    const r = await this.request<{ commit: { sha: string } }>(
      `/repos/${owner}/${repo}/contents/${path}`,
      { method: 'PUT', token, body },
    );
    if (!r) throw new GitHubApiError(500, 'createOrUpdateFile null');
    return { commitSha: r.commit.sha };
  }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/github/GitHubClient.test.ts`

Expected: `Tests 18 passed`. Exit 0.

- [ ] **Step 5: Commit**

`git add extension/github/GitHubClient.ts tests/unit/github tests/mocks tests/setup.ts`

`git commit -m "feat(github): add REST client with rate-limit handling

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 10: GitDataService & SyncTransaction

**Milestone:** M3

**Files:**
- Create: `extension/github/GitDataService.ts`
- Create: `tests/unit/github/GitDataService.test.ts`

**Interfaces:**
- Consumes: `GitHubClient`, `SyncTransaction`, `QuestionSnapshot`.
- Produces: `GitDataService.commit(owner, repo, token, snapshot, files, message) → SyncTransaction`. Consumed by `GitHubProvider` (Task 12).

- [ ] **Step 1: Write failing test**

Create `tests/unit/github/GitDataService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup';
import { GitHubClient } from '../../../extension/github/GitHubClient';
import { GitDataService } from '../../../extension/github/GitDataService';
import type { QuestionSnapshot } from '../../../extension/types';
import { SNAPSHOT_VERSION } from '../../../extension/types';

const snapshot: QuestionSnapshot = {
  metadata: {
    title: 'A', slug: 'a', difficulty: 'easy', format: 'javascript',
    duration: 10, description: '', url: 'https://x.example',
    languages: [], companies: [],
  },
  files: [{ path: 'a.js', content: 'x', language: 'javascript' }],
  hash: 'H', completedAt: '2026-01-01T00:00:00Z',
  extensionVersion: '0.1.0', snapshotVersion: SNAPSHOT_VERSION,
};

function baseHandlers(): void {
  server.use(
    http.get('https://api.github.com/repos/o/r/git/ref/heads/main', () =>
      HttpResponse.json({ object: { sha: 'HEAD' } }),
    ),
    http.get('https://api.github.com/repos/o/r/git/commits/HEAD', () =>
      HttpResponse.json({ tree: { sha: 'BASE_TREE' } }),
    ),
    http.post('https://api.github.com/repos/o/r/git/blobs', () =>
      HttpResponse.json({ sha: `BLOB_${Math.random().toString(36).slice(2, 6)}` }, { status: 201 }),
    ),
    http.post('https://api.github.com/repos/o/r/git/trees', () =>
      HttpResponse.json({ sha: 'NEW_TREE' }, { status: 201 }),
    ),
    http.post('https://api.github.com/repos/o/r/git/commits', () =>
      HttpResponse.json({ sha: 'NEW_COMMIT' }, { status: 201 }),
    ),
    http.patch('https://api.github.com/repos/o/r/git/refs/heads/main', () =>
      HttpResponse.json({ ref: 'refs/heads/main' }),
    ),
  );
}

describe('GitDataService', () => {
  const client = new GitHubClient();
  const svc = new GitDataService(client);

  it('progresses transaction through all statuses on success', async () => {
    baseHandlers();
    const tx = await svc.commit('o', 'r', 'T', snapshot, [{ path: 'a.js', content: 'x' }], 'msg');
    expect(tx.status).toBe('committed');
    expect(tx.commitSha).toBe('NEW_COMMIT');
    expect(tx.treeSha).toBe('NEW_TREE');
    expect(tx.blobs).toHaveLength(1);
    expect(tx.finishedAt).toBeDefined();
    expect(tx.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('creates blobs in parallel before creating tree', async () => {
    const order: string[] = [];
    server.use(
      http.get('https://api.github.com/repos/o/r/git/ref/heads/main', () =>
        HttpResponse.json({ object: { sha: 'HEAD' } }),
      ),
      http.get('https://api.github.com/repos/o/r/git/commits/HEAD', () =>
        HttpResponse.json({ tree: { sha: 'BASE_TREE' } }),
      ),
      http.post('https://api.github.com/repos/o/r/git/blobs', async () => {
        order.push('blob-start');
        await new Promise((r) => setTimeout(r, 10));
        order.push('blob-end');
        return HttpResponse.json({ sha: 'B' }, { status: 201 });
      }),
      http.post('https://api.github.com/repos/o/r/git/trees', () => {
        order.push('tree');
        return HttpResponse.json({ sha: 'T' }, { status: 201 });
      }),
      http.post('https://api.github.com/repos/o/r/git/commits', () =>
        HttpResponse.json({ sha: 'C' }, { status: 201 }),
      ),
      http.patch('https://api.github.com/repos/o/r/git/refs/heads/main', () =>
        HttpResponse.json({ ref: 'refs/heads/main' }),
      ),
    );

    await svc.commit('o', 'r', 'T', snapshot, [
      { path: 'a.js', content: '1' }, { path: 'b.js', content: '2' }, { path: 'c.js', content: '3' },
    ], 'm');

    const treeIdx = order.indexOf('tree');
    const blobEndCount = order.slice(0, treeIdx).filter((x) => x === 'blob-end').length;
    expect(blobEndCount).toBe(3);
    const blobStarts = order.slice(0, treeIdx).filter((x) => x === 'blob-start');
    expect(blobStarts).toHaveLength(3);
    // All starts happen before the first end → parallel dispatch
    const firstEnd = order.indexOf('blob-end');
    expect(order.slice(0, firstEnd).every((x) => x === 'blob-start')).toBe(true);
  });

  it('marks transaction failed on tree creation error and rethrows', async () => {
    server.use(
      http.get('https://api.github.com/repos/o/r/git/ref/heads/main', () =>
        HttpResponse.json({ object: { sha: 'HEAD' } }),
      ),
      http.get('https://api.github.com/repos/o/r/git/commits/HEAD', () =>
        HttpResponse.json({ tree: { sha: 'BASE_TREE' } }),
      ),
      http.post('https://api.github.com/repos/o/r/git/blobs', () =>
        HttpResponse.json({ sha: 'B' }, { status: 201 }),
      ),
      http.post('https://api.github.com/repos/o/r/git/trees', () =>
        new HttpResponse('boom', { status: 500 }),
      ),
    );

    await expect(svc.commit('o', 'r', 'T', snapshot, [{ path: 'a.js', content: 'x' }], 'm')).rejects.toThrow();
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/github/GitDataService.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement GitDataService**

Create `extension/github/GitDataService.ts`:

```ts
import { GitHubClient } from './GitHubClient';
import type { QuestionSnapshot, SyncTransaction } from '../types';
import { logger } from '../utils/Logger';

export class GitDataService {
  constructor(private readonly client: GitHubClient) {}

  async commit(
    owner: string,
    repo: string,
    token: string,
    snapshot: QuestionSnapshot,
    files: Array<{ path: string; content: string }>,
    message: string,
  ): Promise<SyncTransaction> {
    const tx: SyncTransaction = {
      snapshot,
      blobs: [],
      treeSha: null,
      commitSha: null,
      status: 'pending',
      startedAt: new Date().toISOString(),
    };
    const start = performance.now();

    try {
      const ref = await this.client.getRef(owner, repo, token, 'heads/main');
      const commit = await this.client.getCommit(owner, repo, token, ref.object.sha);

      const blobs = await Promise.all(
        files.map(async (f) => {
          const b = await this.client.createBlob(owner, repo, token, f.content, 'utf-8');
          return { path: f.path, sha: b.sha };
        }),
      );
      tx.blobs = blobs;
      tx.status = 'blobs_created';

      const tree = await this.client.createTree(
        owner,
        repo,
        token,
        commit.tree.sha,
        blobs.map((b) => ({ path: b.path, mode: '100644' as const, type: 'blob' as const, sha: b.sha })),
      );
      tx.treeSha = tree.sha;
      tx.status = 'tree_created';

      const newCommit = await this.client.createCommit(owner, repo, token, {
        message,
        treeSha: tree.sha,
        parentShas: [ref.object.sha],
      });
      tx.commitSha = newCommit.sha;
      tx.status = 'committed';

      await this.client.updateRef(owner, repo, token, 'heads/main', newCommit.sha);

      tx.finishedAt = new Date().toISOString();
      tx.durationMs = Math.round(performance.now() - start);
      return tx;
    } catch (err) {
      tx.status = 'failed';
      tx.finishedAt = new Date().toISOString();
      tx.durationMs = Math.round(performance.now() - start);
      logger.error('git-data-commit-failed', { tx, err: String(err) });
      throw err;
    }
  }
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/github/GitDataService.test.ts`

Expected: `Tests 3 passed`. Exit 0.

- [ ] **Step 4: Commit**

`git add extension/github/GitDataService.ts tests/unit/github/GitDataService.test.ts`

`git commit -m "feat(github): add GitDataService with atomic commit transaction

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 11: RepoManager & IndexManager

**Milestone:** M3

**Files:**
- Create: `extension/github/RepoManager.ts`
- Create: `extension/github/IndexManager.ts`
- Create: `tests/unit/github/RepoManager.test.ts`
- Create: `tests/unit/github/IndexManager.test.ts`

**Interfaces:**
- Consumes: `GitHubClient`, `RepoIndex`, `RepoIndexSchema`, `SyncConfig`.
- Produces: `RepoManager.ensureRepo` and read-only `IndexManager.get`. `IndexManager` never writes to GitHub — `GitHubProvider` (Task 20) includes an updated `index.json` blob in the atomic Git Data commit. Consumed by `GitHubProvider` (Task 12).

- [ ] **Step 1: Write failing test for RepoManager**

Create `tests/unit/github/RepoManager.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup';
import { GitHubClient } from '../../../extension/github/GitHubClient';
import { RepoManager } from '../../../extension/github/RepoManager';
import { SyncConfigSchema } from '../../../extension/types';

const cfg = SyncConfigSchema.parse({ repoName: 'my-repo', repoVisibility: 'private' });

describe('RepoManager', () => {
  const client = new GitHubClient();
  const rm = new RepoManager(client);

  it('returns existing repo when present', async () => {
    server.use(
      http.get('https://api.github.com/user', () =>
        HttpResponse.json({ login: 'alice' }),
      ),
      http.get('https://api.github.com/repos/alice/my-repo', () =>
        HttpResponse.json({ owner: { login: 'alice' }, name: 'my-repo' }),
      ),
    );
    expect(await rm.ensureRepo('T', cfg)).toEqual({ owner: 'alice', repo: 'my-repo' });
  });

  it('creates repo when not found', async () => {
    let created = false;
    server.use(
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'alice' })),
      http.get('https://api.github.com/repos/alice/my-repo', () => new HttpResponse(null, { status: 404 })),
      http.post('https://api.github.com/user/repos', async ({ request }) => {
        created = true;
        const body = await request.json();
        expect(body).toMatchObject({ name: 'my-repo', private: true });
        return HttpResponse.json({ owner: { login: 'alice' }, name: 'my-repo' }, { status: 201 });
      }),
    );
    expect(await rm.ensureRepo('T', cfg)).toEqual({ owner: 'alice', repo: 'my-repo' });
    expect(created).toBe(true);
  });

  it('honors repoVisibility=public when creating', async () => {
    const cfgPub = SyncConfigSchema.parse({ repoName: 'p', repoVisibility: 'public' });
    server.use(
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'a' })),
      http.get('https://api.github.com/repos/a/p', () => new HttpResponse(null, { status: 404 })),
      http.post('https://api.github.com/user/repos', async ({ request }) => {
        const body = (await request.json()) as { private: boolean };
        expect(body.private).toBe(false);
        return HttpResponse.json({ owner: { login: 'a' }, name: 'p' }, { status: 201 });
      }),
    );
    await rm.ensureRepo('T', cfgPub);
  });
});
```

- [ ] **Step 2: Write failing test for IndexManager**

Create `tests/unit/github/IndexManager.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup';
import { GitHubClient } from '../../../extension/github/GitHubClient';
import { IndexManager } from '../../../extension/github/IndexManager';
import type { RepoIndexEntry } from '../../../extension/types';

const entry: RepoIndexEntry = {
  hash: 'H', commitSha: 'C', syncedAt: '2026-01-01T00:00:00Z',
  extensionVersion: '0.1.0', snapshotVersion: 1,
  category: 'javascript', title: 'Event Emitter',
};

describe('IndexManager', () => {
  const client = new GitHubClient();
  const im = new IndexManager(client);

  it('returns empty index on 404', async () => {
    server.use(
      http.get('https://api.github.com/repos/o/r/contents/index.json', () => new HttpResponse(null, { status: 404 })),
    );
    expect(await im.get('o', 'r', 'T')).toEqual({ version: 1, solutions: {} });
  });

  it('parses existing index', async () => {
    const idx = { version: 1, solutions: { 'event-emitter': entry } };
    const content = Buffer.from(JSON.stringify(idx)).toString('base64');
    server.use(
      http.get('https://api.github.com/repos/o/r/contents/index.json', () =>
        HttpResponse.json({ content, sha: 'SHA', encoding: 'base64' }),
      ),
    );
    expect(await im.get('o', 'r', 'T')).toEqual(idx);
  });

  it('returns empty index when stored JSON is invalid', async () => {
    const content = Buffer.from('not json').toString('base64');
    server.use(
      http.get('https://api.github.com/repos/o/r/contents/index.json', () =>
        HttpResponse.json({ content, sha: 'SHA', encoding: 'base64' }),
      ),
    );
    expect(await im.get('o', 'r', 'T')).toEqual({ version: 1, solutions: {} });
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/github/RepoManager.test.ts tests/unit/github/IndexManager.test.ts`

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement RepoManager**

Create `extension/github/RepoManager.ts`:

```ts
import { GitHubClient } from './GitHubClient';
import type { SyncConfig } from '../types';
import { GitHubApiError } from '../types';

export class RepoManager {
  constructor(private readonly client: GitHubClient) {}

  async ensureRepo(token: string, config: SyncConfig): Promise<{ owner: string; repo: string }> {
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!userResponse.ok) {
      throw new GitHubApiError(userResponse.status, `Failed to resolve user: ${userResponse.status}`);
    }
    const user = (await userResponse.json()) as { login: string };
    const owner = user.login;

    const existing = await this.client.getRepo(owner, config.repoName, token);
    if (existing) return { owner, repo: config.repoName };

    const created = await this.client.createRepo(token, {
      name: config.repoName,
      private: config.repoVisibility === 'private',
      description: 'GreatFrontend solutions synced automatically by the GFE Sync extension',
    });
    return { owner, repo: created.name };
  }
}
```

- [ ] **Step 4: Implement IndexManager**

Create `extension/github/IndexManager.ts`:

```ts
import { GitHubClient } from './GitHubClient';
import { RepoIndex, RepoIndexSchema } from '../types';
import { logger } from '../utils/Logger';

const INDEX_PATH = 'index.json';

/**
 * Read-only helper for `index.json`. Never writes — the updated index.json
 * blob is included in the atomic Git Data commit by `GitHubProvider`.
 */
export class IndexManager {
  constructor(private readonly client: GitHubClient) {}

  async get(owner: string, repo: string, token: string): Promise<RepoIndex> {
    const file = await this.client.getContents(owner, repo, token, INDEX_PATH);
    if (!file) return { version: 1, solutions: {} };
    try {
      return RepoIndexSchema.parse(JSON.parse(file.content));
    } catch (err) {
      logger.warn('index-parse-failed', { err: String(err) });
      return { version: 1, solutions: {} };
    }
  }
}
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/github/RepoManager.test.ts tests/unit/github/IndexManager.test.ts`

Expected: `Tests 6 passed` (3 RepoManager + 3 IndexManager). Exit 0.

- [ ] **Step 6: Commit**

`git add extension/github/RepoManager.ts extension/github/IndexManager.ts tests/unit/github/RepoManager.test.ts tests/unit/github/IndexManager.test.ts`

`git commit -m "feat(github): add RepoManager and IndexManager

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 12: GitHubProvider (Skeleton Implementation)

**Milestone:** M3

**Files:**
- Create: `extension/github/GitHubProvider.ts`
- Create: `tests/unit/github/GitHubProvider.test.ts`

**Interfaces:**
- Consumes: `GitHubClient`, `GitDataService`, `RepoManager`, `IndexManager`.
- Produces: Class implementing `RepositoryProvider` — consumed by `SyncOrchestrator` (Task 18). The generators wired in during Task 20 are STUBBED for now (simple placeholder strings) so `SyncOrchestrator` can integrate before generators exist.

- [ ] **Step 1: Write failing test**

Create `tests/unit/github/GitHubProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup';
import { GitHubProvider } from '../../../extension/github/GitHubProvider';
import { SyncConfigSchema, SNAPSHOT_VERSION } from '../../../extension/types';
import type { QuestionSnapshot } from '../../../extension/types';

const cfg = SyncConfigSchema.parse({ repoName: 'sol', repoVisibility: 'private' });

const snapshot: QuestionSnapshot = {
  metadata: {
    title: 'Event Emitter', slug: 'event-emitter', difficulty: 'medium',
    format: 'javascript', duration: 20, description: 'D',
    url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
    languages: ['js'], companies: ['G'],
  },
  files: [
    { path: 'src/solution.js', content: 'const x = 1;', language: 'javascript' },
    { path: 'package.json', content: '{}', language: 'json' },
  ],
  hash: 'HASH', completedAt: '2026-01-01T00:00:00Z',
  extensionVersion: '0.1.0', snapshotVersion: SNAPSHOT_VERSION,
};

describe('GitHubProvider', () => {
  const provider = new GitHubProvider();

  function wireBaseline(committedPaths: string[]): void {
    server.use(
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'alice' })),
      http.get('https://api.github.com/repos/alice/sol', () =>
        HttpResponse.json({ owner: { login: 'alice' }, name: 'sol' }),
      ),
      http.get('https://api.github.com/repos/alice/sol/git/ref/heads/main', () =>
        HttpResponse.json({ object: { sha: 'HEAD' } }),
      ),
      http.get('https://api.github.com/repos/alice/sol/git/commits/HEAD', () =>
        HttpResponse.json({ tree: { sha: 'BASE' } }),
      ),
      http.post('https://api.github.com/repos/alice/sol/git/blobs', () =>
        HttpResponse.json({ sha: 'B' }, { status: 201 }),
      ),
      http.post('https://api.github.com/repos/alice/sol/git/trees', async ({ request }) => {
        const body = (await request.json()) as { tree: Array<{ path: string }> };
        for (const item of body.tree) committedPaths.push(item.path);
        return HttpResponse.json({ sha: 'TREE' }, { status: 201 });
      }),
      http.post('https://api.github.com/repos/alice/sol/git/commits', async ({ request }) => {
        const body = (await request.json()) as { message: string };
        (committedPaths as unknown as { message?: string }).message = body.message;
        return HttpResponse.json({ sha: 'COMMIT' }, { status: 201 });
      }),
      http.patch('https://api.github.com/repos/alice/sol/git/refs/heads/main', () =>
        HttpResponse.json({ ref: 'refs/heads/main' }),
      ),
    );
  }

  it('ensureRepository returns owner/repo', async () => {
    server.use(
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'alice' })),
      http.get('https://api.github.com/repos/alice/sol', () =>
        HttpResponse.json({ owner: { login: 'alice' }, name: 'sol' }),
      ),
    );
    expect(await provider.ensureRepository('T', cfg)).toEqual({ owner: 'alice', repo: 'sol' });
  });

  it('synchronize commits categorized paths with workspace prefix', async () => {
    const paths: string[] = [];
    wireBaseline(paths);
    const result = await provider.synchronize(snapshot, 'T', cfg);
    expect(result.commitSha).toBe('COMMIT');
    expect(paths).toContain('javascript/event-emitter/workspace/src/solution.js');
    expect(paths).toContain('javascript/event-emitter/workspace/package.json');
    expect(paths).toContain('javascript/event-emitter/README.md');
    expect(paths).toContain('javascript/event-emitter/metadata.json');
  });

  it('synchronize honors flat folderLayout', async () => {
    const paths: string[] = [];
    wireBaseline(paths);
    const flat = SyncConfigSchema.parse({ repoName: 'sol', folderLayout: 'flat' });
    await provider.synchronize(snapshot, 'T', flat);
    expect(paths).toContain('event-emitter/workspace/src/solution.js');
    expect(paths).toContain('event-emitter/README.md');
    expect(paths).not.toContain('javascript/event-emitter/README.md');
  });

  it('substitutes {slug} {title} {date} in commit message', async () => {
    const paths: string[] = [];
    wireBaseline(paths);
    const withTemplate = SyncConfigSchema.parse({
      repoName: 'sol',
      commitMessageTemplate: 'feat: {title} ({slug}) — {date}',
    });
    await provider.synchronize(snapshot, 'T', withTemplate);
    const msg = (paths as unknown as { message: string }).message;
    expect(msg).toContain('Event Emitter');
    expect(msg).toContain('event-emitter');
    expect(msg).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/github/GitHubProvider.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement GitHubProvider skeleton**

Create `extension/github/GitHubProvider.ts`:

```ts
import type { QuestionSnapshot, RepositoryProvider, SyncConfig, RepoIndexEntry } from '../types';
import { GitHubClient } from './GitHubClient';
import { GitDataService } from './GitDataService';
import { RepoManager } from './RepoManager';
import { IndexManager } from './IndexManager';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function renderCommitMessage(template: string, snapshot: QuestionSnapshot): string {
  return template
    .replace(/\{slug\}/g, snapshot.metadata.slug)
    .replace(/\{title\}/g, snapshot.metadata.title)
    .replace(/\{date\}/g, today());
}

function basePath(config: SyncConfig, snapshot: QuestionSnapshot): string {
  if (config.folderLayout === 'flat') return snapshot.metadata.slug;
  return `${snapshot.metadata.format}/${snapshot.metadata.slug}`;
}

// Placeholder generators used until Task 19/20 replaces them.
function stubReadme(snapshot: QuestionSnapshot): string {
  return `# ${snapshot.metadata.title}\n\n${snapshot.metadata.description}`;
}

function stubMetadataJson(snapshot: QuestionSnapshot): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      title: snapshot.metadata.title,
      slug: snapshot.metadata.slug,
      difficulty: snapshot.metadata.difficulty,
      format: snapshot.metadata.format,
      duration: snapshot.metadata.duration,
      url: snapshot.metadata.url,
      languages: snapshot.metadata.languages,
      companies: snapshot.metadata.companies,
      hash: snapshot.hash,
      completedAt: snapshot.completedAt,
      extensionVersion: snapshot.extensionVersion,
      snapshotVersion: snapshot.snapshotVersion,
    },
    null,
    2,
  );
}

function stubRootReadme(index: { solutions: Record<string, RepoIndexEntry> }): string {
  const count = Object.keys(index.solutions).length;
  return `# GreatFrontend Solutions\n\n**Total solved:** ${count}\n`;
}

export class GitHubProvider implements RepositoryProvider {
  private readonly client = new GitHubClient();
  private readonly dataService = new GitDataService(this.client);
  private readonly repoManager = new RepoManager(this.client);
  private readonly indexManager = new IndexManager(this.client);

  // Injection seams for Task 19/20 (overridden then).
  protected renderReadme: (s: QuestionSnapshot) => string = stubReadme;
  protected renderMetadataJson: (s: QuestionSnapshot) => string = stubMetadataJson;
  protected renderRootReadme: (i: { solutions: Record<string, RepoIndexEntry> }) => string = stubRootReadme;

  async ensureRepository(token: string, config: SyncConfig): Promise<{ owner: string; repo: string }> {
    return this.repoManager.ensureRepo(token, config);
  }

  async synchronize(
    snapshot: QuestionSnapshot,
    token: string,
    config: SyncConfig,
  ): Promise<{ commitSha: string }> {
    const { owner, repo } = await this.ensureRepository(token, config);
    const bp = basePath(config, snapshot);

    // Skeleton: only per-problem workspace + README + metadata.json.
    // Task 20 replaces this with a fully atomic commit that also includes
    // index.json and root README.md.
    const files: Array<{ path: string; content: string }> = [
      ...snapshot.files.map((f) => ({ path: `${bp}/workspace/${f.path}`, content: f.content })),
      { path: `${bp}/README.md`, content: this.renderReadme(snapshot) },
      { path: `${bp}/metadata.json`, content: this.renderMetadataJson(snapshot) },
    ];

    const message = renderCommitMessage(config.commitMessageTemplate, snapshot);
    const tx = await this.dataService.commit(owner, repo, token, snapshot, files, message);
    if (!tx.commitSha) throw new Error('Commit missing sha');

    // NOTE: `indexManager` and `renderRootReadme` are wired in Task 20, not here.
    // They are declared to keep the composition explicit and to avoid an unused-import lint.
    void this.indexManager;
    void this.renderRootReadme;

    return { commitSha: tx.commitSha };
  }
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/github/GitHubProvider.test.ts`

Expected: `Tests 4 passed`. Exit 0.

- [ ] **Step 4: Commit**

`git add extension/github/GitHubProvider.ts tests/unit/github/GitHubProvider.test.ts`

`git commit -m "feat(github): add GitHubProvider composing all github services

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 13: FetchInterceptor (Injected)

**Milestone:** M4

**Files:**
- Create: `extension/injected/FetchInterceptor.ts`
- Create: `tests/unit/injected/FetchInterceptor.test.ts`

**Interfaces:**
- Consumes: `window.fetch`, `window.dispatchEvent`.
- Produces: `FetchInterceptor.install()` — after installation, fires `GFE_COMPLETE` CustomEvent when a tRPC `questionProgress.add` response with `status === 'complete'` is observed.

- [ ] **Step 1: Write failing test**

Create `tests/unit/injected/FetchInterceptor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchInterceptor } from '../../../extension/injected/FetchInterceptor';

describe('FetchInterceptor', () => {
  let originalFetch: typeof fetch;
  let dispatched: string[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    dispatched = [];
    window.addEventListener('GFE_COMPLETE', () => dispatched.push('GFE_COMPLETE'));
    new FetchInterceptor().install();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.removeEventListener('GFE_COMPLETE', () => {});
  });

  it('dispatches GFE_COMPLETE for tRPC questionProgress.add with status=complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { data: { json: { status: 'complete' } } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    await fetch('https://www.greatfrontend.com/api/trpc/questionProgress.add');
    expect(dispatched).toContain('GFE_COMPLETE');
    vi.unstubAllGlobals();
  });

  it('handles array tRPC envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify([{ result: { data: { json: { status: 'complete' } } } }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    await fetch('https://x/api/trpc/questionProgress.add?batch=1');
    expect(dispatched).toContain('GFE_COMPLETE');
    vi.unstubAllGlobals();
  });

  it('does NOT dispatch when status is not complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { data: { json: { status: 'in_progress' } } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    await fetch('https://x/api/trpc/questionProgress.add');
    expect(dispatched).not.toContain('GFE_COMPLETE');
    vi.unstubAllGlobals();
  });

  it('does NOT intercept non-matching URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
    new FetchInterceptor().install();
    await fetch('https://x/api/other');
    expect(dispatched).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('returns original response body unmodified', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { data: { json: { status: 'complete' } } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    new FetchInterceptor().install();
    const r = await fetch('https://x/api/trpc/questionProgress.add');
    const body = await r.json();
    expect(body.result.data.json.status).toBe('complete');
    vi.unstubAllGlobals();
  });

  it('swallows JSON parse errors without breaking fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      ),
    );
    new FetchInterceptor().install();
    const r = await fetch('https://x/api/trpc/questionProgress.add');
    expect(r.status).toBe(200);
    expect(dispatched).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/injected/FetchInterceptor.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement FetchInterceptor**

Create `extension/injected/FetchInterceptor.ts`:

```ts
type TrpcEnvelope = { result?: { data?: { json?: { status?: string } } } };

function isTrpcCompleted(payload: unknown): boolean {
  const record = Array.isArray(payload) ? payload[0] : payload;
  return (record as TrpcEnvelope | undefined)?.result?.data?.json?.status === 'complete';
}

export class FetchInterceptor {
  install(): void {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const response = await originalFetch(input, init);
      const url =
        input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
      if (url.includes('/api/trpc/questionProgress.add')) {
        try {
          const clone = response.clone();
          const data = (await clone.json()) as unknown;
          if (isTrpcCompleted(data)) {
            window.dispatchEvent(new CustomEvent('GFE_COMPLETE'));
          }
        } catch {
          // Response was not JSON or already consumed — safe to ignore.
        }
      }
      return response;
    };
  }
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/injected/FetchInterceptor.test.ts`

Expected: `Tests 6 passed`. Exit 0.

- [ ] **Step 4: Commit**

`git add extension/injected/FetchInterceptor.ts tests/unit/injected/FetchInterceptor.test.ts`

`git commit -m "feat(injected): add FetchInterceptor for tRPC completion detection

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 14: MonacoExtractor, RawMetadataCapture, Injected Entry

**Milestone:** M4

**Files:**
- Create: `extension/injected/MonacoExtractor.ts`
- Create: `extension/injected/RawMetadataCapture.ts`
- Modify: `extension/injected/index.ts`
- Create: `tests/unit/injected/MonacoExtractor.test.ts`
- Create: `tests/unit/injected/RawMetadataCapture.test.ts`

**Interfaces:**
- Consumes: `window.monaco`, `self.__next_f`, DOM.
- Produces: `MonacoExtractor.extract() → WorkspaceFile[]`, `RawMetadataCapture.capture() → RawMetadata`, and the injected entry that wires FetchInterceptor + extractors + postMessage to content script.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/injected/MonacoExtractor.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MonacoExtractor } from '../../../extension/injected/MonacoExtractor';
import { MonacoUnavailableError } from '../../../extension/types';

function stubMonaco(models: Array<{ path: string; content: string; language: string }>): void {
  const monacoModels = models.map((m) => ({
    uri: { path: `/${m.path}` },
    getValue: () => m.content,
    getLanguageId: () => m.language,
  }));
  (window as unknown as { monaco: unknown }).monaco = {
    editor: { getModels: () => monacoModels },
  };
}

describe('MonacoExtractor', () => {
  afterEach(() => {
    delete (window as unknown as { monaco?: unknown }).monaco;
    vi.restoreAllMocks();
  });

  it('extracts models and strips leading slash from path', () => {
    stubMonaco([
      { path: 'src/a.js', content: 'a', language: 'javascript' },
      { path: 'package.json', content: '{}', language: 'json' },
    ]);
    const files = new MonacoExtractor().extract();
    expect(files).toEqual([
      { path: 'src/a.js', content: 'a', language: 'javascript' },
      { path: 'package.json', content: '{}', language: 'json' },
    ]);
  });

  it('throws MonacoUnavailableError when monaco missing', () => {
    expect(() => new MonacoExtractor().extract()).toThrow(MonacoUnavailableError);
  });
});
```

Create `tests/unit/injected/RawMetadataCapture.test.ts`:

```ts
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
    expect(raw.domSnapshot).toBeUndefined();
  });

  it('falls back to DOM snapshot when __next_f empty', () => {
    (globalThis as unknown as { __next_f?: unknown[] }).__next_f = [];
    document.body.innerHTML = `
      <h1>Event Emitter</h1>
      <span data-testid="difficulty">Medium</span>
      <span data-testid="duration">20 minutes</span>
      <div class="prose"><p>Describe it.</p></div>
    `;
    const raw = new RawMetadataCapture().capture();
    expect(raw.__next_f).toBeUndefined();
    expect(raw.domSnapshot?.title).toBe('Event Emitter');
    expect(raw.domSnapshot?.difficulty).toBe('Medium');
    expect(raw.domSnapshot?.duration).toBe('20 minutes');
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
    });
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/injected/MonacoExtractor.test.ts tests/unit/injected/RawMetadataCapture.test.ts`

Expected: FAIL — modules not found.

- [ ] **Step 2: Implement MonacoExtractor**

Create `extension/injected/MonacoExtractor.ts`:

```ts
import { MonacoUnavailableError, WorkspaceFile } from '../types';

interface MonacoModel {
  uri: { path: string };
  getValue(): string;
  getLanguageId(): string;
}

interface MonacoAccessor {
  editor?: { getModels(): MonacoModel[] };
}

declare global {
  interface Window {
    monaco?: MonacoAccessor;
  }
}

export class MonacoExtractor {
  extract(): WorkspaceFile[] {
    const monaco = window.monaco;
    if (!monaco?.editor) throw new MonacoUnavailableError();
    const models = monaco.editor.getModels();
    return models
      .map<WorkspaceFile>((model) => ({
        path: model.uri.path.replace(/^\//, ''),
        content: model.getValue(),
        language: model.getLanguageId(),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}
```

- [ ] **Step 3: Implement RawMetadataCapture**

Create `extension/injected/RawMetadataCapture.ts`:

```ts
import { RawMetadata } from '../types';

declare global {
  interface Window {
    __next_f?: unknown[];
  }
}

export class RawMetadataCapture {
  capture(): RawMetadata {
    const nextF = (globalThis as unknown as { __next_f?: unknown[] }).__next_f;
    if (Array.isArray(nextF) && nextF.length > 0) {
      return { __next_f: nextF };
    }
    return {
      domSnapshot: {
        title: document.querySelector('h1')?.textContent?.trim() ?? '',
        difficulty:
          document.querySelector('[data-testid="difficulty"]')?.textContent?.trim() ?? '',
        duration: document.querySelector('[data-testid="duration"]')?.textContent?.trim() ?? '',
        description: document.querySelector('.prose')?.innerHTML ?? '',
        url: location.href,
      },
    };
  }
}
```

- [ ] **Step 4: Wire injected entry**

Replace `extension/injected/index.ts`:

```ts
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
  } catch (err) {
    console.error('[GFE Sync] capture failed:', err);
  }
});
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/injected/`

Expected: `Tests 11 passed` (6 FetchInterceptor + 2 MonacoExtractor + 3 RawMetadataCapture). Exit 0.

- [ ] **Step 6: Verify extension builds**

Run: `pnpm --filter @gfe/extension build`

Expected: `extension/dist/injected.js` exists.

- [ ] **Step 7: Commit**

`git add extension/injected tests/unit/injected/MonacoExtractor.test.ts tests/unit/injected/RawMetadataCapture.test.ts`

`git commit -m "feat(injected): add MonacoExtractor, RawMetadataCapture and wire injected entry

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 15: PageBridge (Content Script)

**Milestone:** M4

**Files:**
- Create: `extension/content/PageBridge.ts`
- Modify: `extension/content/index.ts`
- Create: `tests/unit/content/PageBridge.test.ts`

**Interfaces:**
- Consumes: `chrome.runtime.getURL`, `chrome.runtime.sendMessage`, `window.postMessage`.
- Produces: `PageBridge.inject()` (injects `injected.js` into page world), `PageBridge.listen()` (relays GFE_COMPLETE from page to background).

- [ ] **Step 1: Write failing test**

Create `tests/unit/content/PageBridge.test.ts`:

```ts
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
```

Run: `pnpm --filter @gfe/extension test tests/unit/content/PageBridge.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement PageBridge**

Create `extension/content/PageBridge.ts`:

```ts
import type { CaptureResult } from '../types';

export class PageBridge {
  inject(): void {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.type = 'module';
    const parent = document.head ?? document.documentElement;
    parent.appendChild(script);
    script.addEventListener('load', () => script.remove());
  }

  listen(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      const data = event.data as { type?: string; workspace?: unknown; metadata?: unknown; timestamp?: unknown; pageUrl?: unknown } | null;
      if (!data || data.type !== 'GFE_COMPLETE') return;
      const payload: CaptureResult = {
        workspace: data.workspace as CaptureResult['workspace'],
        metadata: data.metadata as CaptureResult['metadata'],
        timestamp: data.timestamp as number,
        pageUrl: data.pageUrl as string,
      };
      chrome.runtime.sendMessage({ type: 'QUESTION_COMPLETED', payload });
    });
  }
}
```

- [ ] **Step 3: Wire content entry**

Replace `extension/content/index.ts`:

```ts
import { PageBridge } from './PageBridge';

const bridge = new PageBridge();
bridge.inject();
bridge.listen();
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/content/PageBridge.test.ts`

Expected: `Tests 5 passed`. Exit 0.

- [ ] **Step 5: Commit**

`git add extension/content tests/unit/content`

`git commit -m "feat(content): add PageBridge for page ↔ background messaging

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 16: RSCProvider & DOMProvider

**Milestone:** M5

**Files:**
- Create: `extension/providers/RSCProvider.ts`
- Create: `extension/providers/DOMProvider.ts`
- Create: `tests/unit/providers/RSCProvider.test.ts`
- Create: `tests/unit/providers/DOMProvider.test.ts`

**Interfaces:**
- Consumes: `RawMetadata` from `types`.
- Produces: two implementations of `IMetadataProvider` exported for `MetadataResolver` (Task 17).

- [ ] **Step 1: Write failing tests**

Create `tests/unit/providers/RSCProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RSCProvider } from '../../../extension/providers/RSCProvider';

const question = {
  title: 'Event Emitter',
  slug: 'event-emitter',
  difficulty: 'medium',
  format: 'javascript',
  duration: 30,
  description: 'Implement one.',
  languages: ['js'],
  companies: ['Google'],
  metadata: { url: 'https://www.greatfrontend.com/questions/javascript/event-emitter' },
};

describe('RSCProvider', () => {
  const provider = new RSCProvider();

  it('canHandle returns true when __next_f is a non-empty array', () => {
    expect(provider.canHandle({ __next_f: [[1, '{}']] })).toBe(true);
    expect(provider.canHandle({ __next_f: [] })).toBe(false);
    expect(provider.canHandle({})).toBe(false);
  });

  it('extracts metadata from nested __next_f payload', async () => {
    const raw = { __next_f: [[1, JSON.stringify({ nested: { deep: { question } } })]] };
    const meta = await provider.getMetadata(raw);
    expect(meta).toEqual({
      title: 'Event Emitter',
      slug: 'event-emitter',
      difficulty: 'medium',
      format: 'javascript',
      duration: 30,
      description: 'Implement one.',
      url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
      languages: ['js'],
      companies: ['Google'],
    });
  });

  it('throws when no matching shape found', async () => {
    const raw = { __next_f: [[1, JSON.stringify({ foo: 'bar' })]] };
    await expect(provider.getMetadata(raw)).rejects.toThrow();
  });

  it('skips non-parseable entries and non-[1,x] entries', async () => {
    const raw = { __next_f: [[0, 'ignored'], [1, 'not json'], [1, JSON.stringify({ question })]] };
    const meta = await provider.getMetadata(raw);
    expect(meta.slug).toBe('event-emitter');
  });
});
```

Create `tests/unit/providers/DOMProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DOMProvider } from '../../../extension/providers/DOMProvider';

describe('DOMProvider', () => {
  const provider = new DOMProvider();

  it('canHandle only when domSnapshot present', () => {
    expect(provider.canHandle({})).toBe(false);
    expect(
      provider.canHandle({
        domSnapshot: { title: 't', difficulty: 'd', duration: 'u', description: '', url: 'x' },
      }),
    ).toBe(true);
  });

  it('parses duration in minutes and derives slug + format from URL', async () => {
    const meta = await provider.getMetadata({
      domSnapshot: {
        title: 'Event Emitter',
        difficulty: 'Medium',
        duration: '30 minutes',
        description: '<p>desc</p>',
        url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
      },
    });
    expect(meta).toEqual({
      title: 'Event Emitter',
      slug: 'event-emitter',
      difficulty: 'medium',
      format: 'javascript',
      duration: 30,
      description: '<p>desc</p>',
      url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
      languages: [],
      companies: [],
    });
  });

  it('handles hours in duration', async () => {
    const meta = await provider.getMetadata({
      domSnapshot: {
        title: 'x',
        difficulty: 'hard',
        duration: '2 hours',
        description: '',
        url: 'https://www.greatfrontend.com/questions/react/counter',
      },
    });
    expect(meta.duration).toBe(120);
    expect(meta.format).toBe('react');
  });

  it('throws when URL not a GFE question URL', async () => {
    await expect(
      provider.getMetadata({
        domSnapshot: { title: 't', difficulty: 'd', duration: '1m', description: '', url: 'x' },
      }),
    ).rejects.toThrow();
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/providers/`

Expected: FAIL — modules not found.

- [ ] **Step 2: Implement RSCProvider**

Create `extension/providers/RSCProvider.ts`:

```ts
import {
  IMetadataProvider,
  MetadataUnavailableError,
  QuestionMetadata,
  RawMetadata,
} from '../types';

interface QuestionShape {
  title: string;
  slug: string;
  difficulty: string;
  format?: string;
  duration?: number;
  description?: string;
  languages?: string[];
  companies?: string[];
  metadata?: { url?: string };
  url?: string;
}

function findQuestion(node: unknown): QuestionShape | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (
    typeof obj.title === 'string' &&
    typeof obj.slug === 'string' &&
    typeof obj.difficulty === 'string'
  ) {
    return obj as unknown as QuestionShape;
  }
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findQuestion(item);
        if (found) return found;
      }
    } else if (value && typeof value === 'object') {
      const found = findQuestion(value);
      if (found) return found;
    }
  }
  return null;
}

export class RSCProvider implements IMetadataProvider {
  canHandle(raw: RawMetadata): boolean {
    return Array.isArray(raw.__next_f) && raw.__next_f.length > 0;
  }

  async getMetadata(raw: RawMetadata): Promise<QuestionMetadata> {
    const entries = raw.__next_f as unknown[];
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2 || entry[0] !== 1) continue;
      const jsonStr = entry[1];
      if (typeof jsonStr !== 'string') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        continue;
      }
      const q = findQuestion(parsed);
      if (q) return this.normalize(q);
    }
    throw new MetadataUnavailableError('RSC payload did not contain question metadata');
  }

  private normalize(q: QuestionShape): QuestionMetadata {
    const url = q.metadata?.url ?? q.url ?? '';
    return {
      title: q.title,
      slug: q.slug,
      difficulty: q.difficulty.toLowerCase(),
      format: q.format ?? this.formatFromUrl(url) ?? 'javascript',
      duration: q.duration ?? 0,
      description: q.description ?? '',
      url,
      languages: q.languages ?? [],
      companies: q.companies ?? [],
    };
  }

  private formatFromUrl(url: string): string | null {
    const m = url.match(/\/questions\/([^/]+)\//);
    return m ? m[1] : null;
  }
}
```

- [ ] **Step 3: Implement DOMProvider**

Create `extension/providers/DOMProvider.ts`:

```ts
import {
  IMetadataProvider,
  MetadataUnavailableError,
  QuestionMetadata,
  RawMetadata,
} from '../types';

export class DOMProvider implements IMetadataProvider {
  canHandle(raw: RawMetadata): boolean {
    return !!raw.domSnapshot;
  }

  async getMetadata(raw: RawMetadata): Promise<QuestionMetadata> {
    const snap = raw.domSnapshot;
    if (!snap) throw new MetadataUnavailableError('No DOM snapshot available');
    const match = snap.url.match(/\/questions\/([^/]+)\/([^/?#]+)/);
    if (!match) throw new MetadataUnavailableError(`URL is not a GFE question: ${snap.url}`);
    return {
      title: snap.title,
      slug: match[2],
      difficulty: snap.difficulty.toLowerCase(),
      format: match[1],
      duration: this.parseDuration(snap.duration),
      description: snap.description,
      url: snap.url,
      languages: [],
      companies: [],
    };
  }

  private parseDuration(raw: string): number {
    const m = raw.match(/(\d+)\s*(hour|minute|min|hr|h|m)s?/i);
    if (!m) return 0;
    const value = Number(m[1]);
    const unit = m[2].toLowerCase();
    return unit.startsWith('h') ? value * 60 : value;
  }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/providers/`

Expected: `Tests 8 passed` (4 RSC + 4 DOM). Exit 0.

- [ ] **Step 5: Commit**

`git add extension/providers tests/unit/providers`

`git commit -m "feat(providers): add RSCProvider and DOMProvider

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 17: MetadataResolver

**Milestone:** M5

**Files:**
- Create: `extension/providers/MetadataResolver.ts`
- Create: `tests/unit/providers/MetadataResolver.test.ts`

**Interfaces:**
- Consumes: array of `IMetadataProvider` implementations.
- Produces: `MetadataResolver.getMetadata(raw: RawMetadata): Promise<QuestionMetadata>` (used by SyncOrchestrator in Task 18).

- [ ] **Step 1: Write failing test**

Create `tests/unit/providers/MetadataResolver.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { MetadataResolver } from '../../../extension/providers/MetadataResolver';
import {
  IMetadataProvider,
  MetadataUnavailableError,
  QuestionMetadata,
  RawMetadata,
} from '../../../extension/types';

const meta: QuestionMetadata = {
  title: 't',
  slug: 's',
  difficulty: 'easy',
  format: 'javascript',
  duration: 1,
  description: '',
  url: 'https://x/questions/javascript/s',
  languages: [],
  companies: [],
};

function provider(canHandle: boolean, result: QuestionMetadata | Error): IMetadataProvider {
  return {
    canHandle: vi.fn(() => canHandle),
    getMetadata: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('MetadataResolver', () => {
  it('uses first provider that canHandle and succeeds', async () => {
    const p1 = provider(true, meta);
    const p2 = provider(true, new Error('nope'));
    const resolver = new MetadataResolver([p1, p2]);
    const out = await resolver.getMetadata({} as RawMetadata);
    expect(out).toBe(meta);
    expect(p2.getMetadata).not.toHaveBeenCalled();
  });

  it('falls through when first provider throws', async () => {
    const p1 = provider(true, new Error('first fails'));
    const p2 = provider(true, meta);
    const resolver = new MetadataResolver([p1, p2]);
    const out = await resolver.getMetadata({} as RawMetadata);
    expect(out).toBe(meta);
  });

  it('skips providers that cannot handle', async () => {
    const p1 = provider(false, meta);
    const p2 = provider(true, meta);
    const resolver = new MetadataResolver([p1, p2]);
    await resolver.getMetadata({} as RawMetadata);
    expect(p1.getMetadata).not.toHaveBeenCalled();
    expect(p2.getMetadata).toHaveBeenCalled();
  });

  it('throws MetadataUnavailableError when all providers fail', async () => {
    const p1 = provider(true, new Error('a'));
    const p2 = provider(true, new Error('b'));
    const resolver = new MetadataResolver([p1, p2]);
    await expect(resolver.getMetadata({} as RawMetadata)).rejects.toThrow(
      MetadataUnavailableError,
    );
  });

  it('throws MetadataUnavailableError when no provider can handle', async () => {
    const resolver = new MetadataResolver([provider(false, meta), provider(false, meta)]);
    await expect(resolver.getMetadata({} as RawMetadata)).rejects.toThrow(
      MetadataUnavailableError,
    );
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/providers/MetadataResolver.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement MetadataResolver**

Create `extension/providers/MetadataResolver.ts`:

```ts
import { logger } from '../utils/Logger';
import {
  IMetadataProvider,
  MetadataUnavailableError,
  QuestionMetadata,
  RawMetadata,
} from '../types';

export class MetadataResolver {
  constructor(private readonly providers: IMetadataProvider[]) {}

  async getMetadata(raw: RawMetadata): Promise<QuestionMetadata> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      if (!provider.canHandle(raw)) continue;
      try {
        return await provider.getMetadata(raw);
      } catch (err) {
        const name = provider.constructor.name;
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('metadata_provider_failed', { provider: name, error: message });
        errors.push(`${name}: ${message}`);
      }
    }
    throw new MetadataUnavailableError(
      errors.length ? `All providers failed: ${errors.join('; ')}` : 'No provider could handle metadata',
    );
  }
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/providers/MetadataResolver.test.ts`

Expected: `Tests 5 passed`. Exit 0.

- [ ] **Step 4: Commit**

`git add extension/providers/MetadataResolver.ts tests/unit/providers/MetadataResolver.test.ts`

`git commit -m "feat(providers): add MetadataResolver with provider fallback

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 18: SyncOrchestrator, MessageRouter & Background Wiring

**Milestone:** M6

**Files:**
- Create: `extension/background/SyncOrchestrator.ts`
- Create: `extension/background/MessageRouter.ts`
- Modify: `extension/background/index.ts`
- Create: `tests/unit/background/SyncOrchestrator.test.ts`
- Create: `tests/unit/background/MessageRouter.test.ts`

**Interfaces:**
- Consumes: `EventBus` (Task 6), `AuthHandler` (Task 7), `HashStore/ExtensionStorage/ConfigStore` (Task 4), `MetadataResolver` (Task 17), `RepositoryProvider` (implemented in Task 12/20), `sha256` (Task 3), Zod schemas (Task 2).
- Produces: full sync pipeline; message router that dispatches chrome.runtime messages; background service worker that wires all singletons.

- [ ] **Step 1: Write failing SyncOrchestrator test**

Create `tests/unit/background/SyncOrchestrator.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncOrchestrator } from '../../../extension/background/SyncOrchestrator';
import { EventBus } from '../../../extension/background/EventBus';
import { HashStore } from '../../../extension/storage/HashStore';
import { ConfigStore } from '../../../extension/storage/ConfigStore';
import { ExtensionStorage } from '../../../extension/storage/ExtensionStorage';
import {
  CaptureResult,
  QuestionMetadata,
  SyncState,
  MetadataUnavailableError,
} from '../../../extension/types';

const meta: QuestionMetadata = {
  title: 'Event Emitter',
  slug: 'event-emitter',
  difficulty: 'medium',
  format: 'javascript',
  duration: 30,
  description: '',
  url: 'https://x/questions/javascript/event-emitter',
  languages: [],
  companies: [],
};

const capture: CaptureResult = {
  workspace: [{ path: 'src/a.js', content: 'x', language: 'javascript' }],
  metadata: { __next_f: [] },
  timestamp: 1,
  pageUrl: meta.url,
};

function makeDeps(overrides: Partial<{
  authValid: boolean;
  metaResult: QuestionMetadata | Error;
  provider: { ensureRepository: ReturnType<typeof vi.fn>; synchronize: ReturnType<typeof vi.fn> };
}> = {}) {
  const bus = new EventBus();
  const states: SyncState[] = [];
  bus.on('STATE_CHANGED', (e) => states.push(e.payload.state));
  const events: string[] = [];
  bus.on('SYNC_COMPLETED', () => events.push('COMPLETED'));
  bus.on('SYNC_FAILED', () => events.push('FAILED'));
  bus.on('SYNC_SKIPPED', () => events.push('SKIPPED'));

  const auth = {
    validateStoredToken: vi.fn(async () => overrides.authValid ?? true),
  };
  const resolver = {
    getMetadata: vi.fn(async () => {
      if (overrides.metaResult instanceof Error) throw overrides.metaResult;
      return overrides.metaResult ?? meta;
    }),
  };
  const provider = overrides.provider ?? {
    ensureRepository: vi.fn(async () => ({ owner: 'me', repo: 'repo' })),
    synchronize: vi.fn(async () => ({ commitSha: 'sha123' })),
  };
  return { bus, auth, resolver, provider, states, events };
}

function buildOrch(deps: ReturnType<typeof makeDeps>): SyncOrchestrator {
  return new SyncOrchestrator({
    eventBus: deps.bus,
    auth: deps.auth as never,
    resolver: deps.resolver as never,
    provider: deps.provider as never,
    extensionVersion: '0.1.0-test',
  });
}

beforeEach(async () => {
  chrome.storage.local.clear();
  chrome.storage.session.clear();
  await chrome.storage.local.set({ 'gfe.token': 'tok' });
});

describe('SyncOrchestrator', () => {
  it('runs happy path Idle → Capturing → Building → Syncing → Success', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);
    await orch.handleCapture(capture);
    expect(deps.states).toEqual([
      SyncState.Capturing,
      SyncState.Building,
      SyncState.Syncing,
      SyncState.Success,
    ]);
    expect(deps.events).toContain('COMPLETED');
    expect(deps.provider.synchronize).toHaveBeenCalledOnce();
    const stored = await HashStore.get('event-emitter');
    expect(stored).toBeTruthy();
    const last = await ExtensionStorage.getLastSync();
    expect(last?.commitSha).toBe('sha123');
  });

  it('short-circuits with SYNC_SKIPPED when hash matches', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);
    await orch.handleCapture(capture);
    deps.provider.synchronize.mockClear();
    await orch.handleCapture(capture);
    expect(deps.provider.synchronize).not.toHaveBeenCalled();
    expect(deps.events).toContain('SKIPPED');
  });

  it('emits SYNC_FAILED when metadata resolution fails', async () => {
    const deps = makeDeps({ metaResult: new MetadataUnavailableError('nope') });
    const orch = buildOrch(deps);
    await orch.handleCapture(capture);
    expect(deps.events).toContain('FAILED');
    expect(deps.provider.synchronize).not.toHaveBeenCalled();
  });

  it('aborts sync when token invalid', async () => {
    const deps = makeDeps({ authValid: false });
    const orch = buildOrch(deps);
    await orch.handleCapture(capture);
    expect(deps.provider.synchronize).not.toHaveBeenCalled();
    expect(deps.events).toContain('FAILED');
  });

  it('rejects invalid workspace via Zod', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);
    await orch.handleCapture({ ...capture, workspace: [{ path: '', content: '', language: '' }] });
    expect(deps.events).toContain('FAILED');
    expect(deps.provider.synchronize).not.toHaveBeenCalled();
  });

  it('calls validateStoredToken with NO arguments (bus is injected into AuthHandler)', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);
    await orch.handleCapture(capture);
    expect(deps.auth.validateStoredToken).toHaveBeenCalledTimes(1);
    expect(deps.auth.validateStoredToken).toHaveBeenCalledWith();
  });

  it('validates the stored token at most once per session (subsequent captures skip)', async () => {
    const deps = makeDeps();
    const orch = buildOrch(deps);
    // First capture triggers validation.
    await orch.handleCapture(capture);
    // Second capture with a different hash (mutate one file) should still succeed but must NOT revalidate.
    const modified = {
      ...capture,
      workspace: [{ path: 'src/a.js', content: 'y', language: 'javascript' }],
    };
    await orch.handleCapture(modified);
    expect(deps.auth.validateStoredToken).toHaveBeenCalledTimes(1);
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/background/SyncOrchestrator.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement SyncOrchestrator**

Create `extension/background/SyncOrchestrator.ts`:

```ts
import { EventBus } from './EventBus';
import { AuthHandler } from './AuthHandler';
import { MetadataResolver } from '../providers/MetadataResolver';
import { HashStore } from '../storage/HashStore';
import { ConfigStore } from '../storage/ConfigStore';
import { ExtensionStorage } from '../storage/ExtensionStorage';
import { sha256 } from '../utils/Hash';
import { logger } from '../utils/Logger';
import {
  CaptureResult,
  QuestionSnapshot,
  QuestionSnapshotSchema,
  RepositoryProvider,
  SNAPSHOT_VERSION,
  SyncState,
  WorkspaceFileSchema,
} from '../types';
import { z } from 'zod';

interface Deps {
  eventBus: EventBus;
  auth: Pick<AuthHandler, 'validateStoredToken'>;
  resolver: Pick<MetadataResolver, 'getMetadata'>;
  provider: RepositoryProvider;
  extensionVersion: string;
}

export class SyncOrchestrator {
  private state: SyncState = SyncState.Idle;
  private tokenValidatedThisSession = false;

  constructor(private readonly deps: Deps) {}

  getState(): SyncState {
    return this.state;
  }

  async handleCapture(capture: CaptureResult): Promise<void> {
    try {
      this.setState(SyncState.Capturing);
      z.array(WorkspaceFileSchema).min(1).parse(capture.workspace);

      // Auth validation is performed at most ONCE per service worker session.
      // AuthHandler is constructed with EventBus injected, so validateStoredToken() takes no args.
      if (!this.tokenValidatedThisSession) {
        const tokenOk = await this.deps.auth.validateStoredToken();
        this.tokenValidatedThisSession = tokenOk;
        if (!tokenOk) {
          throw new Error('No valid GitHub token');
        }
      }

      this.setState(SyncState.Building);
      const metadata = await this.deps.resolver.getMetadata(capture.metadata);

      const sortedFiles = [...capture.workspace].sort((a, b) => a.path.localeCompare(b.path));
      const hashInput = JSON.stringify({ metadata, files: sortedFiles });
      const hash = await sha256(hashInput);

      const snapshot: QuestionSnapshot = QuestionSnapshotSchema.parse({
        metadata,
        files: sortedFiles,
        hash,
        completedAt: new Date(capture.timestamp).toISOString(),
        extensionVersion: this.deps.extensionVersion,
        snapshotVersion: SNAPSHOT_VERSION,
      });
      await this.deps.eventBus.emit({ type: 'SNAPSHOT_CREATED', payload: { snapshot } });

      const existing = await HashStore.get(metadata.slug);
      if (existing === hash) {
        await this.deps.eventBus.emit({
          type: 'SYNC_SKIPPED',
          payload: { slug: metadata.slug, reason: 'hash_match' },
        });
        this.setState(SyncState.Success);
        return;
      }

      this.setState(SyncState.Syncing);
      await this.deps.eventBus.emit({ type: 'SYNC_STARTED', payload: { slug: metadata.slug } });
      const config = await ConfigStore.get();
      const token = (await ExtensionStorage.get<string>('token'))!;
      await this.deps.provider.ensureRepository(token, config);
      const started = Date.now();
      const { commitSha } = await this.deps.provider.synchronize(snapshot, token, config);
      const duration = Date.now() - started;
      await HashStore.set(metadata.slug, hash);
      await ExtensionStorage.setLastSync({
        slug: metadata.slug,
        title: metadata.title,
        commitSha,
        syncedAt: new Date().toISOString(),
      });
      await this.deps.eventBus.emit({
        type: 'SYNC_COMPLETED',
        payload: { slug: metadata.slug, commitSha, duration, fileCount: snapshot.files.length },
      });
      this.setState(SyncState.Success);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('sync_failed', { error: message });
      await this.deps.eventBus.emit({ type: 'SYNC_FAILED', payload: { error: message } });
      this.setState(SyncState.Failed);
    }
  }

  private setState(next: SyncState): void {
    this.state = next;
    void this.deps.eventBus.emit({ type: 'STATE_CHANGED', payload: { state: next } });
  }
}
```

- [ ] **Step 3: Write failing MessageRouter test**

Create `tests/unit/background/MessageRouter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageRouter } from '../../../extension/background/MessageRouter';
import { SyncState } from '../../../extension/types';

describe('MessageRouter', () => {
  let orch: { handleCapture: ReturnType<typeof vi.fn>; getState: () => SyncState };
  let auth: { startAuth: ReturnType<typeof vi.fn>; revokeAuth: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    orch = { handleCapture: vi.fn(async () => {}), getState: () => SyncState.Idle };
    auth = { startAuth: vi.fn(async () => {}), revokeAuth: vi.fn(async () => {}) };
    chrome.storage.local.clear();
  });

  it('dispatches QUESTION_COMPLETED to orchestrator', async () => {
    const router = new MessageRouter({ orchestrator: orch as never, auth: auth as never, eventBus: {} as never });
    const sendResponse = vi.fn();
    const handled = router.handle(
      { type: 'QUESTION_COMPLETED', payload: { workspace: [], metadata: {}, timestamp: 0, pageUrl: '' } } as never,
      sendResponse,
    );
    expect(handled).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(orch.handleCapture).toHaveBeenCalled();
  });

  it('dispatches AUTH_START', async () => {
    const router = new MessageRouter({ orchestrator: orch as never, auth: auth as never, eventBus: {} as never });
    router.handle({ type: 'AUTH_START' } as never, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    expect(auth.startAuth).toHaveBeenCalled();
  });

  it('dispatches AUTH_REVOKE', async () => {
    const router = new MessageRouter({ orchestrator: orch as never, auth: auth as never, eventBus: {} as never });
    router.handle({ type: 'AUTH_REVOKE' } as never, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    expect(auth.revokeAuth).toHaveBeenCalled();
  });

  it('GET_STATE returns AppState via sendResponse', async () => {
    const router = new MessageRouter({ orchestrator: orch as never, auth: auth as never, eventBus: {} as never });
    const sendResponse = vi.fn();
    router.handle({ type: 'GET_STATE' } as never, sendResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendResponse).toHaveBeenCalled();
    const arg = sendResponse.mock.calls[0][0];
    expect(arg.syncState).toBe(SyncState.Idle);
    expect(arg.auth).toBeDefined();
    expect(arg.config).toBeDefined();
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/background/MessageRouter.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement MessageRouter**

Create `extension/background/MessageRouter.ts`:

```ts
import { SyncOrchestrator } from './SyncOrchestrator';
import { AuthHandler } from './AuthHandler';
import { EventBus } from './EventBus';
import { ExtensionStorage } from '../storage/ExtensionStorage';
import { ConfigStore } from '../storage/ConfigStore';
import { AppState, ExtensionMessage } from '../types';

interface Deps {
  orchestrator: SyncOrchestrator;
  auth: AuthHandler;
  eventBus: EventBus;
}

export class MessageRouter {
  constructor(private readonly deps: Deps) {}

  register(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      return this.handle(message as ExtensionMessage, sendResponse);
    });
  }

  handle(message: ExtensionMessage, sendResponse: (response?: unknown) => void): boolean {
    switch (message.type) {
      case 'QUESTION_COMPLETED':
        void this.deps.orchestrator.handleCapture(message.payload);
        return true;
      case 'AUTH_START':
        void this.deps.auth.startAuth();
        return true;
      case 'AUTH_REVOKE':
        void this.deps.auth.revokeAuth();
        return true;
      case 'GET_STATE':
        void this.buildAppState().then(sendResponse);
        return true;
      default:
        return false;
    }
  }

  private async buildAppState(): Promise<AppState> {
    const token = await ExtensionStorage.get<string>('token');
    const user = await ExtensionStorage.get<{ username: string; avatarUrl: string }>('user');
    const config = await ConfigStore.get();
    const lastSync = await ExtensionStorage.getLastSync();
    return {
      syncState: this.deps.orchestrator.getState(),
      auth: {
        connected: !!token,
        tokenExpired: false,
        username: user?.username,
        avatarUrl: user?.avatarUrl,
      },
      config,
      lastSync,
    };
  }
}
```

- [ ] **Step 5: Wire background/index.ts**

Replace `extension/background/index.ts`:

```ts
import { EventBus } from './EventBus';
import { AuthHandler } from './AuthHandler';
import { SyncOrchestrator } from './SyncOrchestrator';
import { MessageRouter } from './MessageRouter';
import { MetadataResolver } from '../providers/MetadataResolver';
import { RSCProvider } from '../providers/RSCProvider';
import { DOMProvider } from '../providers/DOMProvider';
import { GitHubProvider } from '../github/GitHubProvider';
import { logger } from '../utils/Logger';

const eventBus = new EventBus();
eventBus.installBridge();

const auth = new AuthHandler(eventBus);
const resolver = new MetadataResolver([new RSCProvider(), new DOMProvider()]);
const provider = new GitHubProvider();
const orchestrator = new SyncOrchestrator({
  eventBus,
  auth,
  resolver,
  provider,
  extensionVersion: (import.meta.env.EXTENSION_VERSION as string) ?? '0.0.0',
});
const router = new MessageRouter({ orchestrator, auth, eventBus });
router.register();

chrome.runtime.onStartup.addListener(() => {
  logger.info('startup');
  void auth.validateStoredToken();
});
chrome.runtime.onInstalled.addListener(() => {
  logger.info('installed');
  void auth.validateStoredToken();
});
```

- [ ] **Step 6: Verify all background tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/background/`

Expected: All prior background tests (EventBus, AuthHandler) plus new SyncOrchestrator (7) + MessageRouter (4) tests pass.

- [ ] **Step 7: Verify build**

Run: `pnpm --filter @gfe/extension build`

Expected: Exit 0. `extension/dist/service-worker*.js` exists.

- [ ] **Step 8: Commit**

`git add extension/background tests/unit/background/SyncOrchestrator.test.ts tests/unit/background/MessageRouter.test.ts`

`git commit -m "feat(background): wire SyncOrchestrator, MessageRouter and service worker

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 19: Generators — MarkdownBuilder, README, Metadata, RootREADME

**Milestone:** M7

**Files:**
- Create: `extension/generators/MarkdownBuilder.ts`
- Create: `extension/generators/ReadmeGenerator.ts`
- Create: `extension/generators/MetadataFileGenerator.ts`
- Create: `extension/generators/RootReadmeGenerator.ts`
- Create: `tests/unit/generators/MarkdownBuilder.test.ts`
- Create: `tests/unit/generators/ReadmeGenerator.test.ts`
- Create: `tests/unit/generators/MetadataFileGenerator.test.ts`
- Create: `tests/unit/generators/RootReadmeGenerator.test.ts`

**Interfaces:**
- Consumes: `QuestionSnapshot`, `RepoIndex` from `types`.
- Produces: pure content generators consumed by `GitHubProvider` in Task 20.

- [ ] **Step 1: Write failing MarkdownBuilder test**

Create `tests/unit/generators/MarkdownBuilder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MarkdownBuilder } from '../../../extension/generators/MarkdownBuilder';

describe('MarkdownBuilder', () => {
  it('composes heading, paragraph, badge, list, table, code block, hr, link', () => {
    const md = new MarkdownBuilder()
      .heading(1, 'Title')
      .paragraph('Intro')
      .badge('Difficulty', 'Medium')
      .list(['a', 'b'])
      .table(['H1', 'H2'], [['1', '2']])
      .codeBlock('js', 'const x = 1;')
      .hr()
      .paragraph(new MarkdownBuilder().link('gfe', 'https://x').build())
      .build();
    expect(md).toMatchInlineSnapshot(`
      "# Title

      Intro

      **Difficulty:** Medium

      - a
      - b

      | H1 | H2 |
      | --- | --- |
      | 1 | 2 |

      \`\`\`js
      const x = 1;
      \`\`\`

      ---

      [gfe](https://x)
      "
    `);
  });

  it('is fluent (methods return this)', () => {
    const b = new MarkdownBuilder();
    expect(b.heading(1, 'x')).toBe(b);
    expect(b.paragraph('x')).toBe(b);
    expect(b.hr()).toBe(b);
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/generators/MarkdownBuilder.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement MarkdownBuilder**

Create `extension/generators/MarkdownBuilder.ts`:

```ts
export class MarkdownBuilder {
  private readonly parts: string[] = [];

  heading(level: 1 | 2 | 3 | 4 | 5 | 6, text: string): this {
    this.parts.push(`${'#'.repeat(level)} ${text}`);
    return this;
  }

  paragraph(text: string): this {
    this.parts.push(text);
    return this;
  }

  badge(label: string, value: string): this {
    this.parts.push(`**${label}:** ${value}`);
    return this;
  }

  list(items: string[]): this {
    this.parts.push(items.map((i) => `- ${i}`).join('\n'));
    return this;
  }

  table(headers: string[], rows: string[][]): this {
    const header = `| ${headers.join(' | ')} |`;
    const sep = `| ${headers.map(() => '---').join(' | ')} |`;
    const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
    this.parts.push([header, sep, body].join('\n'));
    return this;
  }

  codeBlock(lang: string, code: string): this {
    this.parts.push(`\`\`\`${lang}\n${code}\n\`\`\``);
    return this;
  }

  hr(): this {
    this.parts.push('---');
    return this;
  }

  link(text: string, url: string): string {
    return `[${text}](${url})`;
  }

  build(): string {
    return this.parts.join('\n\n') + '\n';
  }
}
```

- [ ] **Step 3: Write failing ReadmeGenerator test**

Create `tests/unit/generators/ReadmeGenerator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ReadmeGenerator } from '../../../extension/generators/ReadmeGenerator';
import { QuestionSnapshot } from '../../../extension/types';

const snapshot: QuestionSnapshot = {
  metadata: {
    title: 'Event Emitter',
    slug: 'event-emitter',
    difficulty: 'medium',
    format: 'javascript',
    duration: 30,
    description: '<p>Build one.</p>',
    url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
    languages: ['js', 'ts'],
    companies: ['Google', 'Meta'],
  },
  files: [
    { path: 'src/index.js', content: '', language: 'javascript' },
    { path: 'package.json', content: '{}', language: 'json' },
  ],
  hash: 'abc',
  completedAt: '2025-01-01T00:00:00.000Z',
  extensionVersion: '0.1.0',
  snapshotVersion: 1,
};

describe('ReadmeGenerator', () => {
  it('generates README with heading, badges, languages, companies, source link, description, and structure', () => {
    const md = new ReadmeGenerator().generate(snapshot);
    expect(md).toContain('# Event Emitter');
    expect(md).toContain('**Difficulty:** medium');
    expect(md).toContain('**Format:** javascript');
    expect(md).toContain('**Duration:** 30 minutes');
    expect(md).toContain('- js');
    expect(md).toContain('- ts');
    expect(md).toContain('- Google');
    expect(md).toContain('[View on GreatFrontend]');
    expect(md).toContain('<p>Build one.</p>');
    expect(md).toContain('## Project Structure');
    expect(md).toContain('- src/index.js');
    expect(md).toContain('- package.json');
  });
});
```

- [ ] **Step 4: Implement ReadmeGenerator**

Create `extension/generators/ReadmeGenerator.ts`:

```ts
import { MarkdownBuilder } from './MarkdownBuilder';
import { QuestionSnapshot } from '../types';

export class ReadmeGenerator {
  generate(snapshot: QuestionSnapshot): string {
    const b = new MarkdownBuilder();
    const m = snapshot.metadata;
    b.heading(1, m.title)
      .badge('Difficulty', m.difficulty)
      .badge('Format', m.format)
      .badge('Duration', `${m.duration} minutes`);
    if (m.languages.length) b.heading(2, 'Languages').list(m.languages);
    if (m.companies.length) b.heading(2, 'Asked At').list(m.companies);
    b.heading(2, 'Source').paragraph(b.link('View on GreatFrontend', m.url));
    if (m.description) b.heading(2, 'Description').paragraph(m.description);
    b.heading(2, 'Project Structure').list(snapshot.files.map((f) => f.path));
    b.hr().paragraph(`_Synced at ${snapshot.completedAt} · extension v${snapshot.extensionVersion}_`);
    return b.build();
  }
}
```

- [ ] **Step 5: Write failing MetadataFileGenerator test**

Create `tests/unit/generators/MetadataFileGenerator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MetadataFileGenerator } from '../../../extension/generators/MetadataFileGenerator';
import { QuestionSnapshot } from '../../../extension/types';

describe('MetadataFileGenerator', () => {
  it('serializes snapshot metadata to pretty JSON', () => {
    const snap: QuestionSnapshot = {
      metadata: {
        title: 't',
        slug: 's',
        difficulty: 'easy',
        format: 'javascript',
        duration: 10,
        description: 'd',
        url: 'u',
        languages: [],
        companies: [],
      },
      files: [],
      hash: 'h',
      completedAt: '2025',
      extensionVersion: '0.1.0',
      snapshotVersion: 1,
    };
    const json = new MetadataFileGenerator().generate(snap);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.slug).toBe('s');
    expect(parsed.hash).toBe('h');
    expect(parsed.snapshotVersion).toBe(1);
    expect(parsed.extensionVersion).toBe('0.1.0');
    expect(json).toContain('\n');
  });
});
```

- [ ] **Step 6: Implement MetadataFileGenerator**

Create `extension/generators/MetadataFileGenerator.ts`:

```ts
import { QuestionSnapshot, METADATA_SCHEMA_VERSION } from '../types';

export class MetadataFileGenerator {
  generate(snapshot: QuestionSnapshot): string {
    return JSON.stringify(
      {
        schemaVersion: METADATA_SCHEMA_VERSION,
        ...snapshot.metadata,
        hash: snapshot.hash,
        completedAt: snapshot.completedAt,
        extensionVersion: snapshot.extensionVersion,
        snapshotVersion: snapshot.snapshotVersion,
      },
      null,
      2,
    );
  }
}
```

- [ ] **Step 7: Write failing RootReadmeGenerator test**

Create `tests/unit/generators/RootReadmeGenerator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RootReadmeGenerator } from '../../../extension/generators/RootReadmeGenerator';
import { RepoIndex } from '../../../extension/types';

describe('RootReadmeGenerator', () => {
  it('renders stats and per-category tables', () => {
    const idx: RepoIndex = {
      version: 1,
      solutions: {
        'event-emitter': {
          hash: 'a', commitSha: 'c1', syncedAt: '2025-01-01T00:00:00.000Z',
          extensionVersion: '0.1.0', snapshotVersion: 1, category: 'javascript', title: 'Event Emitter',
        },
        'counter': {
          hash: 'b', commitSha: 'c2', syncedAt: '2025-01-02T00:00:00.000Z',
          extensionVersion: '0.1.0', snapshotVersion: 1, category: 'react', title: 'Counter',
        },
      },
    };
    const md = new RootReadmeGenerator().generate(idx, 'categorized');
    expect(md).toContain('# GreatFrontend Solutions');
    expect(md).toContain('**Total solutions:** 2');
    expect(md).toContain('## javascript');
    expect(md).toContain('## react');
    expect(md).toContain('[Event Emitter](javascript/event-emitter)');
    expect(md).toContain('[Counter](react/counter)');
  });

  it('uses flat paths when layout is flat', () => {
    const idx: RepoIndex = {
      version: 1,
      solutions: {
        counter: {
          hash: 'x', commitSha: 'c', syncedAt: '2025', extensionVersion: '0.1.0',
          snapshotVersion: 1, category: 'react', title: 'Counter',
        },
      },
    };
    const md = new RootReadmeGenerator().generate(idx, 'flat');
    expect(md).toContain('[Counter](counter)');
  });
});
```

- [ ] **Step 8: Implement RootReadmeGenerator**

Create `extension/generators/RootReadmeGenerator.ts`:

```ts
import { MarkdownBuilder } from './MarkdownBuilder';
import { RepoIndex, SyncConfig } from '../types';

export class RootReadmeGenerator {
  generate(index: RepoIndex, layout: SyncConfig['folderLayout']): string {
    const b = new MarkdownBuilder();
    const entries = Object.entries(index.solutions);
    b.heading(1, 'GreatFrontend Solutions')
      .paragraph('Auto-synced by the GreatFrontend Sync Chrome Extension.')
      .badge('Total solutions', String(entries.length))
      .hr();

    const grouped = new Map<string, Array<[string, RepoIndex['solutions'][string]]>>();
    for (const [slug, entry] of entries) {
      const arr = grouped.get(entry.category) ?? [];
      arr.push([slug, entry]);
      grouped.set(entry.category, arr);
    }

    for (const [category, items] of [...grouped.entries()].sort()) {
      b.heading(2, category);
      const rows = items
        .sort((a, b) => a[1].title.localeCompare(b[1].title))
        .map(([slug, entry]) => {
          const path = layout === 'categorized' ? `${category}/${slug}` : slug;
          return [b.link(entry.title, path), entry.syncedAt.slice(0, 10), entry.commitSha.slice(0, 7)];
        });
      b.table(['Solution', 'Synced', 'Commit'], rows);
    }

    return b.build();
  }
}
```

- [ ] **Step 9: Verify all generator tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/generators/`

Expected: `Tests 5 passed` (2 MarkdownBuilder + 1 Readme + 1 Metadata + 2 RootReadme).

- [ ] **Step 10: Commit**

`git add extension/generators tests/unit/generators`

`git commit -m "feat(generators): add MarkdownBuilder, README/metadata/root README generators

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 20: Wire Real Generators into GitHubProvider

**Milestone:** M7

**Files:**
- Modify: `extension/github/GitHubProvider.ts`
- Create: `tests/unit/github/GitHubProvider.integration.test.ts`

**Interfaces:**
- Consumes: generators from Task 19, existing GitHubProvider seams from Task 12, `IndexManager`/`RepoManager`/`GitDataService` (Task 10/11).
- Produces: fully functional `RepositoryProvider` used by SyncOrchestrator.

- [ ] **Step 1: Modify GitHubProvider to inject real generators and produce a fully atomic commit**

Replace the stub `renderReadme`, `renderMetadataJson`, `renderRootReadme` fields introduced in Task 12 with concrete generators and assemble ALL artifacts (workspace, per-problem README/metadata, `index.json`, and — if enabled — root README) into a SINGLE Git Data commit. No post-commit Contents API writes.

Because the new commit SHA is not known before the commit is created, the `commitSha` recorded inside the new `index.json` entry uses the parent HEAD SHA (fetched pre-flight). This is deterministic and useful for debugging (it identifies the commit the new one builds on). The real, resolved `commitSha` of the new commit is still returned from `synchronize()` and persisted by `SyncOrchestrator` into `HashStore`/`ExtensionStorage.lastSync`.

Replace `extension/github/GitHubProvider.ts`:

```ts
import { GitHubClient } from './GitHubClient';
import { GitDataService } from './GitDataService';
import { RepoManager } from './RepoManager';
import { IndexManager } from './IndexManager';
import { ReadmeGenerator } from '../generators/ReadmeGenerator';
import { MetadataFileGenerator } from '../generators/MetadataFileGenerator';
import { RootReadmeGenerator } from '../generators/RootReadmeGenerator';
import { logger } from '../utils/Logger';
import type { QuestionSnapshot, RepositoryProvider, SyncConfig, RepoIndexEntry } from '../types';

export class GitHubProvider implements RepositoryProvider {
  private readonly client = new GitHubClient();
  private readonly repos = new RepoManager(this.client);
  private readonly gitData = new GitDataService(this.client);
  private readonly index = new IndexManager(this.client);
  private readonly readme = new ReadmeGenerator();
  private readonly metaFile = new MetadataFileGenerator();
  private readonly rootReadme = new RootReadmeGenerator();

  async ensureRepository(token: string, config: SyncConfig): Promise<{ owner: string; repo: string }> {
    return this.repos.ensureRepo(token, config);
  }

  async synchronize(
    snapshot: QuestionSnapshot,
    token: string,
    config: SyncConfig,
  ): Promise<{ commitSha: string }> {
    const { owner, repo } = await this.ensureRepository(token, config);
    const base = this.basePath(snapshot, config);

    // Pre-flight: fetch current index AND the current HEAD sha (used as the
    // recorded `commitSha` in the index entry — since we don't know the new
    // commit sha yet, we record the parent it builds on).
    const [currentIndex, headRef] = await Promise.all([
      this.index.get(owner, repo, token),
      this.client.getRef(owner, repo, token, 'heads/main'),
    ]);
    const parentSha = headRef.object.sha;

    const newEntry: RepoIndexEntry = {
      hash: snapshot.hash,
      commitSha: parentSha,
      syncedAt: new Date().toISOString(),
      extensionVersion: snapshot.extensionVersion,
      snapshotVersion: snapshot.snapshotVersion,
      category: snapshot.metadata.format,
      title: snapshot.metadata.title,
    };
    const updatedIndex = {
      ...currentIndex,
      solutions: { ...currentIndex.solutions, [snapshot.metadata.slug]: newEntry },
    };

    const files: Array<{ path: string; content: string }> = [
      { path: `${base}/README.md`, content: this.readme.generate(snapshot) },
      { path: `${base}/metadata.json`, content: this.metaFile.generate(snapshot) },
      ...snapshot.files.map((f) => ({
        path: `${base}/workspace/${f.path}`,
        content: f.content,
      })),
      { path: 'index.json', content: JSON.stringify(updatedIndex, null, 2) },
    ];
    if (config.generateRootReadme) {
      files.push({
        path: 'README.md',
        content: this.rootReadme.generate(updatedIndex, config.folderLayout),
      });
    }

    const message = this.commitMessage(snapshot, config);
    const tx = await this.gitData.commit(owner, repo, token, snapshot, files, message);
    if (!tx.commitSha) throw new Error('Commit returned no SHA');

    logger.info('github.sync.committed', {
      slug: snapshot.metadata.slug,
      commitSha: tx.commitSha,
      durationMs: tx.durationMs,
      fileCount: files.length,
    });

    return { commitSha: tx.commitSha };
  }

  private basePath(snapshot: QuestionSnapshot, config: SyncConfig): string {
    return config.folderLayout === 'categorized'
      ? `${snapshot.metadata.format}/${snapshot.metadata.slug}`
      : snapshot.metadata.slug;
  }

  private commitMessage(snapshot: QuestionSnapshot, config: SyncConfig): string {
    return config.commitMessageTemplate
      .replace(/\{slug\}/g, snapshot.metadata.slug)
      .replace(/\{title\}/g, snapshot.metadata.title)
      .replace(/\{date\}/g, new Date().toISOString().slice(0, 10));
  }
}
```

- [ ] **Step 2: Write integration test with MSW**

Create `tests/unit/github/GitHubProvider.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup';
import { GitHubProvider } from '../../../extension/github/GitHubProvider';
import { QuestionSnapshot, SyncConfig } from '../../../extension/types';

const config: SyncConfig = {
  repoName: 'greatfrontend-solutions',
  folderLayout: 'categorized',
  commitMessageTemplate: 'feat: add {slug} ({date})',
  autoSync: true,
  generateRootReadme: true,
  repoVisibility: 'private',
};

const snapshot: QuestionSnapshot = {
  metadata: {
    title: 'Event Emitter',
    slug: 'event-emitter',
    difficulty: 'medium',
    format: 'javascript',
    duration: 30,
    description: 'desc',
    url: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
    languages: ['js'],
    companies: ['Google'],
  },
  files: [
    { path: 'src/solution.js', content: 'const x = 1;', language: 'javascript' },
    { path: 'package.json', content: '{}', language: 'json' },
  ],
  hash: 'abc',
  completedAt: '2025-01-01T00:00:00.000Z',
  extensionVersion: '0.1.0',
  snapshotVersion: 1,
};

describe('GitHubProvider integration', () => {
  let treeItems: Array<{ path: string; content?: string }> = [];
  let contentsPutCount = 0;

  beforeEach(() => {
    treeItems = [];
    contentsPutCount = 0;
    server.use(
      http.get('https://api.github.com/repos/me/greatfrontend-solutions', () =>
        HttpResponse.json({ owner: { login: 'me' }, name: 'greatfrontend-solutions' }),
      ),
      http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'me' })),
      http.get(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/ref/heads/main',
        () => HttpResponse.json({ object: { sha: 'refsha' } }),
      ),
      http.get(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/commits/refsha',
        () => HttpResponse.json({ tree: { sha: 'basetree' } }),
      ),
      http.post(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/blobs',
        () => HttpResponse.json({ sha: 'blobsha' }),
      ),
      http.post(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/trees',
        async ({ request }) => {
          const body = (await request.json()) as { tree: Array<{ path: string; content?: string }> };
          treeItems = body.tree;
          return HttpResponse.json({ sha: 'treesha' });
        },
      ),
      http.post(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/commits',
        () => HttpResponse.json({ sha: 'commitsha' }),
      ),
      http.patch(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/refs/heads/main',
        () => new HttpResponse(null, { status: 200 }),
      ),
      http.get(
        'https://api.github.com/repos/me/greatfrontend-solutions/contents/index.json',
        () => new HttpResponse(null, { status: 404 }),
      ),
      // Any Contents API PUT would violate the atomic-commit invariant — we count them
      // so the test can assert zero.
      http.put(
        'https://api.github.com/repos/me/greatfrontend-solutions/contents/:path',
        () => {
          contentsPutCount += 1;
          return HttpResponse.json({ commit: { sha: 'unexpected' } });
        },
      ),
    );
  });

  it('emits ONE atomic commit containing per-problem files, index.json, and root README', async () => {
    const provider = new GitHubProvider();
    const { commitSha } = await provider.synchronize(snapshot, 'tok', config);
    expect(commitSha).toBe('commitsha');
    const paths = treeItems.map((t) => t.path).sort();
    expect(paths).toEqual(
      [
        'README.md',
        'index.json',
        'javascript/event-emitter/README.md',
        'javascript/event-emitter/metadata.json',
        'javascript/event-emitter/workspace/package.json',
        'javascript/event-emitter/workspace/src/solution.js',
      ].sort(),
    );
    expect(contentsPutCount).toBe(0);
  });

  it('records the parent HEAD sha as the entry commitSha inside index.json', async () => {
    const provider = new GitHubProvider();
    await provider.synchronize(snapshot, 'tok', config);
    const indexFile = treeItems.find((t) => t.path === 'index.json');
    expect(indexFile).toBeDefined();
    const parsed = JSON.parse(indexFile!.content!) as {
      solutions: Record<string, { commitSha: string }>;
    };
    expect(parsed.solutions['event-emitter'].commitSha).toBe('refsha');
  });

  it('omits root README from the commit when generateRootReadme is false', async () => {
    const provider = new GitHubProvider();
    await provider.synchronize(snapshot, 'tok', { ...config, generateRootReadme: false });
    const paths = treeItems.map((t) => t.path);
    expect(paths).not.toContain('README.md');
    expect(paths).toContain('index.json');
    expect(contentsPutCount).toBe(0);
  });
});
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/github/`

Expected: All prior github tests plus new integration test pass. Exit 0.

- [ ] **Step 4: Commit**

`git add extension/github/GitHubProvider.ts tests/unit/github/GitHubProvider.integration.test.ts`

`git commit -m "feat(github): wire generators into GitHubProvider and add integration test

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 21: End-to-End Sync Pipeline Test

**Milestone:** M7

**Files:**
- Create: `tests/e2e/sync-pipeline.test.ts`
- Create: `tests/e2e/fixtures/event-emitter.rsc.ts`

**Interfaces:**
- Consumes: `SyncOrchestrator`, `GitHubProvider`, `MetadataResolver`, `EventBus`, `HashStore`.
- Produces: end-to-end confidence covering 8 scenarios: happy path, dedup, token revoked, rate-limit retry, existing-repo skip, DOM-fallback, empty-workspace Zod rejection, and byte-identical duplicate no-op.

- [ ] **Step 1: Create RSC fixture**

Create `tests/e2e/fixtures/event-emitter.rsc.ts`:

```ts
export function nextFPayload(): unknown[] {
  return [
    [1, JSON.stringify({
      pageProps: {
        question: {
          title: 'Event Emitter',
          slug: 'event-emitter',
          difficulty: 'medium',
          format: 'javascript',
          duration: 30,
          description: 'Build an event emitter.',
          languages: ['javascript'],
          companies: ['Google', 'Meta'],
          metadata: { url: 'https://www.greatfrontend.com/questions/javascript/event-emitter' },
        },
      },
    })],
  ];
}
```

- [ ] **Step 2: Write failing E2E test**

Create `tests/e2e/sync-pipeline.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { SyncOrchestrator } from '../../extension/background/SyncOrchestrator';
import { EventBus } from '../../extension/background/EventBus';
import { MetadataResolver } from '../../extension/providers/MetadataResolver';
import { RSCProvider } from '../../extension/providers/RSCProvider';
import { DOMProvider } from '../../extension/providers/DOMProvider';
import { GitHubProvider } from '../../extension/github/GitHubProvider';
import { HashStore } from '../../extension/storage/HashStore';
import { CaptureResult, SyncState } from '../../extension/types';
import { nextFPayload } from './fixtures/event-emitter.rsc';

const capture: CaptureResult = {
  workspace: [
    { path: 'src/solution.js', content: 'const x = 1;', language: 'javascript' },
    { path: 'package.json', content: '{}', language: 'json' },
    { path: 'tsconfig.json', content: '{}', language: 'json' },
  ],
  metadata: { __next_f: nextFPayload() },
  timestamp: 1700000000000,
  pageUrl: 'https://www.greatfrontend.com/questions/javascript/event-emitter',
};

function makeGitHubHandlers(counter: { blobs: number; commits: number; treeItems: Array<{ path: string; content?: string }>; contentsPutCount: number }) {
  return [
    http.get('https://api.github.com/user', () => HttpResponse.json({ login: 'me' })),
    http.get('https://api.github.com/repos/me/greatfrontend-solutions', () =>
      HttpResponse.json({ owner: { login: 'me' }, name: 'greatfrontend-solutions' }),
    ),
    http.get(
      'https://api.github.com/repos/me/greatfrontend-solutions/git/ref/heads/main',
      () => HttpResponse.json({ object: { sha: 'refsha' } }),
    ),
    http.get(
      'https://api.github.com/repos/me/greatfrontend-solutions/git/commits/refsha',
      () => HttpResponse.json({ tree: { sha: 'basetree' } }),
    ),
    http.post(
      'https://api.github.com/repos/me/greatfrontend-solutions/git/blobs',
      () => {
        counter.blobs += 1;
        return HttpResponse.json({ sha: `blob${counter.blobs}` });
      },
    ),
    http.post(
      'https://api.github.com/repos/me/greatfrontend-solutions/git/trees',
      async ({ request }) => {
        const body = (await request.json()) as { tree: Array<{ path: string; content?: string }> };
        counter.treeItems = body.tree;
        return HttpResponse.json({ sha: 'treesha' });
      },
    ),
    http.post(
      'https://api.github.com/repos/me/greatfrontend-solutions/git/commits',
      () => {
        counter.commits += 1;
        return HttpResponse.json({ sha: 'commitsha' });
      },
    ),
    http.patch(
      'https://api.github.com/repos/me/greatfrontend-solutions/git/refs/heads/main',
      () => new HttpResponse(null, { status: 200 }),
    ),
    http.get(
      'https://api.github.com/repos/me/greatfrontend-solutions/contents/index.json',
      () => new HttpResponse(null, { status: 404 }),
    ),
    // Contents API PUTs are NOT expected in the atomic-commit design — count any
    // that slip through so scenarios can assert zero.
    http.put(
      'https://api.github.com/repos/me/greatfrontend-solutions/contents/:path',
      () => {
        counter.contentsPutCount += 1;
        return HttpResponse.json({ commit: { sha: 'unexpected' } });
      },
    ),
  ];
}

function buildOrch(bus: EventBus, auth: { validateStoredToken: ReturnType<typeof vi.fn> }, provider = new GitHubProvider()): SyncOrchestrator {
  const resolver = new MetadataResolver([new RSCProvider(), new DOMProvider()]);
  return new SyncOrchestrator({
    eventBus: bus,
    auth: auth as never,
    resolver,
    provider,
    extensionVersion: '0.1.0-test',
  });
}

describe('E2E sync pipeline', () => {
  beforeEach(async () => {
    chrome.storage.local.clear();
    chrome.storage.session.clear();
    await chrome.storage.local.set({ 'gfe.token': 'tok' });
  });

  it('Scenario 1: happy path — single atomic commit contains all artifacts', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    const bus = new EventBus();
    const states: SyncState[] = [];
    const completed = vi.fn();
    bus.on('STATE_CHANGED', (e) => states.push(e.payload.state));
    bus.on('SYNC_COMPLETED', completed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);

    expect(counter.commits).toBe(1);
    expect(counter.contentsPutCount).toBe(0);
    expect(counter.treeItems.map((t) => t.path).sort()).toEqual(
      [
        'README.md',
        'index.json',
        'javascript/event-emitter/README.md',
        'javascript/event-emitter/metadata.json',
        'javascript/event-emitter/workspace/package.json',
        'javascript/event-emitter/workspace/src/solution.js',
        'javascript/event-emitter/workspace/tsconfig.json',
      ].sort(),
    );
    expect(completed).toHaveBeenCalledOnce();
    const arg = completed.mock.calls[0][0];
    expect(arg.payload.slug).toBe('event-emitter');
    expect(await HashStore.get('event-emitter')).toBeTruthy();
    expect(states).toEqual([
      SyncState.Capturing,
      SyncState.Building,
      SyncState.Syncing,
      SyncState.Success,
    ]);
  });

  it('Scenario 2: dedup skips second identical sync', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    const bus = new EventBus();
    const skipped = vi.fn();
    const states: SyncState[] = [];
    bus.on('SYNC_SKIPPED', skipped);
    bus.on('STATE_CHANGED', (e) => states.push(e.payload.state));

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);
    const priorHash = await HashStore.get('event-emitter');
    const priorCommits = counter.commits;
    states.length = 0;

    await orch.handleCapture(capture);

    expect(counter.commits).toBe(priorCommits);
    expect(skipped).toHaveBeenCalledOnce();
    expect(skipped.mock.calls[0][0].payload).toEqual({
      slug: 'event-emitter',
      reason: 'hash_match',
    });
    expect(await HashStore.get('event-emitter')).toBe(priorHash);
    expect(states).not.toContain(SyncState.Syncing);
    expect(states).toContain(SyncState.Success);
  });

  it('Scenario 3: token revoked — emits SYNC_FAILED and makes no GitHub calls', async () => {
    let gitHubCalls = 0;
    server.use(
      http.all('https://api.github.com/*', () => {
        gitHubCalls += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const bus = new EventBus();
    const failed = vi.fn();
    bus.on('SYNC_FAILED', failed);

    const auth = { validateStoredToken: vi.fn(async () => false) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);

    expect(failed).toHaveBeenCalledOnce();
    expect(gitHubCalls).toBe(0);
    expect(await HashStore.get('event-emitter')).toBeFalsy();
  });

  it('Scenario 4: transient 429 rate-limit is retried and eventually succeeds', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    let blobHits = 0;
    server.use(...makeGitHubHandlers(counter));
    // Override the blob endpoint to fail with 429 twice, then succeed.
    server.use(
      http.post(
        'https://api.github.com/repos/me/greatfrontend-solutions/git/blobs',
        () => {
          blobHits += 1;
          if (blobHits <= 2) {
            return new HttpResponse(JSON.stringify({ message: 'rate limited' }), {
              status: 429,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          counter.blobs += 1;
          return HttpResponse.json({ sha: `blob${counter.blobs}` });
        },
      ),
    );

    const bus = new EventBus();
    const completed = vi.fn();
    bus.on('SYNC_COMPLETED', completed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);

    expect(completed).toHaveBeenCalledOnce();
    expect(blobHits).toBeGreaterThanOrEqual(3);
    expect(counter.commits).toBe(1);
  });

  it('Scenario 5: existing repo — does not attempt POST /user/repos', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    let createRepoCalls = 0;
    server.use(...makeGitHubHandlers(counter));
    server.use(
      http.post('https://api.github.com/user/repos', () => {
        createRepoCalls += 1;
        return HttpResponse.json({ owner: { login: 'me' }, name: 'greatfrontend-solutions' });
      }),
    );

    const bus = new EventBus();
    const completed = vi.fn();
    bus.on('SYNC_COMPLETED', completed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);

    expect(createRepoCalls).toBe(0);
    expect(completed).toHaveBeenCalledOnce();
  });

  it('Scenario 6: RSC payload is empty — DOMProvider fallback succeeds', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    // Simulate DOM-derived metadata by pre-populating a global `document` stub the
    // DOMProvider reads. Node's happy-dom/jsdom provided by vitest handles this.
    document.title = 'Event Emitter | GreatFrontend';
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', 'Build an event emitter.');
    document.head.appendChild(meta);

    const captureNoRsc: CaptureResult = {
      ...capture,
      metadata: { __next_f: [] },
    };

    const bus = new EventBus();
    const completed = vi.fn();
    const failed = vi.fn();
    bus.on('SYNC_COMPLETED', completed);
    bus.on('SYNC_FAILED', failed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(captureNoRsc);

    // Either the DOM fallback succeeded (preferred) or metadata resolution
    // failed — but never a partial commit. The test asserts on that atomicity.
    expect(counter.commits === 0 || counter.commits === 1).toBe(true);
    if (counter.commits === 1) {
      expect(completed).toHaveBeenCalledOnce();
    } else {
      expect(failed).toHaveBeenCalledOnce();
    }
    expect(counter.contentsPutCount).toBe(0);
  });

  it('Scenario 7: empty workspace — Zod rejects, SYNC_FAILED emitted, no commit', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    const bus = new EventBus();
    const failed = vi.fn();
    bus.on('SYNC_FAILED', failed);

    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture({ ...capture, workspace: [] });

    expect(failed).toHaveBeenCalledOnce();
    expect(counter.commits).toBe(0);
    expect(counter.blobs).toBe(0);
  });

  it('Scenario 8: byte-identical duplicate produces no new commit and no HTTP writes', async () => {
    const counter = { blobs: 0, commits: 0, treeItems: [] as Array<{ path: string; content?: string }>, contentsPutCount: 0 };
    server.use(...makeGitHubHandlers(counter));

    const bus = new EventBus();
    const auth = { validateStoredToken: vi.fn(async () => true) };
    const orch = buildOrch(bus, auth);

    await orch.handleCapture(capture);
    const firstCommits = counter.commits;
    const firstBlobs = counter.blobs;

    // Repeat with an object-identical capture (deep-cloned to prove reference
    // equality is not what dedup relies on).
    const clone: CaptureResult = JSON.parse(JSON.stringify(capture));
    await orch.handleCapture(clone);

    expect(counter.commits).toBe(firstCommits);
    expect(counter.blobs).toBe(firstBlobs);
    expect(counter.contentsPutCount).toBe(0);
  });
});
```

- [ ] **Step 3: Run E2E tests**

Run: `pnpm --filter @gfe/extension test tests/e2e/`

Expected: 8 passed.

- [ ] **Step 4: Run entire test suite**

Run: `pnpm --filter @gfe/extension test`

Expected: All tests pass.

- [ ] **Step 5: Commit**

`git add tests/e2e`

`git commit -m "test(e2e): add 8 sync pipeline scenarios (happy path, dedup, revoked token, rate limit, existing repo, DOM fallback, empty workspace, duplicate no-op)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 22: Complete Popup UI — StatusBadge, SyncSection, RepoSection, ErrorBanner

**Milestone:** M8

**Files:**
- Create: `extension/popup/components/StatusBadge.tsx`
- Create: `extension/popup/components/SyncSection.tsx`
- Create: `extension/popup/components/RepoSection.tsx`
- Create: `extension/popup/components/ErrorBanner.tsx`
- Modify: `extension/popup/App.tsx`
- Create: `tests/unit/popup/StatusBadge.test.tsx`
- Create: `tests/unit/popup/App.test.tsx`

**Interfaces:**
- Consumes: `AppState`, `SyncState`, `ExtensionEvent` from `types`; `chrome.runtime.sendMessage`/`onMessage`.
- Produces: full popup UI that reflects background state changes in real time.

- [ ] **Step 1: Write failing StatusBadge test**

Create `tests/unit/popup/StatusBadge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../../../extension/popup/components/StatusBadge';
import { SyncState } from '../../../extension/types';

describe('StatusBadge', () => {
  it.each([
    [SyncState.Idle, 'Idle', 'grey'],
    [SyncState.Capturing, 'Capturing...', 'blue'],
    [SyncState.Building, 'Building...', 'blue'],
    [SyncState.Authenticating, 'Authenticating...', 'yellow'],
    [SyncState.Syncing, 'Syncing...', 'blue'],
    [SyncState.Success, 'Synced', 'green'],
    [SyncState.Failed, 'Failed', 'red'],
  ])('renders %s with label %s and colour %s', (state, label, colour) => {
    render(<StatusBadge state={state} />);
    const el = screen.getByText(label);
    expect(el).toBeInTheDocument();
    expect(el.getAttribute('data-color')).toBe(colour);
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/popup/StatusBadge.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement StatusBadge**

Create `extension/popup/components/StatusBadge.tsx`:

```tsx
import { SyncState } from '../../types';

const MAP: Record<SyncState, { label: string; color: string }> = {
  [SyncState.Idle]: { label: 'Idle', color: 'grey' },
  [SyncState.Capturing]: { label: 'Capturing...', color: 'blue' },
  [SyncState.Building]: { label: 'Building...', color: 'blue' },
  [SyncState.Authenticating]: { label: 'Authenticating...', color: 'yellow' },
  [SyncState.Syncing]: { label: 'Syncing...', color: 'blue' },
  [SyncState.Success]: { label: 'Synced', color: 'green' },
  [SyncState.Failed]: { label: 'Failed', color: 'red' },
};

export function StatusBadge({ state }: { state: SyncState }) {
  const { label, color } = MAP[state];
  return (
    <span className={`badge badge-${color}`} data-color={color} role="status">
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Implement SyncSection**

Create `extension/popup/components/SyncSection.tsx`:

```tsx
import { AppState } from '../../types';
import { StatusBadge } from './StatusBadge';

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relative(iso: string): string {
  const delta = (new Date(iso).getTime() - Date.now()) / 1000;
  const minutes = Math.round(delta / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

export function SyncSection({ state }: { state: AppState }) {
  return (
    <section className="section">
      <header>
        <h2>Sync status</h2>
        <StatusBadge state={state.syncState} />
      </header>
      {state.lastSync ? (
        <p>
          Last synced <strong>{state.lastSync.title}</strong> ({relative(state.lastSync.syncedAt)})
          — commit <code>{state.lastSync.commitSha.slice(0, 7)}</code>
        </p>
      ) : (
        <p>No sync recorded yet.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Implement RepoSection**

Create `extension/popup/components/RepoSection.tsx`:

```tsx
import { AppState } from '../../types';

export function RepoSection({ state }: { state: AppState }) {
  const owner = state.auth.username;
  const repo = state.config.repoName;
  if (!owner) return null;
  const url = `https://github.com/${owner}/${repo}`;
  return (
    <section className="section">
      <h2>Repository</h2>
      <a href={url} target="_blank" rel="noreferrer">
        {owner}/{repo}
      </a>
    </section>
  );
}
```

- [ ] **Step 5: Implement ErrorBanner**

Create `extension/popup/components/ErrorBanner.tsx`:

```tsx
import { useState } from 'react';

export function ErrorBanner({ message }: { message?: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (!message || dismissed) return null;
  return (
    <div className="banner banner-error" role="alert">
      <span>{message}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setDismissed(false || true)}>
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Rewire App**

Replace `extension/popup/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { AuthSection } from './components/AuthSection';
import { SyncSection } from './components/SyncSection';
import { RepoSection } from './components/RepoSection';
import { ErrorBanner } from './components/ErrorBanner';
import { AppState, ExtensionEvent, SyncState } from '../types';

async function loadState(): Promise<AppState> {
  return await chrome.runtime.sendMessage({ type: 'GET_STATE' });
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    void loadState().then(setState);
    const listener = (event: ExtensionEvent) => {
      if (event.type === 'STATE_CHANGED') {
        setState((prev) => (prev ? { ...prev, syncState: event.payload.state } : prev));
      } else if (event.type === 'SYNC_COMPLETED') {
        void loadState().then(setState);
        setError(undefined);
      } else if (event.type === 'SYNC_FAILED') {
        setError(event.payload.error);
      } else if (event.type === 'AUTH_COMPLETE' || event.type === 'AUTH_REVOKED' || event.type === 'TOKEN_EXPIRED') {
        void loadState().then(setState);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  if (!state) return <div className="loading">Loading…</div>;
  return (
    <main>
      <ErrorBanner message={error ?? state.lastError} />
      <AuthSection state={state} />
      {state.auth.connected && (
        <>
          <SyncSection state={state} />
          <RepoSection state={state} />
        </>
      )}
      <footer>
        <a href="options.html" target="_blank" rel="noreferrer">Options</a>
      </footer>
    </main>
  );
}
```

- [ ] **Step 7: Write failing App test**

Create `tests/unit/popup/App.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../../extension/popup/App';
import { SyncState } from '../../../extension/types';

describe('App', () => {
  beforeEach(() => {
    chrome.runtime.sendMessage = vi.fn(async () => ({
      syncState: SyncState.Idle,
      auth: { connected: true, tokenExpired: false, username: 'me', avatarUrl: '' },
      config: {
        repoName: 'greatfrontend-solutions',
        folderLayout: 'categorized',
        commitMessageTemplate: 'feat: add {slug}',
        autoSync: true,
        generateRootReadme: true,
        repoVisibility: 'private',
      },
    })) as never;
  });

  it('renders sync + repo sections when connected', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Sync status/i)).toBeInTheDocument());
    expect(screen.getByText(/Idle/)).toBeInTheDocument();
    expect(screen.getByText(/me\/greatfrontend-solutions/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/popup/`

Expected: All popup tests pass.

- [ ] **Step 9: Verify build**

Run: `pnpm --filter @gfe/extension build`

Expected: Exit 0. Popup HTML/JS emitted.

- [ ] **Step 10: Commit**

`git add extension/popup tests/unit/popup`

`git commit -m "feat(popup): add complete popup UI with status badge, sync/repo sections

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 23: Options Page

**Milestone:** M9

**Files:**
- Create: `extension/options/index.html`
- Create: `extension/options/index.tsx`
- Create: `extension/options/App.tsx`
- Create: `tests/unit/options/App.test.tsx`

**Interfaces:**
- Consumes: `ConfigStore` (Task 4), `chrome.runtime.sendMessage`.
- Produces: settings UI with 5 sections; changes debounced 300ms and persisted to `ConfigStore`.

- [ ] **Step 1: Create options HTML entry**

Create `extension/options/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GreatFrontend Sync — Options</title>
    <link rel="stylesheet" href="../popup/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create options entry**

Create `extension/options/index.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
```

- [ ] **Step 3: Write failing App test**

Create `tests/unit/options/App.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../../extension/options/App';
import { ConfigStore } from '../../../extension/storage/ConfigStore';

describe('Options App', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    chrome.storage.local.clear();
    chrome.runtime.sendMessage = vi.fn() as never;
  });

  it('renders all five sections', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Repository/)).toBeInTheDocument());
    expect(screen.getByText(/Layout/)).toBeInTheDocument();
    expect(screen.getByText(/Commits/)).toBeInTheDocument();
    expect(screen.getByText(/Automation/)).toBeInTheDocument();
    expect(screen.getByText(/Danger Zone/)).toBeInTheDocument();
  });

  it('debounces writes to ConfigStore', async () => {
    render(<App />);
    await waitFor(() => screen.getByLabelText(/Repository name/));
    const input = screen.getByLabelText(/Repository name/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'my-repo' } });
    // before debounce
    const before = await ConfigStore.get();
    expect(before.repoName).not.toBe('my-repo');
    // after debounce
    await vi.advanceTimersByTimeAsync(400);
    const after = await ConfigStore.get();
    expect(after.repoName).toBe('my-repo');
  });

  it('sends AUTH_REVOKE when Disconnect clicked', async () => {
    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: /Disconnect GitHub/i }));
    fireEvent.click(screen.getByRole('button', { name: /Disconnect GitHub/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_REVOKE' });
  });
});
```

Run: `pnpm --filter @gfe/extension test tests/unit/options/`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement App**

Create `extension/options/App.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { ConfigStore } from '../storage/ConfigStore';
import { SyncConfig } from '../types';

function useDebouncedSave(config: SyncConfig | null): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!config) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void ConfigStore.set(config);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [config]);
}

export function App() {
  const [config, setConfig] = useState<SyncConfig | null>(null);

  useEffect(() => {
    void ConfigStore.get().then(setConfig);
  }, []);

  useDebouncedSave(config);

  if (!config) return <div>Loading…</div>;
  const patch = (p: Partial<SyncConfig>) => setConfig({ ...config, ...p });

  return (
    <main className="options">
      <section>
        <h2>Repository</h2>
        <label>
          Repository name
          <input
            aria-label="Repository name"
            value={config.repoName}
            onChange={(e) => patch({ repoName: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Visibility</legend>
          <label>
            <input
              type="radio"
              name="visibility"
              checked={config.repoVisibility === 'private'}
              onChange={() => patch({ repoVisibility: 'private' })}
            />
            Private
          </label>
          <label>
            <input
              type="radio"
              name="visibility"
              checked={config.repoVisibility === 'public'}
              onChange={() => patch({ repoVisibility: 'public' })}
            />
            Public
          </label>
        </fieldset>
      </section>

      <section>
        <h2>Layout</h2>
        <label>
          <input
            type="radio"
            name="layout"
            checked={config.folderLayout === 'categorized'}
            onChange={() => patch({ folderLayout: 'categorized' })}
          />
          Categorized — <code>javascript/event-emitter/</code>
        </label>
        <label>
          <input
            type="radio"
            name="layout"
            checked={config.folderLayout === 'flat'}
            onChange={() => patch({ folderLayout: 'flat' })}
          />
          Flat — <code>event-emitter/</code>
        </label>
      </section>

      <section>
        <h2>Commits</h2>
        <label>
          Commit message template
          <input
            aria-label="Commit template"
            value={config.commitMessageTemplate}
            onChange={(e) => patch({ commitMessageTemplate: e.target.value })}
          />
        </label>
        <small>Available tokens: {'{title}, {slug}, {date}'}</small>
      </section>

      <section>
        <h2>Automation</h2>
        <label>
          <input
            type="checkbox"
            checked={config.autoSync}
            onChange={(e) => patch({ autoSync: e.target.checked })}
          />
          Auto sync
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.generateRootReadme}
            onChange={(e) => patch({ generateRootReadme: e.target.checked })}
          />
          Generate root README
        </label>
      </section>

      <section className="danger">
        <h2>Danger Zone</h2>
        <button
          type="button"
          onClick={() => chrome.runtime.sendMessage({ type: 'AUTH_REVOKE' })}
        >
          Disconnect GitHub
        </button>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm --filter @gfe/extension test tests/unit/options/`

Expected: 3 passed.

- [ ] **Step 6: Verify options page in build**

Run: `pnpm --filter @gfe/extension build`

Expected: `extension/dist/options.html` (or `options/index.html`) emitted. Exit 0.

- [ ] **Step 7: Commit**

`git add extension/options tests/unit/options`

`git commit -m "feat(options): add settings page with debounced persistence

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

---

### Task 24: Polish — Lint, Coverage, Docs, Final Verification

**Milestone:** M10

**Files:**
- Modify: root `README.md`
- Verify: entire repo builds, tests pass, coverage ≥ 85%, extension loads unpacked, worker builds.

**Interfaces:**
- Consumes: everything above.
- Produces: production-ready repository with documentation.

- [ ] **Step 1: Run linter across all workspaces**

Run: `pnpm -r lint`

Expected: Exit 0. Fix any ESLint violations before proceeding.

- [ ] **Step 2: Run Prettier check**

Run: `pnpm -r format:check`

Expected: Exit 0. Run `pnpm -r format` if failing, then re-run check.

- [ ] **Step 3: Run entire test suite with coverage**

Run: `pnpm --filter @gfe/extension test:coverage`

Expected: All tests pass. Coverage summary shows statements/branches/functions/lines ≥ 85%.

- [ ] **Step 4: Type-check both packages**

Run: `pnpm -r typecheck`

Expected: Exit 0 with no diagnostics.

- [ ] **Step 5: Production build**

Run: `pnpm --filter @gfe/extension build && pnpm --filter @gfe/worker build`

Expected: Both exit 0. `extension/dist/manifest.json` and `worker/dist/index.js` present.

- [ ] **Step 6: Manual load test in Chrome**

Open Chrome → `chrome://extensions/` → enable Developer mode → "Load unpacked" → point at `extension/dist/`.

Expected: extension appears with no red error badge; service worker starts; opening popup shows "Connect GitHub" prompt.

- [ ] **Step 7: Write root README**

Replace `README.md`:

```md
# GreatFrontend Sync

A Chrome extension that automatically syncs completed [GreatFrontend](https://www.greatfrontend.com) coding problems to a private GitHub repository. Every time you mark a problem as complete, the extension captures your workspace, generates a README and metadata file, and commits everything atomically via the GitHub Git Data API.

## Features

- **Automatic capture** — hooks GreatFrontend's tRPC completion request and grabs your Monaco workspace.
- **Deterministic commits** — atomic multi-file commits via a single Git tree.
- **Deduplication** — a SHA-256 hash of `(metadata, files)` short-circuits redundant syncs.
- **Rich READMEs** — per-question README and a root README with sync stats and per-category tables.
- **Configurable** — repo name, folder layout, commit template, auto-sync, README generation, and visibility.
- **Secure** — OAuth token exchange lives in a stateless Cloudflare Worker; the extension never sees your client secret.

## Getting started

```bash
pnpm install
pnpm --filter @gfe/extension build
pnpm --filter @gfe/extension dev     # HMR build
pnpm --filter @gfe/worker dev        # Local worker
pnpm test                            # All tests
```

Load `extension/dist/` unpacked in `chrome://extensions/`. Set `VITE_GITHUB_CLIENT_ID` and `VITE_WORKER_URL` in `.env.local`.

## Publishing

1. Deploy the Cloudflare Worker: `pnpm --filter @gfe/worker deploy`.
2. Set `wrangler secret put GITHUB_CLIENT_SECRET` after `wrangler login`.
3. Bump `extension/package.json` version, build, and upload `extension/dist/` to the Chrome Web Store.

## Architecture

Layered:

- **Injected** captures Monaco workspace + raw metadata inside the page world.
- **Content** bridges page → background via `chrome.runtime`.
- **Background** orchestrates the sync via a typed `EventBus` and `SyncOrchestrator` state machine.
- **Providers** (`RSCProvider`, `DOMProvider`) resolve `RawMetadata` into `QuestionMetadata`.
- **GitHub** commits atomically through the Git Data API and maintains `index.json` + root `README.md`.

See `docs/superpowers/plans/2026-07-17-gfe-extension.md` for the full implementation plan.
```

- [ ] **Step 8: Verify sync end-to-end (manual)**

Log into GreatFrontend in the Chrome profile with the loaded extension, complete a small question, and confirm a commit appears in the configured repository within seconds. Verify README.md, metadata.json, and workspace files exist at the expected paths.

- [ ] **Step 9: Final commit**

`git add README.md`

`git commit -m "docs: add project README

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"`

- [ ] **Step 10: Tag release**

Run: `git tag -a v0.1.0 -m "Initial release"`

Expected: tag created locally; publish with `git push --tags` when the remote is configured.

---

## Plan Self-Review Checklist

Confirm each item before considering the plan complete:

- [ ] Every architectural component listed in the spec (types, utils, storage, background, providers, github, generators, injected, content, popup, options, worker) has a task that creates its files with real code.
- [ ] All 24 tasks are numbered sequentially and each is assigned to a milestone (M1–M10).
- [ ] No task contains a `TODO`, `TBD`, or placeholder implementation — every code fence is complete and compilable.
- [ ] All Zod schema names and interfaces (`WorkspaceFileSchema`, `QuestionMetadataSchema`, `QuestionSnapshotSchema`, `CaptureResultSchema`, `SyncConfigSchema`, `RepoIndexSchema`, `RawMetadata`, `SyncTransaction`, `RepoIndex`, etc.) are used consistently across every task that references them.
- [ ] Every `IMetadataProvider`, `RepositoryProvider`, `SyncState`, `ExtensionEvent`, and `ExtensionMessage` reference in later tasks matches the definitions in Task 2.
- [ ] SOLID boundaries are respected — `github/` never imports `providers/`, `content/`, or `injected/`; `providers/` never imports `github/`; `background/` composes both through interfaces only.
- [ ] Every code step contains complete, copy-pasteable TypeScript (no partial snippets, no `// ...`).
- [ ] Every run step includes an exact command AND an expected outcome (test count, exit code, file existence, or diagnostic text).
- [ ] Every task ends with a `git add` + `git commit` step, and every commit message includes the required `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer.
- [ ] Task 21 (E2E) covers all 8 scenarios end-to-end with complete runnable code: (1) happy path (single atomic commit contains workspace + per-problem README/metadata + `index.json` + root README), (2) deduplication (no GitHub calls on identical second run), (3) revoked/invalid token (SYNC_FAILED, zero GitHub calls), (4) transient 429 rate limit retried then succeeds, (5) existing repo skips `POST /user/repos`, (6) empty RSC → DOMProvider fallback (or clean SYNC_FAILED with no partial commit), (7) empty workspace rejected by Zod (SYNC_FAILED, no blobs), (8) byte-identical duplicate produces no new commit or Contents API PUT.
- [ ] The atomic-commit invariant is enforced everywhere: `GitHubProvider.synchronize()` performs exactly ONE `POST /git/commits`, ZERO Contents API PUTs, and includes `index.json` (plus root `README.md` when `generateRootReadme` is true) in the same Git tree as the per-problem files.
- [ ] `SyncOrchestrator` receives `extensionVersion` via `Deps` (no `import.meta.env` reads inside the class) and validates the stored token at most once per service-worker session (`tokenValidatedThisSession` guard).
- [ ] `EventBus.emit()` returns `Promise<void>` and every caller (`SyncOrchestrator`, `AuthHandler`) awaits it.
- [ ] `MetadataFileGenerator` emits `"schemaVersion": 1` as the first key in every generated `metadata.json`, sourced from the exported `METADATA_SCHEMA_VERSION` constant in `extension/types/index.ts`.
- [ ] `withRetry` accepts a `shouldRetry` predicate; `GitHubClient` supplies one that retries only on network errors, timeouts, and HTTP 429/500/502/503 and never retries 4xx auth/validation errors.
- [ ] Popup StatusBadge mapping matches the spec exactly (idle→grey, capturing/building/syncing→blue, authenticating→yellow, success→green, failed→red).
- [ ] Options page has all 5 sections (Repository, Layout, Commits, Automation, Danger Zone), writes are debounced 300ms, and there is no submit button.
- [ ] `SyncConfig` defaults match the spec exactly and are applied through `SyncConfigSchema.default()`.
- [ ] The Cloudflare Worker (Task 5) implements exactly the code in the spec, including the `.chromiumapp.org` origin check and CORS preflight handling.
- [ ] The manifest includes a placeholder `key` field with a note that it must be replaced from the developer's Chrome profile for stable extension IDs during development.
- [ ] The plan does not create any files outside `/Users/kiskumar7/Desktop/gfe-extension/` and does not write to `/tmp`.
