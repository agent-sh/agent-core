# agent-core

Shared core libraries for all agent-sh plugins. Changes here are automatically synced to consuming repos via CI-driven PRs.

## Consumers

| Repo | How it receives lib/ |
|------|---------------------|
| agentsys | PR → merge → `sync-lib` propagates to 13 bundled plugins |
| agnix | PR → merge (plugin uses lib/ directly) |
| web-ctl | PR → merge (plugin uses lib/ directly) |

## How sync works

On merge to `main`, the `sync-core` workflow opens PRs in all consumer repos with the updated `lib/` directory. Consumer repos review and merge at their own pace.

## Developing

Edit files in `lib/`. On merge, changes propagate automatically. To test locally before merging:

```bash
# Copy to a consumer repo for testing
cp -r lib/ ../agentsys/lib/
cd ../agentsys && npx agentsys-dev sync-lib && npm test
```
