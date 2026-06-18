---
name: autopilot
description: Put issue resolution on autopilot — scans GitHub Issues and local .scratch/ files for ready-for-agent issues, dispatches implementer → reviewer subagents in a retry loop. After issues complete, runs global meta-review. Use when processing autopilot issues from any source.
---

# Autopilot (Codex Edition)

Execute the autopilot orchestrator workflow using Codex subagent dispatch.

## Toolchain

You have:
- `spawn_agent(agent_type, items, message)` — dispatch subagent. Agent types: `implementer`, `reviewer`, `argus`, `default`, `worker`.
- `wait_agent(targets, timeout_ms)` — wait for subagent completion. Returns completed status with agent's final message.
- `send_input(target, message, interrupt)` — send follow-up message to existing subagent. Set `interrupt=true` to preempt current task.
- `close_agent(target)` — close a completed subagent to free concurrency slots.
- `exec_command` — shell commands (`gh`, `rg`, `bun test`, etc.)
- `apply_patch` — file edits
- GitHub MCP tools (`mcp__github__get_issue`, `mcp__github__update_issue`, `mcp__github__add_issue_comment`, `mcp__github__list_issues`) — issue management

Skills passed to subagents via `items`: `skills/tdd/`, `skills/diagnose/`, `skills/zoom-out/`.

## Issue Sources

| Source | Detection | State | Contract |
|--------|-----------|-------|----------|
| GitHub Issue | `#N` or scan label `ready-for-agent` | Labels: `in-progress`, `resolved`, `needs-info` | Issue body (What to build + Acceptance criteria) |
| Local .scratch/ | `.scratch/*/issues/*/issue.md` with `Status: ready-for-agent` | Frontmatter `Status:` | `<issue_dir>/AGENT-BRIEF.md` |

### GitHub label ↔ local Status mapping

| Label | Frontmatter Status | Meaning |
|-------|--------------------|---------|
| `ready-for-agent` | `ready-for-agent` | Ready for autopilot |
| `in-progress` | `in-progress` | Currently being processed |
| `resolved` | `resolved` | Implemented + reviewed, done |
| `needs-info` | `needs-info` | Blocked, needs human input |

---

## Phase 1: Dispatch Loop

Process issues one at a time. Max 3 rounds per issue (retry_count = 0, 1, 2).

### 0. Parse targets

If the user passed specific targets (e.g., `#43 ~ #46` or `.scratch/auth/issues/01-login`):
- Parse GitHub issue numbers or local paths
- For GitHub: fetch each issue via `mcp__github__get_issue`, check labels include `ready-for-agent` or `in-progress`
- For local: read `issue.md`, check `Status:` frontmatter

If no targets passed, scan both sources:
- GitHub: `mcp__github__list_issues(labels=["ready-for-agent"], state="open")`
- Local: `exec_command("rg -l 'Status: ready-for-agent' .scratch/*/issues/*/issue.md")`
- Process first match, then loop

### 1. Initialize issue

**GitHub**: Update label to `in-progress` via `mcp__github__update_issue`. Add comment: `autopilot: 开始处理 #N (Round 0)`.
**Local**: Edit issue.md `Status:` to `in-progress`. Append timestamp comment to `## Comments`.

### 2. Toolchain check

Run `which bun` (or project-appropriate tool). Set `TOOLCHAIN: available` or `TOOLCHAIN: unavailable`.

### 3. Detect SIBLING_CONTEXT (optional)

If the issue references a parent PRD, scan sibling resolved issues for cross-issue context. Assemble as `SIBLING_CONTEXT` string.

### 4. Dispatch implementer

Use `spawn_agent`:

```
agent_type: "implementer"
items: [
  {type:"skill", path:"skills/tdd/"},
  {type:"skill", path:"skills/diagnose/"},
  {type:"skill", path:"skills/zoom-out/"}
]
message: <IMPLEMENTER_DISPATCH_TEMPLATE>
```

See [IMPLEMENTER_DISPATCH_TEMPLATE](#implementer-dispatch-template) below for the exact message format.

### 5. Wait for implementer

```javascript
wait_agent(targets=[impl_agent_id], timeout_ms=600000)
```

Parse the completed status message for `IMPLEMENTER_REPORT:`.

If no report found (empty reply or parse error): retry once (new spawn). If still no report: mark `needs-info`, stop.

### 6. Process implementer result

**STATUS: DONE** → Dispatch reviewer (step 7).
**STATUS: UNVERIFIED** → Dispatch reviewer with `UNVERIFIED: true` flag.
**STATUS: BLOCKED or NEEDS_CONTEXT** → Mark `needs-info`, add comment, stop.

### 6b. Commit changes

After implementer STATUS: DONE, commit to isolate this issue's changes:

This gives reviewer a clean diff boundary via `git show HEAD`.

### 7. Dispatch reviewer

Use `spawn_agent` (new agent per issue):

```
agent_type: "reviewer"
items: [
  {type:"skill", path:"skills/tdd/"},
  {type:"text", text: <DIFF>}
]
message: <REVIEWER_DISPATCH_TEMPLATE>
```

See [REVIEWER_DISPATCH_TEMPLATE](#reviewer-dispatch-template) below.

### 8. Wait for reviewer

```javascript
wait_agent(targets=[rev_agent_id], timeout_ms=600000)
```

Parse for `REVIEWER_REPORT:` and `VERDICT: MERGE | RETRY | BLOCKED | VERIFY_NEEDED`.

### 9. Handle verdict

**MERGE** → Mark `resolved`. Close reviewer agent. Go to next issue.
**VERIFY_NEEDED** → Try running build/tests. If pass → `resolved`. If fail → `needs-info`.
**RETRY** → increment retry_count.
  - retry_count < 3: `send_input(interrupt=true)` with `PREV_REVIEW` to existing implementer. If agent is closed, spawn new implementer.
  - retry_count >= 3: mark `needs-info`, add review summary, go to next issue.
**BLOCKED** → Mark `needs-info`, go to next issue.

After verdict handled, close agents to free concurrency slots:
```javascript
close_agent(target=impl_agent_id)
close_agent(target=rev_agent_id)
```

### 9b. Git cleanup (retry case)

If RETRY occurred, undo the stale commit before next implementer round:
```bash
git reset --soft HEAD~1
```

### 10. Handle suggestions (cross-issue)

If reviewer report has `## Suggestion` items:
- **Local mode**: Write to `.scratch/<feature>/suggestions.json`
- **GitHub mode**: Add issue comment: `autopilot suggestion [pending]: <content>` AND write to local file if feature directory exists

### 11. Loop

Return to step 0 (scan for next ready-for-agent issue). When no more issues → Phase 2.

---

## Phase 2: Global Meta-Review

### 1. Parallel dispatch

**A) Spawn reviewer** (same as Phase 1 step 7, but with meta-review scope):

```
agent_type: "reviewer"
items: [{type:"skill", path:"skills/tdd/"}]
message: <META_REVIEWER_TEMPLATE>
```

**B) Orchestrator self-review** (run concurrently):
- Scan for cross-module inconsistencies: `rg` for import styles, entry detection patterns
- Check for orphan files: `git diff --stat` against parent branch
- Verify build passes: run build command
- Check test coverage: run test suite

### 2. Merge reports

Union of Critical + Important items from both reports. Default to stricter finding on conflicts.

### 3. Fix loop (max 2 rounds)

Fix merged Critical + Important items directly (no subagent dispatch for meta fixes — these are mechanical). Verify with build + tests.

---

## Implementer Dispatch Template

Copy this EXACT text as the `message` parameter, replacing `<PLACEHOLDERS>`:

```
You are the autopilot implementer. Read the items passed to you (tdd, diagnose, zoom-out skills), then complete the task below.

## Contract

<ISSUE_BODY — the full What to build + Acceptance criteria from the issue>

## Context

SOURCE: <github|local>
ISSUE_ID: <#N or path>
ROUND: <N — 0 for first attempt>
TOOLCHAIN: <available|unavailable>
SIBLING_CONTEXT: <string or "none">

<PREV_REVIEW — only if ROUND >= 1>

## Instructions

1. Read the skills passed via items: tdd (test discipline), diagnose (debugging), zoom-out (codebase navigation)
2. Implement ALL Acceptance Criteria following TDD: write a failing test first, then minimal production code, then refactor
3. Never write production code without a preceding failing test
4. Mock only at system boundaries (external API, DB, filesystem, time)
5. Test behavior through public interfaces, not implementation details

## Self-Review

After all ACs are implemented, verify:
- Every AC has corresponding test coverage
- No scope creep (nothing from Out of scope was implemented)
- Tests verify behavior, not internals
- Mocks are only at system boundaries

## Report Format

Output EXACTLY in this format:

IMPLEMENTER_REPORT:
ROUND: <N>
STATUS: DONE | UNVERIFIED | BLOCKED | NEEDS_CONTEXT
SELF_REVIEW:
- Finding: <description> → Fixed
- No issues
CHANGED_FILES:
- path/to/file (what changed)
SUMMARY: One sentence summary

Status rules:
- DONE only if TOOLCHAIN=available AND all ACs have test evidence
- UNVERIFIED if TOOLCHAIN=unavailable (list per-AC verification method)
- BLOCKED if diagnose failed twice
- NEEDS_CONTEXT if ambiguous scope
```

---

## Reviewer Dispatch Template

Copy this EXACT text as the `message` parameter, replacing `<PLACEHOLDERS>`:

```
You are the autopilot reviewer. You are READ-ONLY — do not edit any files or run commands that modify state. Read the tdd skill passed via items for test quality standards.

## Contract

<ISSUE_BODY — the full What to build + Acceptance criteria from the issue>

## Context

SOURCE: <github|local>
ISSUE_ID: <#N or path>
ROUND: <N>
BASE_COMMIT: <commit sha — the commit created in step 6b>
CHANGED_FILES: <list from implementer report>
IMPLEMENTER_REPORT: <full implementer report text>
SIBLING_CONTEXT: <string or "none">
UNVERIFIED: <true if implementer reported UNVERIFIED, omit otherwise>

## Diff to Review

The DIFF text passed in items shows the exact changes for this issue. Use this diff as the review boundary — do not run `git diff` yourself. The diff text item contains the output of `git show HEAD`.

## Review Dimensions

### Dimension 1: Behavior Alignment
- Does each AC have corresponding test coverage?
- Do tests cover edge cases and error conditions?
- Is there scope creep (implemented something in Out of scope)?
- Is there scope gap (missed an AC or partial implementation)?

### Dimension 2: TDD Discipline (refer to tdd skill)
- Is there production code without a preceding failing test?
- Do tests verify behavior through public interfaces?
- Are mocks only at system boundaries?
- Can you distinguish "test passes" from "test is correct"?

### Dimension 3: Code Quality
- Does naming use project domain vocabulary?
- Does new code follow existing patterns?
- Are interfaces small and testable?
- Any undeclared dependencies?

### Dimension 4: Plan Fidelity & Cross-Module Consistency
- Do global constraints from PRD/ADR hold?
- Is entry detection, import style, error handling consistent?
- Any orphan files not in any contract?
- Any undeclared side effects?

## Verdict Rules

| Verdict | Condition |
|---------|-----------|
| MERGE | 0 Critical AND 0 Important |
| RETRY | 1+ Critical OR 1+ Important |
| BLOCKED | Directional error, needs human |
| VERIFY_NEEDED | UNVERIFIED mode: 0 Critical + 0 Important (structure correct, needs toolchain verification) |

## Report Format

Output EXACTLY:

REVIEWER_REPORT:

## Critical (must fix)
- [ ] <issue>

## Important (must fix)
- [ ] <issue>

## Suggestion (optional)
- [ ] <suggestion>
  KEYWORDS: <comma-separated>
  FILES: <comma-separated>

VERDICT: MERGE | RETRY | BLOCKED | VERIFY_NEEDED
```

---

## Meta-Reviewer Template

Same as Reviewer Dispatch Template above, but with this context:

```
You are executing a GLOBAL META-REVIEW. Review the entire codebase, not a single issue.

## Review Scope
- All resolved issues in this PRD
- Cross-module consistency
- ADR/PRD global constraint compliance
- Orphan files and undeclared behavior

## Contract
<All resolved issue contracts, concatenated>

## Context
ALL_RESOLVED_ISSUES: <list of #N or slugs>
SOURCE: github
```
