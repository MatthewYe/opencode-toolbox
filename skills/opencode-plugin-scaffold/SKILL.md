---
name: opencode-plugin-scaffold
description: Create OpenCode plugin scaffolding from scratch or fix existing projects to conform to plugin conventions. Supports npm packages (publishable) and local auto-discovered plugins. Use when the user wants to create a new opencode plugin, scaffold a plugin project, fix/align an existing plugin project, or mentions plugin init, plugin scaffold, or related terms in any language.
compatibility: opencode
---

# OpenCode Plugin Scaffold

Create a new opencode plugin from scratch, or align an existing project with plugin conventions.

## Architecture

An opencode plugin is a TypeScript module exporting an async function:

```
async (PluginInput) => hooks object
```

PluginInput includes: `project`, `client`, `$` (BunShell), `directory`, `worktree`.
Hooks are organized by domain — see `references/hooks.md` for the full catalog.

Two deployment modes:

| | npm | local |
|---|---|---|
| Location | Standalone dir, published to npm | `.opencode/plugins/` or `~/.config/opencode/plugins/` |
| Install | `"plugin"` in `opencode.json` | Auto-discovered, no config needed |
| Build | `bun build` → `dist/` | Run `.ts` directly (Bun native) |
| Naming | Prefix `opencode-*` | No requirement |
| Deps | Listed in `package.json` | External deps go in `.opencode/package.json` |

## Workflow

### Create from scratch

Run `bash scripts/init.sh` for interactive prompts (mode, name, path, publish). The script generates a complete scaffold with a working example tool.

If the script is unavailable, the agent can generate files manually — the script's `gen_*` shell functions serve as the canonical templates (read `scripts/init.sh` to find them). Key templates:

- `gen_package_json` — package.json with correct deps and scripts
- `gen_tsconfig_json` — tsconfig extending `@tsconfig/node22`
- `gen_index_ts_with_tool` — entry with a working example tool (default for `npm` mode)
- `gen_index_ts_empty` — minimal empty skeleton (used for `local` mode and `--fix`)

After scaffolding: `bun install && bun run src/index.ts` to verify the plugin loads.

### Fix an existing project

Run `bash scripts/init.sh --fix <path>`. The script detects what's missing and adds only what's needed — it never overwrites existing files.

If running manually without the script, follow this detection order:

1. `package.json` exists? — if not, generate one. If yes, ensure `@opencode-ai/plugin` in dependencies.
2. `tsconfig.json` exists? — if not, generate one.
3. Entry file (`src/index.ts` or `index.ts`) exists? — if not, generate empty skeleton.
4. Entry file exports a `Plugin` function? — if not, warn and abort (don't overwrite user code).
5. `dist/` directory (npm mode only)? — hint about build setup if missing.

## Common recipes

For specific plugin tasks, see `references/recipes.md`:

- Adding a custom tool
- Injecting environment variables
- Intercepting tool calls
- Registering a subagent / custom agent
- Adding skill paths via config hook
- Adding commands via config hook

## Known pitfalls

| Issue | Impact | Mitigation |
|---|---|---|
| `@latest` cache never updates | npm plugin installed once, never auto-updates | Pin version `@1.0.0`, tell users to clear cache manually |
| `permission.ask` never fires | Hook defined but never called (Issue #7006) | Don't depend on this hook |
| Config key is `"plugin"` (singular) | `"plugins"` (plural) silently ignored | Always use `"plugin"` |
| Repo is `anomalyco/opencode` | Community often miswrites `sst/opencode` | Use correct repo name in docs and references |
