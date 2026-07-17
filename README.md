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
