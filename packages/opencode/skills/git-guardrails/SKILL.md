---
name: git-guardrails
description: Set up OpenCode permission rules to guard against dangerous git commands (push, reset --hard, clean, branch -D, checkout/restore .) before they execute. Use when user wants to prevent destructive git operations, add git safety guardrails, or block dangerous git commands.
compatibility: opencode
---

# Git Guardrails

Sets up `permission.bash` rules in `opencode.jsonc` to require confirmation (`ask`) before executing dangerous git commands.

## What Gets Guarded

- `git push` (all variants including `--force`, `--force-with-lease`)
- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`

When guarded, OpenCode will prompt for confirmation before executing any of these commands.

## Steps

### 1. Ask scope

Ask the user: install for **all projects** (global) or **this project only**?

| Scope | Config path |
|-------|-------------|
| Global | `~/.config/opencode/opencode.jsonc` |
| Project | `<project-root>/opencode.jsonc` |

### 2. Read existing config

Read the target config file. Note existing `permission` block, especially any existing `bash` rules.

If the file does not exist, create it with a minimal structure:
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {}
}
```

### 3. Add guardrail rules

Add or update the following rules under `permission.bash`. Use `"ask"` level — the agent must request confirmation before executing these commands:

```jsonc
"permission": {
  "bash": {
    // ... existing rules ...
    "git push *": "ask",
    "git reset --hard *": "ask",
    "git clean -f*": "ask",
    "git branch -D *": "ask",
    "git checkout .*": "ask"
  }
}
```

Rules to write:

| Pattern | Guards |
|---------|--------|
| `"git push *": "ask"` | All `git push` variants |
| `"git reset --hard *": "ask"` | Hard reset only |
| `"git clean -f*": "ask"` | Forced clean |
| `"git branch -D *": "ask"` | Force delete branch |
| `"git checkout .*": "ask"` | Discard working tree changes |

**Merge carefully**: If the file already has a `permission.bash` block with existing rules, merge the new rules into it — never overwrite unrelated settings.

### 4. Ask about customization

Ask if the user wants to:
- Add additional dangerous commands to guard (e.g., `git stash drop`, `git reflog expire`)
- Remove any of the 5 default patterns
- Change any rule from `"ask"` to `"deny"` (block without confirmation)

Edit the config accordingly.

### 5. Verify

Read back the modified config file and confirm:

1. All 5 guardrail patterns are present under `permission.bash`
2. Existing unrelated rules are preserved
3. JSONC syntax is valid (no trailing commas, matching braces)

Report the final state to the user with a summary of what's now guarded.
