# Task 18 Report: SyncOrchestrator, MessageRouter & Background Wiring

Status: DONE

## Summary

Implemented the background orchestration pipeline in `extension/background/SyncOrchestrator.ts`, added runtime message dispatching in `extension/background/MessageRouter.ts`, and replaced the background entry wiring in `extension/background/index.ts`.

Delivered behavior:
- `SyncOrchestrator.handleCapture` validates the workspace with `z.array(WorkspaceFileSchema).min(1)` before any sync work starts.
- Token validation is performed at most once per service-worker session via a session guard, and `validateStoredToken()` is invoked with no arguments.
- Snapshot hashes are computed as `sha256(JSON.stringify({ metadata, files }))` with files sorted by ascending path.
- Matching hashes emit `SYNC_SKIPPED` and avoid repository synchronization.
- Successful syncs persist the hash and `lastSync` metadata and emit `SYNC_COMPLETED`.
- Failures emit `SYNC_FAILED` and transition the orchestrator state to `failed`.
- `MessageRouter` dispatches `QUESTION_COMPLETED`, `AUTH_START`, `AUTH_REVOKE`, and `GET_STATE` runtime messages.
- The background service worker now wires `EventBus`, `AuthHandler`, `MetadataResolver`, `GitHubProvider`, `SyncOrchestrator`, and `MessageRouter` directly without calling a nonexistent `eventBus.installBridge()` method.

## Tests Added

- `tests/unit/background/SyncOrchestrator.test.ts` with 7 tests covering the happy path, hash skip path, metadata failure, invalid token, invalid workspace, zero-argument token validation, and one-time session validation.
- `tests/unit/background/MessageRouter.test.ts` with 4 tests covering capture dispatch, auth start dispatch, auth revoke dispatch, and `GET_STATE` responses.

## Verification

- `corepack pnpm --filter @gfe/extension test tests/unit/background/SyncOrchestrator.test.ts tests/unit/background/MessageRouter.test.ts` -> 11 tests passed.
- `corepack pnpm -r test` -> extension: 24 test files / 145 tests passed; worker: 1 test file / 7 tests passed.
- `corepack pnpm --filter @gfe/extension build` -> passed.

## Notes

- The root `corepack pnpm test` wrapper failed in this environment because the root package script shells out to plain `pnpm`, which is not on PATH inside that script. The equivalent direct verification command `corepack pnpm -r test` succeeded.

---

## 2026-07-17 Follow-up Fix: Awaited STATE_CHANGED Emission

Status: DONE

Applied the Task 18 defect fix in `extension/background/SyncOrchestrator.ts` by changing `setState` to `async`, awaiting `eventBus.emit()` inside it, and updating every `handleCapture` state transition call site to `await this.setState(...)`.

Verification:
- `corepack pnpm --filter @gfe/extension test tests/unit/background/SyncOrchestrator.test.ts` -> 1 test file passed, 7 tests passed.
- `corepack pnpm --filter @gfe/extension test` -> 24 test files passed, 145 tests passed.