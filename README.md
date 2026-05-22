# opencode-toolbox

AFK agent cluster for [opencode](https://github.com/anomalyco/opencode) — autonomous feature kit with TDD discipline.

## Contents

| Path | What |
|------|------|
| `skills/tdd/` | TDD skill — red-green-refactor loop, tests guide, mocking guide |
| `skills/diagnose/` | Diagnose skill — disciplined bug diagnosis loop |
| `skills/zoom-out/` | Zoom-out skill — higher-level codebase perspective |
| `agents/implementer.md` | Implementer agent — reads AGENT-BRIEF, implements with TDD |
| `agents/reviewer.md` | Reviewer agent — 3-axis review (Behavior, TDD, Code Quality) |
| `commands/afk.md` | AFK orchestrator command — scans .scratch/, dispatches implementer to reviewer |
| `docs/agents/reviewer-checklist.md` | Reviewer criteria checklist |

## Install

```bash
./install.sh
```

This creates symlinks from `~/.config/opencode/` to this repo for `skills/`, `agents/`, `commands/`, and `docs/`.

Then merge the agent definitions from `opencode.jsonc.example` into your `~/.config/opencode/opencode.jsonc`:

```bash
# An agent can handle this for you — just ask:
# "read opencode.jsonc.example and merge the agent block into my opencode.jsonc"
```

## Usage

```
/afk                    # Scan .scratch/ for ready issues and process one
/afk .scratch/feat/issues/01-add-login  # Process a specific issue
```

## License

MIT
