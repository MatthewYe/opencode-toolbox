# Migrate installation from symlink to OpenCode Plugin

**Status**: accepted

## Context

opencode-toolbox originally installed via `install.sh`, which symlinked `skills/`, `agents/`, `commands/`, `docs/` into `~/.config/opencode/`. Users also had to manually merge `opencode.jsonc.example` agent definitions. This required running a script, and every file was individually symlinked to avoid disturbing existing config.

## Decision

Adopt OpenCode's native plugin mechanism (Config 纯注入型). A single `index.js` entry point uses the `config` hook to programmatically inject:

- `config.skills.paths` — registers the skills directory
- `config.agent` — injects implementer and reviewer agent definitions
- `config.command` — injects the `/afk` command definition

Install becomes one line in `opencode.json`: `"plugin": ["@MatthewYe/opencode-toolbox"]`.

## Considered options

1. **Symlink install (old way)**: Transparent, no code. But requires running a script, managing symlinks, and manual config merging.
2. **Config 纯注入 plugin (chosen)**: Zero user-side steps after one config line. Agent/command definitions sourced from existing markdown files at runtime — content remains in `.md`, code only reads and injects.
3. **Skills 注入型 (superpowers pattern)**: Would add `system.transform` for bootstrap messages. Unnecessary — OpenCode's native `skill` mechanism already handles discovery.

## Consequences

- `install.sh` and `opencode.jsonc.example` removed permanently
- Project now requires `gray-matter` dependency for YAML frontmatter parsing
- Agent definitions no longer duplicated between markdown files and `opencode.jsonc`
- Skills paths hardcoded in agent `.md` files (e.g., `~/.config/opencode/skills/tdd/`) still reference old paths — needs separate follow-up
