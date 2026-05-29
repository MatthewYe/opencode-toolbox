# opencode-toolbox

OpenCode plugin — skills, agents, commands, and docs for an autopilot (autonomous) development workflow. Published as `@matthewye/opencode-toolbox`.

## Quick start

**Runtime**: Bun (not npm/node). `bun.lock` exists.

```bash
bun install           # install deps
bun run build         # compile src/index.ts → dist/
bun run dev           # watch mode
```

Entry point (for npm consumers): `dist/index.js`. `dist/` is gitignored — must build before publish.

No test, lint, or typecheck commands exist. `tsconfig.json` is for editor support only.

## Architecture

The plugin reads `.md` files at runtime via `gray-matter` (YAML frontmatter), then injects them into OpenCode's config hook (`src/index.ts:65-91`):

| Source dir | Injected as |
|------------|-------------|
| `agents/*.md` | `config.agent` (implementer, reviewer, argus) |
| `commands/*.md` | `config.command` (autopilot) |
| `skills/` | `config.skills.paths` |
| `upstream/skills/engineering/` | `config.skills.paths` |
| `upstream/skills/productivity/` | `config.skills.paths` |

Only skill paths need code-level registration. Agent/command registration is automatic from `.md` frontmatter.

## Upstream skills (git subtree)

`upstream/` is a squashed import of [mattpocock/skills](https://github.com/mattpocock/skills). To sync:

```bash
git subtree pull --prefix=upstream/ mattpocock-skills main --squash
```

**Do not modify files in `upstream/` directly.** Changes will be clobbered on next sync. Local skills go in `skills/` (e.g., `skill-creator/`, `opencode-plugin-scaffold/`).

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
- **reviewer** — Read-only, no bash/edit. 4-axis review (Behavior alignment, TDD discipline, Code quality, Plan fidelity & cross-module consistency) with inline checklist. Outputs `REVIEWER_REPORT:` with VERDICT: MERGE/RETRY/BLOCKED.

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

## Agent skills context

- **Issue tracker**: GitHub Issues on `MatthewYe/opencode-toolbox`. (See `docs/agents/issue-tracker.md`.)
- **Triage labels**: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. (See `docs/agents/triage-labels.md`.)
- **Domain docs**: `CONTEXT.md` + `docs/adr/` — these apply to the *consuming* repo (where the plugin is installed), not to opencode-toolbox itself. This repo has no root-level `CONTEXT.md`; only `upstream/CONTEXT.md` exists.

## Install

Add to your `opencode.json`:

```json
{ "plugin": ["@matthewye/opencode-toolbox"] }
```

Or from local path: `{ "plugin": ["/path/to/opencode-toolbox"] }`.
