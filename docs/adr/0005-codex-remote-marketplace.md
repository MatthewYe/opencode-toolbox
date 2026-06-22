 # Codex remote marketplace for autopilot-toolkit-codex
 
 **Status**: accepted
 
 ## Context
 
 The Codex plugin `autopilot-toolkit-codex` (in `packages/codex/`) is currently installable only via local path. We want to make it installable from a remote marketplace.
 
 Codex supports Git-based marketplaces: a repo containing a `.agents/plugins/marketplace.json` at its root, with plugin entries pointing to subdirectories that each contain a `.codex-plugin/plugin.json`.
 
 ## Decision
 
 **Marketplace lives in the same repo** (`autopilot-toolbox`, formerly opencode-toolbox). Built plugin artifacts are published on an orphan `release-codex` branch to keep `main` clean.
 
 ### Marketplace configuration
 
 - **Marketplace `name`**: `autopilot-toolkit`
 - **Plugin `name`**: `autopilot-toolkit-codex`
 - **`source`**: `{ "source": "local", "path": "./packages/codex" }`
 - **`policy.installation`**: `AVAILABLE`
 - **`policy.authentication`**: `ON_INSTALL`
 - **`category`**: `Developer Tools`
 
 ### User install flow
 
 ```bash
 codex plugin marketplace add MatthewYe/autopilot-toolbox --ref release-codex --sparse .agents/plugins --sparse packages/codex
 codex plugin add autopilot-toolkit-codex@autopilot-toolkit
 ```
 
 ## Release branch strategy
 
 Orphan branch `release-codex` holds only marketplace JSON + built plugin directory.
 
 ### CI workflow
 
 Two-trigger strategy: tag push (`v*`) auto + `workflow_dispatch` manual.
 Release job rebuilds codex and force-pushes `release-codex`. Requires `permissions: contents: write`.
 
 ## Consequences
 
 - `.agents/plugins/marketplace.json` committed to `main` as source-of-truth.
 - Repo renamed from `opencode-toolbox` to `autopilot-toolbox`.
 - `release-codex` force-pushed by CI on tag push or manual dispatch.
 - `plugin.json` stays minimal; richer `interface` metadata deferred.
