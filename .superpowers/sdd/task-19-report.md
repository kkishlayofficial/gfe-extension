# Task 19 Report: Generators — MarkdownBuilder, README, Metadata, RootREADME

Status: DONE

## Summary

Implemented the generator layer in `extension/generators/` with four pure content generators that depend only on `extension/types` and the local Markdown builder.

Delivered behavior:
- `MarkdownBuilder` composes headings, paragraphs, badges, lists, tables, fenced code blocks, horizontal rules, and links while preserving the exact snapshot formatting required by the spec.
- `ReadmeGenerator` renders a question README from `QuestionSnapshot`, including badges, language and company sections, the GreatFrontend source link, description, project structure, and sync footer.
- `MetadataFileGenerator` serializes metadata JSON from `QuestionSnapshot` with `schemaVersion: METADATA_SCHEMA_VERSION` as the first key.
- `RootReadmeGenerator` renders the repository README from `RepoIndex` plus `SyncConfig['folderLayout']`, grouping solutions by category and switching links between categorized and flat layouts.
- The generator layer does not import from `github/`, `providers/`, `background/`, `content/`, `injected/`, `popup/`, or `options/`.

## Tests Added

- `tests/unit/generators/MarkdownBuilder.test.ts` with 2 tests covering exact markdown composition output and fluent return behavior.
- `tests/unit/generators/ReadmeGenerator.test.ts` with 1 test covering README content generation from `QuestionSnapshot`.
- `tests/unit/generators/MetadataFileGenerator.test.ts` with 1 test covering pretty JSON serialization and schema/version fields.
- `tests/unit/generators/RootReadmeGenerator.test.ts` with 2 tests covering categorized and flat root README link generation.

## Verification

- `corepack pnpm --filter @gfe/extension test tests/unit/generators/MarkdownBuilder.test.ts` -> 1 test file passed, 2 tests passed.
- `corepack pnpm --filter @gfe/extension test tests/unit/generators` -> 4 test files passed, 6 tests passed.
- `corepack pnpm test` -> failed in this environment because the root package script shells out to plain `pnpm`, which is not on PATH inside the script.
- `corepack pnpm -r test` -> extension: 28 test files / 151 tests passed; worker: 1 test file / 7 tests passed.

## Notes

- The brief's expected count of `5 passed` was incorrect; the generator suite contains 6 tests total.
- `MarkdownBuilder.link()` was implemented to support the exact test contract from the brief, where the link fragment is built independently before being inserted into a paragraph.

## 2026-07-17 Defect Fix Addendum

- Fixed `MarkdownBuilder.link(text, url)` to return a plain string directly instead of a wrapper object.
- Removed the local `MarkdownFragment` wrapper type from `extension/generators/MarkdownBuilder.ts`.
- Updated generator call sites in `ReadmeGenerator` and `RootReadmeGenerator` to consume `link(...)` as a string rather than calling `.build()`.
- Updated `tests/unit/generators/MarkdownBuilder.test.ts` to assert the plain-string contract and keep composition coverage aligned with the spec.

### Verification

- `corepack pnpm --filter @gfe/extension test tests/unit/generators/MarkdownBuilder.test.ts` -> 1 file passed, 3 tests passed.
- `corepack pnpm --filter @gfe/extension test tests/unit/generators/` -> 4 files passed, 7 tests passed.
- `corepack pnpm --filter @gfe/extension test` -> 28 files passed, 152 tests passed.