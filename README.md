# GreatFrontend Sync

A Chrome extension that automatically syncs your completed [GreatFrontend](https://www.greatfrontend.com) solutions to a private GitHub repository. Every time you mark a problem as complete, the extension captures your Monaco workspace, generates a per-question README, and commits everything atomically — no manual copy-paste ever again.

---

## Table of Contents

- [Features](#features)
- [Installing the Extension (End Users)](#installing-the-extension-end-users)
- [Using the Extension](#using-the-extension)
- [Developer Setup — Making Changes](#developer-setup--making-changes)
- [Building a Release ZIP](#building-a-release-zip)
- [Loading the Extension in Chrome](#loading-the-extension-in-chrome)
- [Configuration Options](#configuration-options)
- [Architecture](#architecture)
- [Deploying the Cloudflare Worker](#deploying-the-cloudflare-worker)
- [Tech Stack](#tech-stack)

---

## Features

- **Automatic sync** — hooks GreatFrontend's solution submission and captures your workspace the moment you complete a problem
- **Atomic commits** — creates a single Git tree with all files (solution, README, metadata) in one commit
- **Deduplication** — SHA-256 hash of `(metadata + files)` skips re-syncing identical solutions
- **Per-question README** — auto-generated README with problem title, difficulty, description, and languages
- **Root README** — repository-level README with sync stats and per-category solution tables
- **Inline notifications** — Shadow DOM toast appears on the GFE page itself so you see results without opening the popup
- **Extension badge** — green ✓ badge on the toolbar icon after a successful sync (auto-clears in 5s); red `!` stays until you open the popup if there's an error
- **Dark mode** — popup and options panel follow your system theme
- **Configurable** — repo name, folder layout (`flat` or `categorized`), commit template, auto-sync toggle, README generation, and visibility (public/private)
- **Secure** — OAuth token exchange lives in a stateless Cloudflare Worker; the extension never sees your GitHub client secret

---

## Installing the Extension (End Users)

> No build tools required. Just download and load.

### Step 1 — Download the latest release

1. Go to [**Releases**](https://github.com/kkishlayofficial/gfe-extension/releases)
2. Click the latest release (e.g. `v0.1.0`)
3. Under **Assets**, download `gfe-extension-v0.1.0.zip`

### Step 2 — Extract the ZIP

Extract the ZIP file to a permanent folder on your computer (e.g. `~/Extensions/gfe-extension/`).

> **Important:** Do not move or delete this folder after loading — Chrome loads the extension from it at startup.

### Step 3 — Load in Chrome

See [Loading the Extension in Chrome](#loading-the-extension-in-chrome) below.

---

## Using the Extension

### First time — Connect GitHub

1. Click the **GFE Sync** icon in your Chrome toolbar
2. Click **Connect with GitHub**
3. Authorize the app in the GitHub OAuth popup that appears
4. Once connected you'll see your GitHub avatar, username, and the sync/repository cards

### Syncing a solution

1. Open any coding problem on [greatfrontend.com](https://www.greatfrontend.com)
2. Solve the problem and submit it
3. The extension automatically detects the completion and syncs to GitHub
4. A green toast notification appears on the page confirming the sync
5. The extension toolbar icon briefly shows a ✓ badge

### Viewing sync status

Open the popup to see:
- **Sync Status** — current state (Idle / Syncing / Success / Failed) with the last synced solution
- **Repository** — link to your GitHub repo with its visibility (private/public)

### Changing settings

Click the **Options** button at the bottom of the popup to configure:
- Repository name (default: `greatfrontend-solutions`)
- Visibility (private or public)
- Folder layout (categorized by type or flat)
- Commit message template
- Auto-sync toggle
- Generate root README toggle

---

## Developer Setup — Making Changes

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |
| pnpm | ≥ 9 | `npm install -g pnpm` or `corepack enable` |
| Chrome | Any recent | [google.com/chrome](https://www.google.com/chrome) |

### 1. Clone the repository

```bash
git clone https://github.com/kkishlayofficial/gfe-extension.git
cd gfe-extension
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Create the environment file

Create `extension/.env.local` with the following variables:

```env
VITE_GITHUB_CLIENT_ID=<your-github-oauth-app-client-id>
VITE_WORKER_URL=<your-cloudflare-worker-url>
```

> If you are just using the existing deployed worker, set:
> ```env
> VITE_GITHUB_CLIENT_ID=Ov23liNrR5fOPpM84Ln7
> VITE_WORKER_URL=https://gfe-oauth-token.kishlay-gfe-sync.workers.dev
> ```

### 4. Build the extension

```bash
# One-time production build
pnpm --filter @gfe/extension build
```

The output is written to `extension/dist/`. Load this folder in Chrome (see [Loading the Extension in Chrome](#loading-the-extension-in-chrome)).

### 5. Development with hot-reload

```bash
# Terminal 1 — Vite dev server with HMR
pnpm --filter @gfe/extension dev

# Terminal 2 — Local Cloudflare Worker (optional — only if you changed worker code)
pnpm --filter @gfe/worker dev
```

After running `dev`, load `extension/dist/` in Chrome once. Changes to popup/options/content files are reflected immediately (hot-reload). Changes to the background service worker require clicking **Reload** on `chrome://extensions`.

### 6. Run tests

```bash
# All tests
pnpm test

# Watch mode
pnpm --filter @gfe/extension test -- --watch

# Coverage report
pnpm --filter @gfe/extension test -- --coverage
```

### Making changes

| Change type | Location | Notes |
|-------------|----------|-------|
| Popup UI | `extension/popup/` | React + plain CSS |
| Options panel | `extension/popup/components/OptionsPanel.tsx` | Renders inside popup (no separate page) |
| Styles / dark mode | `extension/popup/styles.css` | CSS custom properties, `@media (prefers-color-scheme: dark)` |
| Background logic | `extension/background/` | MV3 service worker |
| GitHub API | `extension/github/` | Git Data API client |
| Page detection | `extension/injected/` | Runs inside the page world |
| In-page toast | `extension/content/PageToast.ts` | Shadow DOM, no style conflicts |
| Types | `extension/types/index.ts` | Zod schemas → TS types |
| Worker (OAuth) | `worker/src/index.ts` | Cloudflare Worker |

---

## Building a Release ZIP

```bash
# 1. Build the extension
pnpm --filter @gfe/extension build

# 2. Create the ZIP from the dist folder
cd extension/dist
zip -r ../../gfe-extension-v0.1.0.zip .
cd ../..
```

The resulting `gfe-extension-v0.1.0.zip` is ready to attach to a GitHub Release or share directly.

### Creating a GitHub Release

```bash
# Requires GitHub CLI: brew install gh && gh auth login
gh release create v0.1.0 gfe-extension-v0.1.0.zip \
  --title "GFE Sync v0.1.0" \
  --notes "Download the ZIP, extract it, then load the folder as an unpacked extension in Chrome."
```

---

## Loading the Extension in Chrome

> These steps apply whether you downloaded a Release ZIP or built from source.

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner

   ![Developer mode toggle](https://i.imgur.com/placeholder.png)

3. Click **Load unpacked**
4. Select the extracted folder:
   - If you downloaded the Release: select the folder you extracted the ZIP into
   - If you built from source: select `extension/dist/`
5. The **GFE Sync** extension will appear in the list with its orange logo

### Pinning the extension to the toolbar

1. Click the puzzle-piece (Extensions) icon in the Chrome toolbar
2. Find **GFE Sync** and click the pin icon next to it
3. The GFE Sync icon will now always be visible in the toolbar

### Reloading after changes (developers only)

If you make code changes and rebuild, click the **↺ Reload** button on the extension card at `chrome://extensions` to pick up the new build.

---

## Configuration Options

Open the popup and click **Options** at the bottom.

| Setting | Default | Description |
|---------|---------|-------------|
| Repository name | `greatfrontend-solutions` | Name of the GitHub repo that will be created |
| Visibility | `private` | `private` keeps your solutions hidden; `public` makes them visible |
| Folder layout | `categorized` | `categorized`: `javascript/event-emitter/`; `flat`: `event-emitter/` |
| Commit message template | `feat: add {slug} ({date})` | Available tokens: `{title}`, `{slug}`, `{date}` |
| Auto sync | enabled | Automatically sync on every solution submission |
| Generate root README | enabled | Maintain a root `README.md` with a table of all solutions |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  GFE Website                    │
│  ┌────────────────┐   ┌────────────────────┐   │
│  │  Injected JS   │──▶│  Content Script    │   │
│  │  (page world)  │   │  (isolated world)  │   │
│  └────────────────┘   └────────┬───────────┘   │
└───────────────────────────────┼─────────────────┘
                                │ chrome.runtime.sendMessage
                                ▼
          ┌─────────────────────────────────────┐
          │        Background Service Worker     │
          │  ┌────────────┐  ┌───────────────┐  │
          │  │  EventBus  │  │MessageRouter  │  │
          │  └─────┬──────┘  └───────────────┘  │
          │        │                             │
          │  ┌─────▼──────────────────────────┐  │
          │  │       SyncOrchestrator         │  │
          │  │  Capturing → Building →        │  │
          │  │  Authenticating → Syncing      │  │
          │  └─────────────┬──────────────────┘  │
          └────────────────┼────────────────────┘
                           │ HTTPS
                           ▼
          ┌──────────────────────────────────────┐
          │         GitHub Git Data API           │
          │  Blobs → Tree → Commit → Ref update  │
          └──────────────────────────────────────┘
```

**Key components:**

- **Injected** (`extension/injected/`) — runs inside the page's JavaScript context; hooks GreatFrontend's tRPC completion event and extracts Monaco workspace + RSC metadata
- **Content script** (`extension/content/`) — bridge between the page world and the background; also hosts the Shadow DOM in-page toast
- **Background** (`extension/background/`) — MV3 service worker; owns the `EventBus`, `SyncOrchestrator`, `AuthHandler`, and `MessageRouter`
- **Providers** (`extension/providers/`) — `RSCProvider` extracts metadata from Next.js RSC payloads; `DOMProvider` is the DOM fallback
- **GitHub** (`extension/github/`) — `GitHubClient` wraps the Git Data API; `GitHubProvider` orchestrates multi-file atomic commits
- **Popup** (`extension/popup/`) — React UI; communicates with the background via `chrome.runtime.sendMessage`
- **Worker** (`worker/`) — stateless Cloudflare Worker; exchanges GitHub OAuth code for an access token

---

## Deploying the Cloudflare Worker

> Skip this if you are using the existing deployed worker (`https://gfe-oauth-token.kishlay-gfe-sync.workers.dev`).

### Prerequisites

```bash
# Install Wrangler CLI
pnpm --filter @gfe/worker exec wrangler login
```

### Deploy

```bash
# 1. Set your GitHub OAuth app client secret as a Wrangler secret
cd worker
corepack pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
# Enter your GitHub OAuth app client secret when prompted

# 2. Deploy to Cloudflare
pnpm --filter @gfe/worker deploy
```

Wrangler will print the deployed URL (e.g. `https://gfe-oauth-token.<your-account>.workers.dev`). Set this as `VITE_WORKER_URL` in `extension/.env.local` and rebuild the extension.

### GitHub OAuth App setup

If you are running your own worker, you need your own GitHub OAuth app:

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. Set **Authorization callback URL** to `https://<your-chrome-extension-id>.chromiumapp.org/callback`
   - Find your extension ID at `chrome://extensions` after loading it
3. Copy the **Client ID** → `VITE_GITHUB_CLIENT_ID` in `.env.local`
4. Generate a **Client Secret** → `wrangler secret put GITHUB_CLIENT_SECRET`
5. Update `GITHUB_CLIENT_ID` in `worker/wrangler.toml`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension UI | React 18, TypeScript, plain CSS (no Tailwind) |
| Build | Vite + `@crxjs/vite-plugin` |
| Background | Chrome MV3 Service Worker |
| OAuth backend | Cloudflare Workers (Wrangler) |
| Validation | Zod |
| Tests | Vitest, Testing Library, MSW |
| Package manager | pnpm workspaces |

