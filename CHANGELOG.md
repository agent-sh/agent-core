# Changelog

All notable changes to agent-core are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Changed

- The sync takes a per-consumer exclude list, `sync-exclude.json`: each entry names lib files the sync leaves as the consumer has them, with the reason. deslop and repo-intel list the nine runners and probes that carry their host-authorization callback (deslop#74 and #75, repo-intel#34 and #35). The 2026-10-05 sync (deslop#77, repo-intel#37) overwrote them, which failed 9 of their authorized-execution tests. The rules come first in the rsync filter, so they win over the allowlist includes. `scripts/sync-exclude.js` rejects a repo key that is not in the sync matrix, so a typo fails the sync instead of silently keeping no files. Every job validates the whole file, so one bad entry fails all of them. `scripts/sync-exclude.test.js` checks the checked-in list against `lib/` and the sync matrix, and runs the workflow's own rsync filters on a scratch tree: an excluded file survives, the same file is overwritten for a consumer without the entry.
- `templates/AGENTS.md.tmpl` follows the current-model style the consumer repos moved to: a "This repo is" paragraph that says what the plugin is and which `lib/` files the sync owns, plain Conventions with the reason for each rule, and Dev commands every consumer can run (`npm test` where defined, `agnix .`). The agent, skill and command lists move to the end, so the `[CRITICAL]` marker stays out of agnix's lost-in-the-middle zone in short files. It drops the bold Critical Rules list, the generic model table, the GPU validation text that does not apply to these CPU-only plugins, and `npm run validate`, which 6 of the 13 synced consumers do not define. Placeholders, conditional sections and the managed markers are unchanged. Generated output passes agnix with no rules disabled.
- `planShimSpawn` passes `/v:off` to cmd.exe. A user whose cmd.exe enables delayed expansion by default (the `DelayedExpansion` registry value) got `!NAME!` in a batch-shim argument replaced by the value of `NAME`. The plan is now `/d /v:off /s /c`. deslop and repo-intel already carried this fix locally (deslop#73, repo-intel#33), so the core sync was reverting it there. `lib/utils/command-parser.test.js` pins the plan and runs the delayed-expansion check on Windows, with a control that shows the substitution when `/v:off` is missing.

### Fixed

- Adapter transforms point plugin paths at the agentsys install layout (`~/.agentsys/plugins/<plugin>/`) instead of Claude Code's versioned plugin cache, matching agent-sh/agentsys#413 so the next sync does not revert it:
  - Skill transforms for Kiro, Cursor, OpenCode (with `pluginInstallPath`) and the new `transformSkillForCodex` replace "two directories up from this skill" with the plugin install path. Two directories up from `~/.kiro/skills/<name>/` is `~/.kiro`, and the other platforms' skills directories have the same problem.
  - Skill, command and agent transforms on every platform rewrite `**/<plugin>/*/` globs to `**/<plugin>/**/`, which matches with or without a version directory (consult-agent, debate-orchestrator, sync-docs-agent, prepare-delivery-agent, the debate command and reference). Only plugin names change: the plugin itself, the plugins installed next to it, and for OpenCode the plugins under `repoRoot`. A glob such as `**/src/*/index.ts` keeps its single directory level.
  - With an install path (Kiro, Cursor and Codex), `${CLAUDE_PLUGIN_ROOT}/../../<plugin>/*/` becomes `~/.agentsys/plugins/<plugin>/`, so the debate prompt finds consult's ACP runner at `~/.agentsys/plugins/consult/acp/run.js`. OpenCode keeps its `${PLUGIN_ROOT}` placeholder, so only its globs change.
  - `transformSkillForCodex` keeps a plugin skill's frontmatter and maps `AskUserQuestion` to `request_user_input`, as `transformForCodex` does for commands.
  - The OpenCode body transform adds its agent note only when the content mentions an agent. The install path a skill transform inserts (`~/.agentsys/...`) no longer counts, so consult, deslop and validate-delivery `SKILL.md` stay as they were on OpenCode.
- The enhance project-memory analyzer accepts the headings the template and consumer files use. `missing_critical_rules` passes on any `## Rules`, `## <word> rules`, `## Conventions` or `## <word> conventions` heading, not only `## Critical Rules`, `## Priority Rules` or `## Must-know`. `missing_architecture` accepts `## Project overview` (the heading agnix AGM-004 asks for) and `## Layout`. Before this, `/enhance` reported HIGH `missing_critical_rules` on the template output and told maintainers to add back the section the template dropped.
- The docs analyzer's `broken_internal_link` check resolves a relative link against the directory of the file that holds it and checks the target on disk. Before, it looked the link up in a list of `.md` paths relative to the analyzed directory, and in an empty list when it analyzed one file, so a single file reported every relative file link as broken, and a directory run flagged sibling links from nested files, links that leave the directory and links to non-markdown files. URLs with a scheme (`mailto:`) and root-relative paths are no longer checked as files, and a link title (`[a](b.md "Title")`) is no longer read as part of the path.
- `broken_internal_link` no longer reports code as links, reads parentheses in link paths, and generates heading anchors the way GitHub does. Links in fenced, indented and inline code (`fns[i](arg)`) were checked as links, and a `# comment` line in a code block counted as a heading. A link path was cut at the first `)`, so `[a](file(1).md)` checked `file(1`; parentheses now nest, and `\(` and `<...>` targets work too. Heading anchors collapsed runs of spaces and dropped `_` and non-ASCII letters, so "Research & Testing" gave `research-testing` where GitHub gives `research--testing`; they now follow GitHub's rule, number repeated headings `-1`, `-2` as github-slugger does, drop closing `#`s, link syntax (also a link whose text holds code), HTML comments such as `<!-- omit in toc -->`, HTML tags, entities such as `&nbsp;` and `_` emphasis, end a heading at a line break only (not at U+2028), and accept anchors with a title, an escape or percent-encoding. A link path that nests more than 32 parentheses is not a link, as in cmark, which keeps a run of `[a](` cheap to scan.
- Restored the Cursor and Kiro discovery and transformation APIs used by consumer installers. A prior core sync removed these exports while AgentSys continued calling them.
- `lib/agentsys.js`, the runtime resolver, is now part of the shared lib and the sync allowlist. `collectors/analyzer-queries.js` already requires it as `../agentsys`, and ship's `/release` loads it, but agent-core never shipped it: each consumer kept its own copy, and the old mirroring sync deleted ship's on 2026-04-25 while `/release` still needed it. The file is the copy enhance, deslop and drift-detect carry (with the `__dirname`-first lookup from enhance#33) with its header comment updated to describe that lookup, so the sync changes only that comment for them and adds the file to the other consumers.
- The enhance agent analyzer's `analyzeAllAgents()` accepts a single agent file. It called `readdirSync` on the path it was given, so a file path threw `ENOTDIR`, and enhance's `enhance-agent-prompts <file>`, which passes the user's path straight through, crashed. A file path now gives a one-entry array for that file; a directory works as before. `lib/enhance/agent-analyzer.test.js` covers a file, a relative file path, a directory, verbose on a file, and `analyze({ agentsDir })` with a file.
- `analyzeAllSkills()`, `analyzeAllHooks()`, `analyzeAllDocs()` and `analyzeAllPrompts()` accept a single file. Each walked its path with `readdirSync` inside a `try`/`catch`, so a file path threw `ENOTDIR`, the catch swallowed it, and the result was `[]`: enhance's `enhance-skills <SKILL.md>` and `enhance-hooks <file>` reported nothing. A file path now gives a one-entry array for that file, the same as `analyzeAllAgents()`. `analyzeAllHooks()` analyzes only a `.md` file, the one kind of hook it reads, and still returns `[]` for a JSON config or a script, as the directory walk does. `lib/enhance/analyze-all-file-path.test.js` covers a file, a relative file path, a directory, verbose on a file and a directory, a missing path, and a hook config file.
- The enhance skill and hook analyzers take `{ verbose }` like the other analyzers: `analyzeSkill()`, `analyzeAllSkills()`, `analyzeHook()`, `analyzeAllHooks()` and both `analyze()` functions drop LOW certainty findings unless `verbose` is set. No skill or hook pattern is LOW today, so the output does not change yet; the option is there so enhance's `--verbose` reaches these analyzers too.

### Tests

- `lib/adapter-transforms.test.js` covers the install-layout rewrites for skills on Kiro, Cursor, Codex and OpenCode, Codex skill frontmatter, versioned-cache paths in Kiro, Codex, Cursor and OpenCode commands and agents, globs on names that are not plugins, and the OpenCode agent note next to an install path.
- Added regression coverage for the shared Cursor/Kiro API surface, command discovery mappings, and Kiro agent JSON generation.
- A root `package.json` with `"test": "node --test"`, so the shared Node CI runs the repo's own `*.test.js` files. Before, CI printed "No test script defined" and ran none of them. CI runs them on Node 18, 22, 24 and 26.
- `lib/enhance/docs-analyzer.test.js` covers relative links from a single file, from a nested file in a directory run, and from a relative doc path. It also covers links in fenced, indented, quoted, inline and CRLF code, parentheses in link paths, and GitHub heading anchors.

## [0.4.5] - 2026-04-26

### Security
- **lib/binary: client-side SLSA build-provenance verification** (#16). After SHA-256 sidecar check, the downloader spawns `gh attestation verify <file> --repo agent-sh/agent-analyzer --format json`. On mismatch the binary is refused before extraction. Soft-warns if `gh` is not on PATH; set `AGENT_ANALYZER_REQUIRE_ATTESTATION=1` to make missing `gh` a hard fail.
- **ensureBinarySync forwards requireAttestation** to its child process (previously silently dropped).
- **Sync workflow allowlist** (#17). Replaced broad `rsync -a` with explicit `--include`/`--exclude` rules. Test files and known-internal subdirs (`dev-only/`, `scripts/`, `.cache/`, `.internal/`) never propagate. Filter-rule ordering documented - exclude rules come BEFORE subdir includes or they never fire.

## [0.4.4] - 2026-04-26

### Security
- **lib/enhance/fixer.js refuses symlinked targets + closes TOCTOU race** (#15). Before each read/backup/write, `assertNotSymlink` calls `fs.lstatSync` and refuses operations on symbolic links. Both the initial check and the check immediately before write are present, closing the gap where an attacker could swap a regular file for a symlink between calls. Previously a hostile repo could point `agent.md` at `~/.ssh/authorized_keys` and a HIGH-certainty auto-fix would overwrite the target.

## [0.4.3] - 2026-04-26

### Fixed

- **lib/cross-platform: `truncate` is code-point-safe again**. Uses `[...text]` spread to slice on Unicode code points (not UTF-16 code units), so emoji on the boundary don't end up as orphan surrogates. Also returns the input unchanged for `maxLength <= 0` instead of a bare `"..."`. Upstreamed from agentsys where the regression was caught first.
- **Sync workflow excludes `*.test.js`** to stop agent-core's inline `node:test` suites from breaking consumers that run Jest with a broad `testMatch`. Consumers that want to run the tests can copy the file in individually.

## [0.4.2] - 2026-04-26

### Fixed

- **Sync workflow is now additive** (#14). Previously `rm -rf target/lib/ && cp -r source/lib/` mirrored agent-core onto consumer repos, silently deleting any file that existed only downstream. Switched to `rsync` without `--delete`. A follow-up should move to an explicit allowlist for tighter supply-chain control.

### Added

- `lib/repo-intel/queries.js` - 28 typed wrappers over `agent-analyzer repo-intel query <type>`. Upstreamed from agentsys where it had been maintained out-of-band. Consumers can now call `require('@agentsys/lib').repoIntel.queries.hotspots(cwd, { limit: 20 })` uniformly.
- `lib/state/workflow-state.js` gains `updateTasks`, `readTasks`, `claimTask`, `releaseTask`, `defaultTasksSchema`, `normalizeTasksData`. Stricter schema validation and atomic updates for the shared `tasks.json` registry. Also upstreamed from agentsys.

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

[Unreleased]: https://github.com/agent-sh/agent-core/compare/v0.4.4...HEAD
[0.4.4]: https://github.com/agent-sh/agent-core/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/agent-sh/agent-core/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/agent-sh/agent-core/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/agent-sh/agent-core/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/agent-sh/agent-core/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/agent-sh/agent-core/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/agent-sh/agent-core/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/agent-sh/agent-core/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/agent-sh/agent-core/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/agent-sh/agent-core/releases/tag/v0.0.1
