# GreatFrontend Sync Extension — Design Specification

**Date:** 2026-07-17  
**Status:** Approved  
**Version:** 1.3

---

## Overview

A production-quality Chrome Extension (Manifest V3) that automatically synchronizes completed GreatFrontend problems to a GitHub repository. Zero manual interaction after authentication. Every completion event triggers a full workspace capture and atomic GitHub sync.

**Stack:** TypeScript · React · Vite · @crxjs/vite-plugin · pnpm · ESLint · Prettier · Vitest · Zod  
**Backend:** Single stateless Cloudflare Worker (token exchange only)

---

## Core Data Model

All modules either produce or consume `QuestionSnapshot`. It is the single shared contract.

```typescript
interface QuestionSnapshot {
  metadata: QuestionMetadata;
  files: WorkspaceFile[];
  hash: string;            // SHA-256 of JSON.stringify({ metadata, files }) — excludes timestamps
  completedAt: string;     // ISO 8601
  extensionVersion: string;
  snapshotVersion: number; // incremented when snapshot schema changes; enables forward-compatible migrations
}

interface QuestionMetadata {
  title: string;
  slug: string;
  difficulty: string;     // 'easy' | 'medium' | 'hard'
  format: string;         // 'javascript' | 'react' | 'user-interface'
  duration: number;       // minutes
  description: string;    // full problem description (markdown)
  url: string;            // canonical GreatFrontend URL — always stored for deep linking
  languages: string[];
  companies: string[];
}

interface WorkspaceFile {
  path: string;           // preserves original directory structure, e.g. "src/App.js"
  content: string;
  language: string;       // Monaco language identifier
}

interface CaptureResult {
  workspace: WorkspaceFile[];  // Monaco files — always captured first
  metadata: RawMetadata;       // raw __next_f / DOM snapshot
  timestamp: number;           // Date.now() at capture time
  pageUrl: string;             // location.href at capture time
}
```

**Hash computation:** `SHA256(JSON.stringify({ metadata, files }))` — excludes `completedAt`, `extensionVersion`, `snapshotVersion`, and `hash` itself. Identical solutions at different times produce the same hash, making re-sync a reliable no-op.

**`snapshotVersion`** starts at `1` and is a static constant in `types/`. It must be incremented whenever the `QuestionSnapshot` shape changes in a breaking way. All stored snapshots carry their version so that future migration logic can handle older formats without data loss.

All interfaces and their Zod schemas live in `extension/types/index.ts`. Zod schemas are the authoritative validators; TypeScript types are inferred from them with `z.infer<>`.

---

## Architecture

### Physical Layers

| Layer | Location | JS Context | Responsibility |
|---|---|---|---|
| Page context | `injected/` | Page window | Fetch interception, Monaco reading, RSC metadata extraction |
| Content script | `content/` | Content script | Bridge: page ↔ background |
| Background | `background/` | Service worker | Auth, sync orchestration, message routing, event bus, state machine |
| Popup | `popup/` | Extension page | Status display, connect/disconnect, reconnect — reflects SyncState |
| Options | `options/` | Extension page | User configuration |
| Worker | `worker/` | Cloudflare edge | OAuth code → token exchange |

### SOLID Boundaries

- `github/` imports only from `types/` and `utils/`. Never from `providers/`, `content/`, or `injected/`.
- `providers/` imports only from `types/` and `utils/`. Never from `github/`.
- `background/` depends on both through the `QuestionSnapshot` interface and the `IMetadataProvider` / `RepositoryProvider` interfaces only.
- All cross-module dependencies flow through interfaces defined in `types/`.
- Dependency inversion: `background/SyncOrchestrator` depends on `IMetadataProvider` and `RepositoryProvider` interfaces, not concrete implementations.

### Sync State Machine

The background service worker maintains an explicit `SyncState` enum. The popup is a pure reflection of this state — it does not infer status from events.

```typescript
enum SyncState {
  Idle         = 'idle',
  Capturing    = 'capturing',
  Building     = 'building',      // building snapshot
  Authenticating = 'authenticating',
  Syncing      = 'syncing',
  Success      = 'success',
  Failed       = 'failed',
}
```

State transitions are managed by `SyncOrchestrator`. The current state is stored in memory (service worker lifecycle) and sent to the popup on `GET_STATE` requests and on every transition via EventBus.

### Internal Event Bus

All pipeline stages communicate through a typed internal `EventBus` (in `background/EventBus.ts`) rather than direct method calls. This decouples the pipeline and makes future features (notifications, analytics, multiple providers) straightforward to add.

**Typed events:**

```typescript
type ExtensionEvent =
  | { type: 'QUESTION_COMPLETED';  payload: CaptureResult }
  | { type: 'SNAPSHOT_CREATED';    payload: { snapshot: QuestionSnapshot } }
  | { type: 'SYNC_STARTED';        payload: { slug: string } }
  | { type: 'SYNC_COMPLETED';      payload: { slug: string; commitSha: string; duration: number; fileCount: number } }
  | { type: 'SYNC_FAILED';         payload: { slug?: string; error: string } }
  | { type: 'SYNC_SKIPPED';        payload: { slug: string; reason: 'hash_match' } }
  | { type: 'STATE_CHANGED';       payload: { state: SyncState } }
  | { type: 'AUTH_COMPLETE';       payload: { username: string; avatarUrl: string } }
  | { type: 'AUTH_FAILED';         payload: { error: string } }
  | { type: 'AUTH_REVOKED';        payload: Record<string, never> }
  | { type: 'TOKEN_EXPIRED';       payload: Record<string, never> };
```

`EventBus` is a simple pub/sub: `emit(event)`, `on(type, handler)`, `off(type, handler)`. The bus bridges to `chrome.runtime.sendMessage` for events that need to reach the popup.

### Communication Channels

```
injected/ → window.postMessage({ type: 'GFE_COMPLETE', ...CaptureResult }) → content/
content/ → chrome.runtime.sendMessage({ type: 'QUESTION_COMPLETED', payload: CaptureResult }) → background/
background/ → EventBus.emit(event) → internal subscribers
background/ → chrome.runtime.sendMessage(event) → popup/ (bridged from EventBus)
popup/ → chrome.runtime.sendMessage({ type: 'GET_STATE' }) → background/
popup/ → chrome.runtime.sendMessage({ type: 'AUTH_START' }) → background/
```

---

## Module Specifications

### `types/` — Shared Contracts

Single file: `extension/types/index.ts`

Contains:
- All TypeScript interfaces: `QuestionSnapshot`, `QuestionMetadata`, `WorkspaceFile`, `CaptureResult`, `RawMetadata`, `SyncResult`, `SyncConfig`, `AppState`, `SyncTransaction`, `ExtensionEvent`, `RepositoryProvider`, `IMetadataProvider`
- `SyncState` enum
- Corresponding Zod schemas for runtime validation
- Message type union for type-safe `chrome.runtime` messaging
- Error type hierarchy: `GfeError`, `MonacoUnavailableError`, `MetadataUnavailableError`, `GitHubApiError`, `AuthError`
- `SNAPSHOT_VERSION = 1` constant
- `METADATA_SCHEMA_VERSION = 1` constant (stamped into every generated `metadata.json` for forward compatibility)

No logic. No imports from other extension modules. Pure type definitions and validators.

---

### `injected/` — Page Context Scripts

Injected into the page DOM by the content script via `<script src="chrome-extension://<id>/injected.js">`. Runs in the **page's JavaScript context** — has access to `window.fetch`, `window.monaco`, and `self.__next_f`.

**`FetchInterceptor`**

Wraps `window.fetch` at load time (before page scripts run). Intercepts responses to URLs matching `/api/trpc/questionProgress.add`. On successful response, reads JSON body; if the tRPC envelope contains `status: "complete"` anywhere in the result, dispatches `new CustomEvent('GFE_COMPLETE')` on `window`. The original fetch is always called and its response is returned unmodified. Idempotent — safe to run multiple times.

tRPC response shape to match:
```json
{ "result": { "data": { "json": { "status": "complete" } } } }
```

**`MonacoExtractor`**

Called **first** upon `GFE_COMPLETE` — before any metadata extraction. The workspace must be captured immediately while Monaco models are guaranteed to be present. Reads `monaco.editor.getModels()`. For each model:
- `uri.path` → `WorkspaceFile.path` (preserves directory structure: `src/App.js`, `package.json`, etc.)
- `getValue()` → `WorkspaceFile.content`
- `getLanguageId()` → `WorkspaceFile.language`

Returns all files, not only user-authored files. If `window.monaco` is undefined, throws `MonacoUnavailableError`.

**`RawMetadataCapture`**

Called after `MonacoExtractor` succeeds. Reads `self.__next_f` (a Next.js RSC payload array) and returns it as an opaque `RawMetadata` blob. Fallback: if `__next_f` is empty or undefined, collects a structured DOM snapshot: `{ title: h1.textContent, difficulty: '.difficulty-badge'.textContent, duration: '.duration'.textContent, description: '.prose'.innerHTML, url: location.href }`.

**`injected/index.ts`** — Entry point. Instantiates `FetchInterceptor`. On `GFE_COMPLETE`:
1. Call `MonacoExtractor.extract()` → `WorkspaceFile[]` **(workspace first)**
2. Call `RawMetadataCapture.capture()` → `RawMetadata`
3. Build `CaptureResult`: `{ workspace, metadata: rawMetadata, timestamp: Date.now(), pageUrl: location.href }`
4. `window.postMessage({ type: 'GFE_COMPLETE', ...captureResult })`

---

### `content/` — Content Script Bridge

Matches `https://www.greatfrontend.com/*`.

**`PageBridge`**

On load: injects `injected.js` by appending a `<script>` tag with `src = chrome.runtime.getURL('injected.js')`.

Listens for `window.addEventListener('message', ...)` where `event.data.type === 'GFE_COMPLETE'`. Validates origin. Reconstructs `CaptureResult` from `event.data` and forwards to background:
```
chrome.runtime.sendMessage({ type: 'QUESTION_COMPLETED', payload: captureResult })
```

No transformation, validation, or business logic beyond origin checking.

---

### `background/` — Service Worker

**`EventBus`** (`background/EventBus.ts`)

Simple typed pub/sub. `emit(event: ExtensionEvent): Promise<void>`, `on<T extends ExtensionEvent['type']>(type, handler)`, `off(type, handler)`. `emit` awaits each registered handler in sequence (synchronous handlers still work — a `void` return is trivially awaitable). Bridges to `chrome.runtime.sendMessage` for events that need to reach the popup. Singleton within the service worker lifecycle. All callers must `await bus.emit(...)`.

**`MessageRouter`**

Central `chrome.runtime.onMessage` handler. Routes by message type to the appropriate handler. Returns typed responses. Handles: `QUESTION_COMPLETED`, `AUTH_START`, `AUTH_REVOKE`, `GET_STATE`.

**`AuthHandler`**

Manages the GitHub OAuth flow. Token validation occurs at two points:
1. **On extension startup** — `validateStoredToken()` detects expired/revoked tokens before any sync attempt.
2. **Before the first sync of each service worker session** — a lightweight `GET /user` check runs immediately before `SyncOrchestrator` begins, so tokens revoked after startup are caught before touching the GitHub API. This pre-sync check runs **at most once per service worker session**; `SyncOrchestrator` caches the validated flag in memory and skips the check on subsequent captures until the service worker is restarted or the token changes.

`startAuth()`:
1. Generate cryptographically random `state` nonce via `crypto.getRandomValues`
2. Store nonce in `chrome.storage.session` (session only, not persisted)
3. Build GitHub authorize URL: `https://github.com/login/oauth/authorize?client_id=<ID>&redirect_uri=<chromiumapp.org>&scope=repo&state=<nonce>`
4. Call `chrome.identity.launchWebAuthFlow({ url, interactive: true })`
5. Parse returned redirect URL, extract `code` and `state`
6. Validate `state` matches stored nonce
7. POST to Cloudflare Worker: `{ code }`
8. Receive `{ access_token }`, store in `chrome.storage.local` under `gfe.token`
9. Fetch GitHub user info (`GET /user`) to confirm token validity, store username/avatar
10. `EventBus.emit({ type: 'AUTH_COMPLETE', payload: { username, avatarUrl } })`

`validateStoredToken()`: Fetches `GET /user` with the stored token. On 401 → deletes token, emits `TOKEN_EXPIRED` so popup shows `ReconnectView`. On success → refreshes stored username/avatarUrl.

`revokeAuth()`: Deletes `gfe.token` from storage. Clears all cached auth state. Emits `AUTH_REVOKED`.

**`SyncOrchestrator`**

Implements the sync pipeline. All collaborators are injected through the constructor — the orchestrator never imports concrete singletons. This makes every branch of the pipeline testable in isolation.

```typescript
interface SyncOrchestratorDeps {
  eventBus: EventBus;
  auth: Pick<AuthHandler, 'validateStoredToken'>;
  resolver: Pick<MetadataResolver, 'getMetadata'>;
  provider: RepositoryProvider;
  logger: typeof logger;          // explicit — no module-level import
  extensionVersion: string;       // resolved once at wiring time
}

class SyncOrchestrator {
  private tokenValidatedThisSession = false;
  constructor(private readonly deps: SyncOrchestratorDeps) {}
  // …
}
```

Owns the `SyncState` machine — transitions state and emits `STATE_CHANGED` on every step. On the first `handleCapture` call in a service worker session, calls `deps.auth.validateStoredToken()` and stores the result in `tokenValidatedThisSession`. Subsequent captures skip the network validation.

Pipeline steps:
1. Receive `CaptureResult` from content script
2. Transition to `SyncState.Capturing`; emit `STATE_CHANGED`
3. Zod validate `captureResult.workspace` as `WorkspaceFile[]`
4. Validate token via `AuthHandler.validateStoredToken()` (pre-sync check); transition to `SyncState.Authenticating` if needed
5. Transition to `SyncState.Building`; emit `STATE_CHANGED`
6. `IMetadataProvider.getMetadata(captureResult.metadata)` → `QuestionMetadata`
7. Build partial snapshot: `{ metadata, files: captureResult.workspace, completedAt: new Date().toISOString(), extensionVersion, snapshotVersion: SNAPSHOT_VERSION }`
8. Compute hash: `Hash.sha256(JSON.stringify({ metadata, files }))`
9. Set `snapshot.hash = hash`
10. Validate full snapshot with `QuestionSnapshotSchema.parse(snapshot)` — throws on invalid
11. `EventBus.emit({ type: 'SNAPSHOT_CREATED', payload: { snapshot } })`
12. Check dedup: `HashStore.get(slug)`. If hash matches → emit `SYNC_SKIPPED`, transition to `SyncState.Success`, return
13. Transition to `SyncState.Syncing`; `EventBus.emit({ type: 'SYNC_STARTED', payload: { slug } })`
14. `RepositoryProvider.synchronize(snapshot, token, config)` → `{ commitSha }`
15. `EventBus.emit({ type: 'SYNC_COMPLETED', payload: { slug, commitSha, duration, fileCount } })`
16. Transition to `SyncState.Success`; emit `STATE_CHANGED`
17. `HashStore.set(slug, hash)` in `chrome.storage.local`
18. `ExtensionStorage.setLastSync({ slug, commitSha, syncedAt })`

Errors at any step: set `SyncState.Failed`, log at `error` level, `EventBus.emit({ type: 'SYNC_FAILED', payload: { slug, error } })`.

---

### `providers/` — Metadata Providers

Isolates all GreatFrontend-specific knowledge behind a clean interface. Adding a new extraction strategy requires only a new class implementing `IMetadataProvider` — no changes to `background/` or any other module.

**`IMetadataProvider` interface**

```typescript
interface IMetadataProvider {
  canHandle(raw: RawMetadata): boolean;
  getMetadata(raw: RawMetadata): Promise<QuestionMetadata>;
}
```

`canHandle()` allows `MetadataResolver` to select the right provider without attempting a parse. `getMetadata()` is async to support future providers that make network calls. The pipeline does not know or care whether the provider uses React Flight, DOM, or something else.

**`RSCProvider`**

Implements `IMetadataProvider`. `canHandle()` returns `true` if `raw.__next_f` is a non-empty array. `getMetadata()` walks the RSC payload looking for an object matching the `QuestionMetadata` shape. If GreatFrontend changes its RSC structure, only this class changes.

**`DOMProvider`**

Implements `IMetadataProvider`. `canHandle()` returns `true` if `raw.domSnapshot` is present. `getMetadata()` maps DOM text content to `QuestionMetadata` fields. Throws `MetadataUnavailableError` if required fields (title, slug) are missing.

**`MetadataResolver`**

Composes an ordered list of `IMetadataProvider[]`. For each provider: calls `canHandle(raw)` first; if `true`, calls `getMetadata(raw)`. Returns the first successful result. If no provider can handle the input or all throw, rethrows the last error as `MetadataUnavailableError`. Used by `SyncOrchestrator` via constructor injection.

The name `MetadataResolver` reflects that it resolves metadata using multiple strategies — not merely selects a parser.

---

### `github/` — GitHub API Client

No GreatFrontend knowledge. All methods are pure functions of `{ owner, repo, token }` plus operation-specific parameters.

**`RepositoryProvider` interface** (in `types/`)

```typescript
interface RepositoryProvider {
  ensureRepository(token: string, config: SyncConfig): Promise<{ owner: string; repo: string }>;
  synchronize(snapshot: QuestionSnapshot, token: string, config: SyncConfig): Promise<{ commitSha: string }>;
}
```

Abstracting behind this interface means adding GitLab support later requires only a new `GitLabProvider` class — zero changes to `background/` or `types/`.

**`GitHubProvider`**

Implements `RepositoryProvider`. Composes `GitHubClient`, `GitDataService`, `RepoManager`, `IndexManager`, `RootReadmeGenerator`. The single entry point for all GitHub operations from the background.

**`GitHubClient`**

Low-level REST client. Uses native `fetch`. All methods return typed results or throw `GitHubApiError` with `status` and `message`.

Methods:
- `getRepo(owner, repo, token)` → repo info or null
- `createRepo(token, { name, private: true, description })` → repo info
- `getRef(owner, repo, token, ref)` → `{ sha }`
- `createBlob(owner, repo, token, content, encoding)` → `{ sha }`
- `createTree(owner, repo, token, baseTreeSha, items)` → `{ sha }`
- `createCommit(owner, repo, token, { message, treeSha, parentShas })` → `{ sha }`
- `updateRef(owner, repo, token, ref, sha)` → void
- `getContents(owner, repo, token, path)` → `{ content, sha }` (base64 decoded)
- `createOrUpdateFile(owner, repo, token, path, { message, content, sha? })` → `{ commitSha }`

Rate limiting: on 403 or 429, read `Retry-After` header (seconds). Fall back to `utils/Retry` exponential backoff: 1s, 2s, 4s, max 3 retries. After 3 failures, throw `GitHubApiError` with `rateLimited: true`.

**`SyncTransaction`** (in `types/`)

Represents an in-progress Git Data API operation. Makes debugging significantly easier — the full state of a sync is inspectable at any point.

```typescript
interface SyncTransaction {
  snapshot: QuestionSnapshot;
  blobs: Array<{ path: string; sha: string }>;
  treeSha: string | null;
  commitSha: string | null;
  status: 'pending' | 'blobs_created' | 'tree_created' | 'committed' | 'failed';
  startedAt: string;       // ISO 8601
  finishedAt?: string;     // ISO 8601 — set on committed or failed
  durationMs?: number;     // finishedAt - startedAt in ms
}
```

**`GitDataService`**

Implements the atomic commit flow using `SyncTransaction` to track progress:

1. Init transaction: `{ snapshot, blobs: [], treeSha: null, commitSha: null, status: 'pending', startedAt: new Date().toISOString() }`
2. `GET /repos/{owner}/{repo}/git/refs/heads/main` → head SHA
3. `GET /repos/{owner}/{repo}/git/commits/{headSha}` → base tree SHA
4. `createBlob()` in parallel (`Promise.all`) for all `WorkspaceFile[]` + generated `README.md` + `metadata.json` → set `transaction.blobs`, `status: 'blobs_created'`
5. `createTree(baseTreeSha, blobItems)` → set `transaction.treeSha`, `status: 'tree_created'`
6. `createCommit({ message, treeSha, parentShas: [headSha] })` → set `transaction.commitSha`, `status: 'committed'`
7. `updateRef('heads/main', commitSha)`
8. Set `transaction.finishedAt` and `transaction.durationMs`

If any step fails: set `transaction.status = 'failed'`, set `finishedAt`/`durationMs`, log full transaction for debugging.

Commit message uses template from `SyncConfig.commitMessageTemplate` with tokens `{title}`, `{slug}`, `{date}`. Default: `"feat: add {slug} ({date})"`.

**`RepoManager`**

`ensureRepo(token, config)`: checks if repo exists; if not, creates it (private by default per `SyncConfig.repoVisibility`, description: "GreatFrontend solutions synced by GFE Sync extension"). Creates initial commit with `README.md` placeholder. Returns `{ owner, repo }`.

**`IndexManager`**

Read-only helper for `index.json` at repo root. Schema:

```typescript
interface RepoIndex {
  version: 1;
  solutions: Record<string, {
    hash: string;
    commitSha: string;
    syncedAt: string;
    extensionVersion: string;
    snapshotVersion: number;
    category: string;
    title: string;
  }>;
}
```

`get(owner, repo, token)`: fetches and parses `index.json`. Returns empty index on 404. Parse failures also fall back to an empty index (logged).

There is **no** `update()` method. `IndexManager` never writes to GitHub. Instead, `GitHubProvider.synchronize()` calls `get()` before every commit, merges the new entry in memory, and includes the updated `index.json` blob in the same atomic Git Data commit as the workspace, README, and metadata files. This preserves the "one sync = one commit" invariant.

---

### `generators/` — Markdown and Metadata Generators

**`MarkdownBuilder`**

Fluent builder. Not a template string. Methods: `heading(level, text)`, `paragraph(text)`, `badge(label, value)`, `list(items)`, `table(headers, rows)`, `codeBlock(lang, code)`, `hr()`, `link(text, url)`, `build()` → `string`. All methods return `this` for chaining.

**`ReadmeGenerator`**

Generates `README.md` for a single question using `MarkdownBuilder`. Sections:
1. H1: title
2. Badges: Difficulty, Duration
3. H2: Languages — unordered list
4. H2: Companies — unordered list (if any)
5. H2: Source — link to canonical GreatFrontend URL (`metadata.url`). Always included; enables one-click navigation back to the problem.
6. HR
7. H2: Problem Description — `metadata.description` (raw markdown, rendered as-is)
8. HR
9. H2: Project Structure — code block listing all file paths under `workspace/`

**`MetadataFileGenerator`**

Generates `metadata.json` per question. A machine-readable, self-contained record of everything about the problem and the sync — useful for tooling, search, and batch operations. Every generated file begins with `"schemaVersion": METADATA_SCHEMA_VERSION` so downstream tooling can detect and migrate older formats.

```json
{
  "schemaVersion": 1,
  "slug": "event-emitter",
  "title": "Event Emitter",
  "difficulty": "medium",
  "duration": 20,
  "url": "https://www.greatfrontend.com/questions/javascript/event-emitter",
  "companies": ["Google", "Meta"],
  "languages": ["JavaScript", "TypeScript"],
  "completedAt": "2026-07-17T10:30:00.000Z",
  "snapshotVersion": 1,
  "extensionVersion": "1.0.0"
}
```

Each problem folder is completely self-contained: `README.md` (human-readable) + `metadata.json` (machine-readable) + `workspace/` (captured files).

**`RootReadmeGenerator`**

Generates `README.md` at repo root. Accepts `RepoIndex`. Sections:
1. H1: "GreatFrontend Solutions"
2. Stats: total solved count, breakdown by category
3. Table per category: | Problem | Difficulty | Completed |
4. Footer: "Synced automatically by [GFE Sync](extension-link)"

Regenerated on every sync and included in the same atomic Git Data commit as the per-question artifacts and `index.json`. Skipped entirely when `SyncConfig.generateRootReadme` is `false`.

---

### `storage/` — Extension Storage

**`ExtensionStorage`**

Typed wrapper around `chrome.storage.local`. Generic `get<T>(key)`, `set<T>(key, value)`, `delete(key)`, `clear()`. All async. Key namespace prefix: `gfe.`.

**`ConfigStore`**

Typed access to user config. `get()` returns `SyncConfig` with Zod-applied defaults. `set(partial)` merges and persists.

```typescript
interface SyncConfig {
  repoName: string;              // default: "greatfrontend-solutions"
  folderLayout: 'categorized' | 'flat';  // default: 'categorized'
  commitMessageTemplate: string; // default: "feat: add {slug} ({date})"
  autoSync: boolean;             // default: true
  generateRootReadme: boolean;   // default: true
  repoVisibility: 'private' | 'public';  // default: 'private'
}
```

**`HashStore`**

Typed slug → hash map in `chrome.storage.local`. Key: `gfe.hashes`. Methods: `get(slug)`, `set(slug, hash)`, `getAll()`, `import(index: RepoIndex)` (bulk-loads from index.json on first run after reinstall).

---

### `utils/` — Shared Utilities

**`Logger`**

Singleton. Structured logging: `logger.info('event.name', { key: value })`. Methods: `debug(event, data?)`, `info(event, data?)`, `warn(event, data?)`, `error(event, data?)`. Prefix: `[GFE Sync]`. In production builds (`import.meta.env.PROD`), `debug` and `info` are no-ops. Each call outputs `{ level, event, data, timestamp }`.

Example calls:
- `logger.info('sync.completed', { slug, commitSha, duration, fileCount })`
- `logger.warn('sync.skipped', { slug, reason: 'hash_match' })`
- `logger.error('github.rate_limited', { status: 429, retryAfter: 60 })`
- `logger.info('auth.token_validated', { username })`
- `logger.info('capture.complete', { pageUrl, fileCount, timestamp })`

**`Hash`**

`sha256(input: string): Promise<string>` — uses `crypto.subtle.digest('SHA-256', ...)`. Returns lowercase hex string.

**`Retry`**

`withRetry<T>(fn: () => Promise<T>, options: { maxAttempts, baseDelayMs, onRetry? }): Promise<T>`. Exponential backoff with jitter. Throws after `maxAttempts` exhausted.

---

### `popup/` — React Popup

Single React root. No router. The popup is a direct reflection of `SyncState` plus auth status — it does not infer status from events.

Components:

- `App` — fetches `AppState` on mount via `GET_STATE`, subscribes to `chrome.runtime.onMessage` for EventBus-bridged events, owns local state
- `AuthSection` — three mutually exclusive states: `ConnectedView` (avatar, username, "Disconnect"), `DisconnectedView` ("Connect GitHub"), `ReconnectView` ("Token expired — Reconnect GitHub")
- `SyncSection` — shows current `SyncState` badge + last sync info (title, relative timestamp, commit SHA link); only shown when authenticated
- `RepoSection` — repo name + GitHub link; only shown when authenticated
- `StatusBadge` — maps `SyncState` enum to label + color: idle→grey, capturing→blue, building→blue, authenticating→yellow, syncing→blue, success→green, failed→red
- `ErrorBanner` — dismissible; shown when `SYNC_FAILED` or `AUTH_FAILED` events arrive

State type:
```typescript
interface AppState {
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
```

---

### `options/` — React Options Page

React form. Controlled inputs. No submit button — settings apply on change (debounced 300ms). Sections:

1. **Repository** — text input for repo name; visibility radio (Private / Public)
2. **Layout** — radio group: Categorized / Flat (with visual example of each)
3. **Commits** — text input for commit message template; helper text showing available tokens (`{title}`, `{slug}`, `{date}`)
4. **Automation** — toggle: Auto Sync; toggle: Generate Root README
5. **Danger Zone** — "Disconnect GitHub" button

---

### `worker/` — Cloudflare Worker

Single file: `worker/src/index.ts`. ~35 lines.

```
POST /token
  Body: { code: string }
  Response: { access_token: string } | { error: string }
```

Flow:
1. Validate request method is POST and content-type is JSON
2. Parse body, validate `code` is a non-empty string
3. POST `https://github.com/login/oauth/access_token` with `client_id`, `client_secret`, `code`; `Accept: application/json`
4. Return `{ access_token }` or `{ error }` from GitHub response

CORS: Allow all `*.chromiumapp.org` origins (only Chrome extensions can generate these URLs — no arbitrary site can spoof them). Optionally configure a specific `ALLOWED_ORIGIN` env var to restrict to a single extension ID in production. Reject all non-chromiumapp.org origins.  
No logging of tokens or codes. No storage. Stateless.

Deployment: `wrangler deploy`. Secrets: `wrangler secret put GITHUB_CLIENT_SECRET`.

---

## Sync Pipeline (Full Detail)

```
Completion detected → GFE_COMPLETE custom event
  ↓
MonacoExtractor.extract() → WorkspaceFile[]        [injected — FIRST]
  ↓
RawMetadataCapture.capture() → RawMetadata         [injected — SECOND]
  ↓
Build CaptureResult { workspace, metadata,
  timestamp, pageUrl }                             [injected]
  ↓
window.postMessage → content script → background   [bridge]
  ↓
EventBus.emit(QUESTION_COMPLETED)                  [background — awaited]
  ↓
SyncState → Capturing; STATE_CHANGED emitted
  ↓
Zod validate CaptureResult.workspace               [background]
  ↓
AuthHandler.validateStoredToken() [pre-sync check,
  first capture per session only — cached in
  SyncOrchestrator.tokenValidatedThisSession]
  → SyncState → Authenticating if token check needed
  ↓
SyncState → Building; STATE_CHANGED emitted
  ↓
MetadataResolver.getMetadata(captureResult.metadata)
  → RSCProvider.canHandle()? → RSCProvider.getMetadata()
  → DOMProvider.canHandle()? → DOMProvider.getMetadata()
  → QuestionMetadata                               [background]
  ↓
Build QuestionSnapshot (without hash)
  ↓
QuestionSnapshotSchema.parse(snapshot)             [Zod validation]
  ↓
Hash.sha256(JSON.stringify({ metadata, files }))
  ↓
EventBus.emit(SNAPSHOT_CREATED)
  ↓
HashStore.get(slug) → compare hashes
  ↓ [same hash] → SYNC_SKIPPED, SyncState → Success, stop
  ↓ [different hash]
SyncState → Syncing; EventBus.emit(SYNC_STARTED)
  ↓
RepositoryProvider.ensureRepository(token, config) [→ GitHub API]
  ↓
GET /git/ref/heads/main → parentSha                [→ GitHub Git Data API]
IndexManager.get(owner, repo, token) → currentIdx  [→ GitHub Contents API — READ-ONLY]
ReadmeGenerator.generate(snapshot) → README.md
MetadataFileGenerator.generate(snapshot) → metadata.json
  (includes schemaVersion: METADATA_SCHEMA_VERSION)
mergedIndex = { ...currentIdx, solutions:
  { ...currentIdx.solutions, [slug]:
    { hash, commitSha: parentSha, syncedAt,
      extensionVersion, snapshotVersion,
      category, title } } }
RootReadmeGenerator.generate(mergedIndex, layout)
  (only when config.generateRootReadme)
  ↓
GitDataService.sync via SyncTransaction            [→ GitHub Git Data API]
  init { status: 'pending', startedAt }
  files = workspace ∪ per-problem README/metadata
        ∪ index.json ∪ (root README if enabled)
  → createBlob × N (parallel)  { status: 'blobs_created' }
  → createTree                 { status: 'tree_created' }
  → createCommit               { status: 'committed' }
  → updateRef
  → set finishedAt, durationMs
  → { commitSha }               ← ONE atomic commit contains everything
  ↓
HashStore.set(slug, hash)                          [→ chrome.storage.local]
  ↓
ExtensionStorage.setLastSync(...)                  [→ chrome.storage.local]
  ↓
EventBus.emit(SYNC_COMPLETED)                      [→ popup via chrome.runtime]
SyncState → Success; STATE_CHANGED emitted
  ↓
logger.info('sync.completed', {
  slug, commitSha, duration, fileCount
})
```

Note: the `commitSha` recorded inside `index.json` is the **parent commit's** SHA (fetched pre-flight) — the new commit's SHA cannot be known before the commit is created, and any follow-up write would break the atomicity guarantee. The authoritative new-commit SHA is returned by `synchronize()` and stored in `HashStore` and `ExtensionStorage.lastSync`.

---

## GitHub Repository Layout

### Categorized (default)
```
greatfrontend-solutions/
├── javascript/
│   └── event-emitter/
│       ├── README.md        ← generated, human-readable
│       ├── metadata.json    ← generated, machine-readable
│       └── workspace/       ← captured Monaco files, original structure
│           ├── package.json
│           ├── tsconfig.json
│           └── src/
│               └── solution.js
├── react/
│   └── tabs/
│       ├── README.md
│       ├── metadata.json
│       └── workspace/
├── user-interface/
│   └── modal/
├── README.md        ← root, auto-generated
└── index.json       ← sync metadata, auto-managed
```

### Flat
```
greatfrontend-solutions/
├── event-emitter/
│   ├── README.md
│   ├── metadata.json
│   └── workspace/
├── tabs/
├── README.md
└── index.json
```

The `workspace/` subdirectory cleanly separates generated metadata files from captured project files.

---

## Authentication Flow

```
Extension startup
  → AuthHandler.validateStoredToken()
    → GET https://api.github.com/user
      → 200: refresh username/avatar → popup ConnectedView
      → 401: delete token, emit TOKEN_EXPIRED → popup ReconnectView

Before first sync of session
  → AuthHandler.validateStoredToken() [pre-sync check]
    → 401: emit TOKEN_EXPIRED, abort sync → popup ReconnectView
    → 200: continue sync

User → popup → "Connect GitHub"
  → AUTH_START → AuthHandler.startAuth()
    → generate state nonce → chrome.storage.session
    → chrome.identity.launchWebAuthFlow(github/authorize?...)
    → [user authorizes]
    → extract code + state, validate nonce
    → POST worker /token { code }
    → Worker → github.com/login/oauth/access_token
    → { access_token } → chrome.storage.local
    → GET /user → store username, avatarUrl
    → EventBus.emit(AUTH_COMPLETE) → popup ConnectedView
```

---

## Build Configuration

**`@crxjs/vite-plugin`** processes `manifest.json` as the build entry point. Discovers all HTML pages and script entries automatically. Produces a loadable unpacked extension in `dist/`.

**`vite.config.ts`** key settings:
- Plugin: `crx({ manifest })`
- Build target: `chrome >= 109` (MV3 service worker support)
- `build.minify`: `true` in production, `false` in development
- `define`: `import.meta.env.EXTENSION_VERSION` from `package.json`

**`manifest.json`** key fields:
```json
{
  "manifest_version": 3,
  "key": "<fixed-base64-key>",
  "background": { "service_worker": "background/index.ts", "type": "module" },
  "content_scripts": [{
    "matches": ["https://www.greatfrontend.com/*"],
    "js": ["content/index.ts"]
  }],
  "permissions": ["storage", "identity", "alarms"],
  "host_permissions": [
    "https://api.github.com/*",
    "https://*.workers.dev/*"
  ],
  "web_accessible_resources": [{
    "resources": ["injected.js"],
    "matches": ["https://www.greatfrontend.com/*"]
  }]
}
```

`alarms` is declared now (even if unused in v1) to enable future retry queues and background cleanup jobs without requiring a permission change and re-review.

---

## Testing Strategy

**Framework:** Vitest

**Mocking strategy:**
- Chrome APIs: `vitest-chrome` package for `chrome.storage`, `chrome.runtime`, `chrome.identity`
- GitHub API: MSW (Mock Service Worker) for integration tests; `vi.mock` for unit tests
- Monaco: `vi.stubGlobal('monaco', { editor: { getModels: vi.fn() } })`
- `fetch`: `vi.stubGlobal('fetch', mockFetch)` for FetchInterceptor tests
- `crypto.subtle`: native in Vitest (Node supports WebCrypto)

**Coverage targets:**
- `types/`: N/A (pure types)
- `utils/`: 95%+
- `generators/`: 90%+
- `providers/`: 90%+
- `github/`: 90%+ (with MSW)
- `storage/`: 85%+
- `background/`: 80%+
- `injected/`: 80%+
- `content/`: 70%+
- `popup/` / `options/`: React Testing Library, key interaction paths

**Key unit test scenarios:**
- `FetchInterceptor`: intercepts correct URL, passes others through, response unmodified
- `MonacoExtractor`: converts models to `WorkspaceFile[]`, throws on missing Monaco, called before metadata
- `RSCProvider`: `canHandle()` true on valid `__next_f`, parses metadata, throws on malformed payload
- `DOMProvider`: `canHandle()` true on DOM snapshot, maps fields correctly
- `MetadataResolver`: calls `canHandle()` before `getMetadata()`, falls through correctly, throws `MetadataUnavailableError` on all-fail
- `SyncOrchestrator`: skips on hash match (emits `SYNC_SKIPPED`), full pipeline on mismatch, all `SyncState` transitions, handles GitHub errors
- `GitDataService`: correct `SyncTransaction` state transitions, blob parallelism, single commit, `finishedAt`/`durationMs` set on both success and failure
- `HashStore`: detects matching vs different hashes, imports from `RepoIndex` on reinstall
- `AuthHandler`: validates state nonce, rejects mismatched state, `TOKEN_EXPIRED` on 401

**End-to-end integration tests** (`tests/e2e/sync-pipeline.test.ts`) — 8 scenarios, all runnable code (no placeholders):

**Scenario 1 — Happy path sync:**
```
Mock FetchInterceptor fires GFE_COMPLETE
  ↓
Mock Monaco returns 3 WorkspaceFile entries
  ↓
Mock __next_f returns valid RSC payload
  ↓
MSW intercepts all GitHub Git Data API calls
  ↓
Assert: exactly one commit created
Assert: commit tree contains README.md + metadata.json + all workspace files
        + index.json + root README.md (all in the same tree/commit)
Assert: index.json entry has correct hash, snapshotVersion, extensionVersion,
        commitSha = parent HEAD SHA
Assert: metadata.json includes "schemaVersion": 1
Assert: HashStore updated
Assert: SYNC_COMPLETED emitted with correct slug and commitSha
Assert: SyncState transitions Idle → Capturing → Building → Syncing → Success
```

**Scenario 2 — Deduplication:**
```
First sync completes successfully (same hash stored)
  ↓
User solves the same problem again (no code changes)
  ↓
GFE_COMPLETE fires again with identical workspace
  ↓
Assert: NO GitHub API calls made
Assert: SYNC_SKIPPED emitted with reason 'hash_match'
Assert: HashStore unchanged
Assert: SyncState transitions to Success without Syncing
Assert: popup shows "Already synchronized"
```

**Scenario 3 — Token revoked after startup:** stored token returns 401 from `GET /user` on the pre-sync check. Assert `TOKEN_EXPIRED` emitted, `SYNC_FAILED` follows, and zero repo/git-data calls are made.

**Scenario 4 — GitHub rate limiting:** first two `POST /git/blobs` calls return `429` with `Retry-After: 0`; third succeeds. Assert the sync completes, blob call count > 1, and `SYNC_COMPLETED` fires.

**Scenario 5 — Repository already exists:** `GET /repos/:owner/:repo` returns 200. Assert `POST /user/repos` is never called and the sync proceeds normally.

**Scenario 6 — Metadata falls back from RSC to DOM:** `__next_f` payload contains unrelated data; `domSnapshot` supplies title/difficulty/etc. `MetadataResolver` tries `RSCProvider` first, then falls back to `DOMProvider`. Assert `SYNC_COMPLETED` with the DOM-sourced title.

**Scenario 7 — Monaco unavailable / empty workspace:** `CaptureResult.workspace` is empty. Zod `WorkspaceFileSchema.min(1)` rejects; assert `SYNC_FAILED` emitted with a validation error and no GitHub calls.

**Scenario 8 — Duplicate sync skipped (explicit no-op):** identical to Scenario 2 but explicitly asserts zero blob/tree/commit calls on the second `handleCapture`, and that the `HashStore` value is byte-identical.

---

## Error Handling

### Retry Policy

`utils/Retry.withRetry` accepts a `shouldRetry(err) → boolean` predicate. `GitHubClient` supplies an `isRetryableError` predicate that classifies every error deterministically:

| Category | Examples | Retried? |
|---|---|---|
| Network failure / timeout | `TypeError: Failed to fetch`, aborted request | ✅ Yes |
| HTTP 429 Too Many Requests | Secondary rate limits | ✅ Yes (respects `Retry-After` header) |
| HTTP 500 / 502 / 503 | Transient GitHub server errors | ✅ Yes |
| HTTP 400 Bad Request | Malformed body, invalid tree items | ❌ No — surface immediately |
| HTTP 401 Unauthorized | Expired/revoked token | ❌ No — triggers `TOKEN_EXPIRED` |
| HTTP 403 Forbidden (non-rate-limit) | Missing `repo` scope, SSO required | ❌ No |
| HTTP 404 Not Found | Missing repo/ref/content | ❌ No — most paths use `allow404` |
| Zod validation error | Invalid `CaptureResult`, `RepoIndex`, `SyncConfig` | ❌ No — programmer/data error |
| `AuthError` | Missing env, OAuth flow error | ❌ No |

Backoff for retryable errors is exponential (`baseDelayMs * 2^(attempt-1)`) capped at 3 attempts total. All retries are logged at `warn` level with `{ path, attempt, err }`.

### Errors and Handlers

| Error | Handler | Recovery |
|---|---|---|
| Monaco unavailable | SyncOrchestrator catch | Log warn, emit SYNC_FAILED, SyncState→Failed |
| Metadata unavailable | SyncOrchestrator catch | Log warn, emit SYNC_FAILED (workspace already captured) |
| OAuth failure | AuthHandler catch | Log error, emit AUTH_FAILED |
| Token expired/revoked (startup) | validateStoredToken | Delete token, emit TOKEN_EXPIRED, popup→ReconnectView |
| Token expired/revoked (pre-sync) | validateStoredToken | Abort sync, emit TOKEN_EXPIRED, popup→ReconnectView |
| Network failure | Retry utility | 3 retries, exponential backoff |
| GitHub rate limit | GitHubClient | Respect Retry-After, then Retry utility |
| Repo not found | RepoManager | Create repo automatically |
| index.json missing | IndexManager | Return empty index, create on first write |
| Invalid snapshot | Zod parse | Log error with field details, emit SYNC_FAILED |
| Worker unreachable | AuthHandler catch | AUTH_FAILED: "Token exchange failed" |
| SyncTransaction failure | GitDataService catch | Log full transaction (with durationMs), emit SYNC_FAILED |

All errors logged with `Logger.error('event.name', { structured context })`. User-visible errors surface as a dismissible `ErrorBanner` in the popup.

---

## Implementation Milestones

Each milestone must build cleanly, pass all TypeScript checks, pass all ESLint checks, and pass all tests before the next begins. Never implement more than one milestone at a time.

**Milestone 1 — Project Bootstrap**  
Monorepo structure, tooling (Vite + `@crxjs/vite-plugin`, TypeScript strict, ESLint, Prettier, Vitest, pnpm workspaces), `manifest.json` with fixed key, Cloudflare Worker scaffold with `wrangler.toml`, CI build verification. Extension loads unpacked with no errors.

**Milestone 2 — Authentication**  
Cloudflare Worker `/token` endpoint (complete, deployed). `AuthHandler` (startAuth, revokeAuth, validateStoredToken). `ExtensionStorage` + `ConfigStore`. `EventBus` (AUTH_* events). Basic popup: `ConnectedView`, `DisconnectedView`, `ReconnectView`. End-to-end OAuth flow works in a real browser.

**Milestone 3 — GitHub Provider**  
`GitHubClient` (all methods). `SyncTransaction`. `GitDataService`. `RepoManager`. `IndexManager`. `RepositoryProvider` interface. `GitHubProvider` composition. `HashStore`. All GitHub operations fully tested with MSW.

**Milestone 4 — Capture**  
`FetchInterceptor`. `MonacoExtractor`. `RawMetadataCapture`. `CaptureResult`. `injected/index.ts` entry point. `PageBridge` content script. Verified on a real GreatFrontend problem page.

**Milestone 5 — Metadata Providers**  
`IMetadataProvider` interface. `RSCProvider`. `DOMProvider`. `MetadataResolver`. Full unit tests with realistic `__next_f` fixtures and DOM snapshots.

**Milestone 6 — Snapshot & State Machine**  
`QuestionSnapshotSchema` (Zod). `Hash` utility. `SyncOrchestrator` pipeline. `SyncState` machine. All `EventBus` events. Deduplication via `HashStore`. Full unit tests.

**Milestone 7 — Synchronization**  
`MarkdownBuilder`. `ReadmeGenerator`. `MetadataFileGenerator`. `RootReadmeGenerator`. Full `GitDataService` sync wired into `GitHubProvider.synchronize()` — one atomic commit including workspace, per-question README/metadata.json, `index.json`, and root `README.md`. E2E integration tests (all 8 scenarios).

**Milestone 8 — Popup**  
Complete React popup with all `SyncState` reflections, `StatusBadge`, `ErrorBanner`, real-time EventBus updates, `AuthSection` all three states.

**Milestone 9 — Options**  
Full options page with all configurable settings, `ConfigStore` integration, visibility toggle, commit message template with token preview.

**Milestone 10 — Polish & Testing**  
ESLint/Prettier full pass. Coverage audit against targets. `Logger` structured output validation. Build verification (unpacked load, no console errors). Installation instructions, build instructions, publishing instructions, architecture documentation in `README.md`.

---

## Explicit Scope

**Included:**
- Automatic sync on tRPC completion event
- Manual "Mark Complete" detection (same tRPC endpoint)
- All Monaco workspace files (not just solution file)
- Per-question README and metadata.json generation
- Root README generation (configurable)
- index.json as distributed state (survives reinstall, works across machines)
- GitHub OAuth via Cloudflare Worker
- Duplicate detection via SHA-256 hash (with E2E test)
- Automatic repo creation (private by default)
- Configurable folder layout, repo name, commit message, visibility
- Popup with SyncState reflection and ReconnectView
- Options page
- Typed internal EventBus
- SyncTransaction for debuggable Git operations
- RepositoryProvider interface for future platform support
- SyncState enum for explicit state machine
- CaptureResult for richer debugging context
- E2E integration tests (8 scenarios: happy path, deduplication, token revoked, rate limit, existing repo, DOM fallback, Monaco unavailable, duplicate no-op)

**Excluded (out of scope for v1):**
- Syncing questions that are not yet completed
- Deleting solutions from GitHub when a question is un-completed
- Support for non-GreatFrontend platforms
- Multi-account GitHub support
- Offline queuing of sync operations (architecture supports it via alarms)
- Analytics or telemetry
- Extension auto-update logic beyond standard Chrome Web Store mechanism

---

## Future Enhancements

Features deliberately deferred to keep v1 focused. The architecture accommodates all of these without structural changes.

1. **Batch sync** — Sync all previously completed problems. `SyncOrchestrator` handles individual syncs; a `BatchSyncService` orchestrates with rate limiting.
2. **Manual "Sync Now" button** — Trigger sync from popup without navigating to a problem page.
3. **Retry queue for offline failures** — `alarms` permission is already declared. A `RetryQueue` listens to `SYNC_FAILED`, persists the `CaptureResult`, and retries on next alarm.
4. **Additional coding platforms** — `IMetadataProvider` and `RepositoryProvider` interfaces make new platforms additive. New content script host pattern per platform.
5. **Custom README templates** — Handlebars or similar in options page. `ReadmeGenerator` is already decoupled via `MarkdownBuilder`.
6. **GitHub App authentication** — If GitHub adds native PKCE support, retire the Cloudflare Worker. Change isolated to `AuthHandler`.
7. **Snapshot migration** — `snapshotVersion` enables safe migration. A `MigrationService` upgrades old snapshots in place.
