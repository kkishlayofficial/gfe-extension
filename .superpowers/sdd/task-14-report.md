# Task 14 Report: MonacoExtractor, RawMetadataCapture, Injected Entry

## Outcome

Status: DONE

Commit: `cb170b3f2151f18e0db3c60f0d15face24d18e56`

## What Changed

- Added `extension/injected/MonacoExtractor.ts` to read `window.monaco.editor.getModels()` in the page world and produce `WorkspaceFile[]`.
- `MonacoExtractor` strips the leading `/` from `uri.path` values and throws `MonacoUnavailableError` when Monaco is not present.
- Added `extension/injected/RawMetadataCapture.ts` to read `self.__next_f` or `globalThis.__next_f` when present and non-empty.
- `RawMetadataCapture` falls back to a DOM snapshot with selectors for title, difficulty, duration, description, and URL when `__next_f` is missing or empty.
- Replaced `extension/injected/index.ts` with the wired entry that installs `FetchInterceptor`, listens for `GFE_COMPLETE`, captures workspace files first, captures raw metadata second, and posts the result back with `window.postMessage`.
- Added focused tests for the injected extractors:
  - `tests/unit/injected/MonacoExtractor.test.ts`
  - `tests/unit/injected/RawMetadataCapture.test.ts`

## Validation

- Focused injected tests: `corepack pnpm --filter @gfe/extension test tests/unit/injected/MonacoExtractor.test.ts tests/unit/injected/RawMetadataCapture.test.ts`
  - Result: 5 passed
- Full extension suite: `corepack pnpm --filter @gfe/extension test`
  - Result: 18 test files passed, 115 tests passed
- Build verification: `corepack pnpm --filter @gfe/extension build`
  - Result: successful build and `extension/dist/injected.js` emitted

## Notes

- The repository is clean after the commit.
- The injected implementation stays in the page world and does not import `chrome.*`.

## Fix Note: MonacoExtractor Sorting

- `MonacoExtractor.extract()` now sorts the mapped `WorkspaceFile[]` by `path` ascending before returning.
- Added regression coverage for unsorted Monaco models so the output is verified in ascending path order.
- Validation:
  - `corepack pnpm --filter @gfe/extension test tests/unit/injected/MonacoExtractor.test.ts` - passed with 3 tests
  - `corepack pnpm --filter @gfe/extension test` - passed with 18 test files and 116 tests
