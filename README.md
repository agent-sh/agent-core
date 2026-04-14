# agent-core

Shared core libraries for all agent-sh plugins. Changes here are automatically synced to consuming repos via CI-driven PRs.

## Consumers

| Repo | How it receives lib/ and CLAUDE.md |
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

On merge to `main`, the `sync` workflow opens PRs in all consumer repos with the updated `lib/` directory and a freshly generated `CLAUDE.md` (rendered from `templates/CLAUDE.md.tmpl`). Consumer repos review and merge at their own pace.

## CLAUDE.md generation

Each consumer repo receives a generated `CLAUDE.md` rendered from `templates/CLAUDE.md.tmpl`. The generator reads `package.json` and optionally `components.json` from the target repo.

Available template variables:
- `{{pluginName}}` - package name with `@agentsys/` prefix stripped
- `{{description}}` - package.json description
- `{{#agents}}` / `{{#skills}}` / `{{#commands}}` - conditional sections from components.json

To test generation locally:

```bash
node scripts/generate-claudemd.js --target ../some-plugin --template templates/CLAUDE.md.tmpl
```

## Developing

Edit files in `lib/` for library changes. Edit `templates/CLAUDE.md.tmpl` to change the CLAUDE.md generated for all consumer plugins. On merge, changes propagate automatically. To test locally before merging:

```bash
# Copy to a consumer repo for testing
cp -r lib/ ../agentsys/lib/
cd ../agentsys && npx agentsys-dev sync-lib && npm test
```
