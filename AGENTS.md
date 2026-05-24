# opencode-toolbox

OpenCode plugin — skills, agents, commands, and docs that enable an autopilot (autonomous) development workflow. Not a software project; no build, test, lint, or typecheck commands.

## Install

Add to your `opencode.json`:

```json
{ "plugin": ["@MatthewYe/opencode-toolbox"] }
```

Or install from local path while developing:

```json
{ "plugin": ["/path/to/opencode-toolbox"] }
```

The plugin auto-registers skills, agents, and the `/autopilot` command. No symlinks or manual config merging needed.

## Autopilot workflow

`/autopilot` scans `.scratch/*/issues/*.md` for `Status: ready-for-agent`, dispatches `implementer` → `reviewer`, retries up to 3 rounds. Pass a specific directory to process one: `/autopilot .scratch/feat/issues/01-add-login`.

### Issue structure

```
.scratch/<feature>/issues/<NN-slug>/
├── issue.md          # Has `Status: ready-for-agent` (or `in-progress`, `resolved`, `needs-info`)
└── AGENT-BRIEF.md    # Acceptance Criteria + Out of scope — THE contract
```

### Agents

- **implementer** — Reads AGENT-BRIEF, executes TDD per AC, self-reviews, outputs `IMPLEMENTER_REPORT:`. Retry mode skips self-review, fixes only Critical issues.
- **reviewer** — Read-only, no bash/edit. 3-axis review (Behavior alignment, TDD discipline, Code quality) against `docs/agents/reviewer-checklist.md`. Outputs `REVIEWER_REPORT:` with VERDICT: MERGE/RETRY/BLOCKED.

### Structured output formats

Implementer and reviewer MUST use these exact report headers — the orchestrator parses them:

```
IMPLEMENTER_REPORT:
ROUND: <N>
STATUS: DONE | BLOCKED | NEEDS_CONTEXT
SELF_REVIEW: ...
CHANGED_FILES: ...
SUMMARY: ...
```

```
REVIEWER_REPORT:
## Critical / Important / Suggestion
VERDICT: MERGE | RETRY | BLOCKED
```

### TDD discipline

Required by both agents (loaded from `skills/tdd/`):
- Never write production code without a failing test first
- Tests verify behavior through public interfaces, not implementation
- Mock only at system boundaries (external API, DB, filesystem, time)
- Vertical slices: one test → one implementation → repeat. Never batch all tests first.

### Retry loop

Max 3 rounds (first + 2 retries). If RETRY on round 3 → issue goes to `needs-info` for human.

## Agent skills

### Issue tracker

GitHub Issues on `MatthewYe/opencode-toolbox`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
