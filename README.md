# opencode-toolbox

Autopilot agent cluster for [opencode](https://github.com/anomalyco/opencode) — autonomous feature kit with TDD discipline.

## Contents

| Path | What |
|------|------|
| `skills/skill-creator/` | Skill creator — create and improve agent skills |
| `upstream/skills/engineering/` | Engineering skills (tdd, diagnose, triage, etc.) — synced from mattpocock/skills |
| `upstream/skills/productivity/` | Productivity skills (caveman, grill-me, etc.) — synced from mattpocock/skills |
| `agents/implementer.md` | Implementer agent — reads AGENT-BRIEF, implements with TDD |
| `agents/reviewer.md` | Reviewer agent — 3-axis review (Behavior, TDD, Code Quality) |
| `commands/autopilot.md` | Autopilot orchestrator command — scans .scratch/, dispatches implementer to reviewer |
| `docs/agents/reviewer-checklist.md` | Reviewer criteria checklist |

## Install

Add to your `opencode.json`:

```json
{ "plugin": ["@MatthewYe/opencode-toolbox"] }
```

The plugin auto-registers skills, agents, and the `/autopilot` command. No symlinks or manual config merging needed.

## Usage

```
/autopilot                    # Scan .scratch/ for ready issues and process one
/autopilot .scratch/feat/issues/01-add-login  # Process a specific issue
```

## License

MIT
