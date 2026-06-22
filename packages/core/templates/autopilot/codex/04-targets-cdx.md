## Issue Sources

| Source | Detection | State | Contract |
|--------|-----------|-------|----------|
| GitHub Issue | `#N` or scan label `ready-for-agent` | Labels: `in-progress`, `resolved`, `needs-info` | Issue body (What to build + Acceptance criteria) |
| Local .scratch/ | `.scratch/*/issues/*/issue.md` with `Status: ready-for-agent` | Frontmatter `Status:` | `<issue_dir>/AGENT-BRIEF.md`

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
