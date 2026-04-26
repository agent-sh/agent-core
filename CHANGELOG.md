# Changelog

All notable changes to agent-core are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.4.1] - 2026-04-26

### Security

- **lib/binary: SHA-256 verify release assets before extraction** (#13). Every downloaded binary is now checked against its `.sha256` sidecar served alongside the release asset; mismatch aborts extraction with a tamper-framed error.
- **lib/binary: path-validate archive entries before extracting** (#13). Both tar.gz and zip extraction now run into an isolated scratch dir, reject entries with absolute paths / `..` components / Windows drive letters / UNC prefixes / symlinks, and copy only the expected binary out. Prevents zip-slip into `~/.agent-sh/bin/` or elsewhere.
- **lib/binary: PowerShell extraction uses `-File` helper script + env vars, not command-string interpolation** (#13). PowerShell's `-Command` joins subsequent tokens after stripping quotes - a home directory containing a single quote or space would break or inject. The helper script reads `$env:SRC_ZIP` / `$env:DEST_DIR` so paths are never re-parsed.
- **lib/binary: scratch dir cleaned up on extraction failure** (#13). Extract errors now delete the scratch dir in a `finally` handler; previously a failed extraction could leak files.

### Added

- `lib/collectors/analyzer-queries.js` - Batch collector that invokes `agent-analyzer` query subcommands in one pass and normalizes their output for downstream consumers. Registered in the `collect()` dispatch.

## [0.4.0] - 2026-03-22

### Changed

- Bumped `ANALYZER_MIN_VERSION` to `v0.3.0` in `lib/binary/version.js`. v0.3.0 adds Phase 2-4 of agent-analyzer: AST symbol extraction (6 languages), project metadata, and doc-code cross-references. New query subcommands available: `symbols`, `dependents`, `stale-docs`, `project-info`.

## [0.3.0] - 2026-03-16

### Fixed

- Removed misleading `AUTO-GENERATED - do not edit directly` comment from `templates/CLAUDE.md.tmpl`. Plugin repos are expected to edit the generated file; the comment was incorrect.
- Removed redundant `Be concise` clause from rule 8 in the template (flagged by agnix as redundant).

## [0.2.0] - 2026-03-15

### Added

- `lib/binary/` - Binary resolver for the `agent-analyzer` Rust binary. Handles lazy download from GitHub releases at runtime (no postinstall hook). Supports 5 platform targets, `tar.gz`/`zip` extraction, version checking, and auto-upgrade. Uses only Node.js built-ins; zero external npm dependencies. Exports `ensureBinary`, `runAnalyzer`, and related utilities.
- `lib/collectors/git.js` - Git history collector that runs `agent-analyzer repo-intel init` and extracts health metrics: hotspots, contributors, AI ratio, bus factor, conventions, and release info. Registered in the `collect()` dispatch in `lib/collectors/index.js`.

### Changed

- Updated `lib/collectors/git.js` for the `RepoIntelData` schema: added `recentChanges` to hotspot output and `confidence` field to `aiAttribution`.

## [0.1.1] - 2026-03-06

### Added

- Added `agent-knowledge` as a git submodule, centralizing the knowledge base in [agent-sh/agent-knowledge](https://github.com/agent-sh/agent-knowledge) and sharing it across all plugin repos.

## [0.1.0] - 2026-02-22

### Added

- CI workflow calling the reusable workflow from `agent-sh/.github`.
- Automated Claude Code PR review (restricted to owner/member/collaborator, max 3 runs per PR).
- Claude Code `@mentions` support in PR comments.
- Pre-push hook that runs tests before push.
- agnix validation step in the CI pipeline.
- CLAUDE.md sync: template (`templates/CLAUDE.md.tmpl`) and generator script (`scripts/generate-claudemd.js`) that produce a consistent `CLAUDE.md` for each consumer plugin repo during the sync workflow.
- Extended sync matrix to all 12 graduated plugin repos.

## [0.0.1] - 2026-02-21

### Added

- Initial seed: `lib/` directory ported from agentsys, covering platform detection, pattern matching, workflow state, collectors, adapters, and utilities.
- Sync workflow that triggers `lib/` propagation to consumer repos on push to `main`.

[Unreleased]: https://github.com/agent-sh/agent-core/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/agent-sh/agent-core/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/agent-sh/agent-core/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/agent-sh/agent-core/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/agent-sh/agent-core/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/agent-sh/agent-core/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/agent-sh/agent-core/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/agent-sh/agent-core/releases/tag/v0.0.1
