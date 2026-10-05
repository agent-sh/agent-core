# agent-core

Shared core libraries for all agent-sh plugins. Changes here are automatically synced to consuming repos via CI-driven PRs.

## Consumers

| Repo | How it receives lib/ and AGENTS.md |
|------|------------------------------------|
| agentsys | PR → merge → `sync-lib` propagates to bundled plugins |
| next-task | PR → merge (plugin uses lib/ directly) |
| ship | PR → merge (plugin uses lib/ directly) |
| enhance | PR → merge (plugin uses lib/ directly) |
| deslop | PR → merge (plugin uses lib/ directly) |
| learn | PR → merge (plugin uses lib/ directly) |
| consult | PR → merge (plugin uses lib/ directly) |
| debate | PR → merge (plugin uses lib/ directly) |
| drift-detect | PR → merge (plugin uses lib/ directly) |
| sync-docs | PR → merge (plugin uses lib/ directly) |
| audit-project | PR → merge (plugin uses lib/ directly) |
| perf | PR → merge (plugin uses lib/ directly) |
| web-ctl | PR → merge (plugin uses lib/ directly) |

## How sync works

On merge to `main`, the `sync` workflow opens PRs in all consumer repos with the updated `lib/` directory and an `AGENTS.md` initialized from `templates/AGENTS.md.tmpl` when absent. Existing manually maintained instruction files are preserved. Consumer repos review and merge at their own pace.

## AGENTS.md generation

New consumer instruction files are generated from `templates/AGENTS.md.tmpl` inside an `agent-core:instructions` marker block. Later runs update only that block and preserve all text outside it. Files without the markers are maintained by their repository and remain byte-for-byte unchanged. Malformed markers and symlinks fail closed. The generator reads `package.json` and optionally `components.json` from the target repo.

Available template variables:
- `{{pluginName}}` - package name with `@agentsys/` prefix stripped
- `{{description}}` - package.json description
- `{{#agents}}` / `{{#skills}}` / `{{#commands}}` - conditional sections from components.json

To test generation locally:

```bash
node scripts/generate-agents-md.js --target ../some-plugin --template templates/AGENTS.md.tmpl
```

## Developing

Edit files in `lib/` for library changes. `npm test` runs agent-core's own tests (`node --test`, Node 18 or later). Edit `templates/AGENTS.md.tmpl` to change the managed block in generated AGENTS.md files. On merge, changes propagate automatically. To test locally before merging:

```bash
# Copy to a consumer repo for testing
cp -r lib/ ../agentsys/lib/
cd ../agentsys && npx agentsys-dev sync-lib && npm test
```
