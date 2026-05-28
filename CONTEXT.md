# opencode-toolbox

OpenCode plugin — skills, agents, commands, and autopilot workflow for autonomous development.

## Language

**Autopilot**:
The orchestrator workflow (`/autopilot` command) that dispatches implementer → reviewer in a retry loop (max 3 rounds) per issue, then performs a cross-issue meta-review.
_Avoid_: Agent loop, auto-fix pipeline

**Issue**:
A single unit of work defined by an `issue.md` (with `Status` frontmatter) and an `AGENT-BRIEF.md` contract. Issues live under `.scratch/<feature>/issues/<NN-slug>/`.
_Avoid_: Ticket, task (ambiguous with sub-tasks within an issue)

**Suggestion**:
A reviewer finding at the `Suggestion` severity level — non-blocking, advisory feedback that may apply beyond the current issue. Suggestions are automatically collected from each round's `REVIEWER_REPORT` and stored for cross-issue propagation.
_Avoid_: Recommendation, note, nice-to-have

**Suggestions 文件**:
A global JSON file at `.scratch/<feature>/suggestions.json` that aggregates all Suggestions across issues within a feature. Each entry tracks: source issue, round, content, affected files, keywords, status (pending | resolved | rejected), and which downstream issue resolved it.
_Avoid_: Suggestion log, feedback store

**Suggestion 传递**:
The orchestrator's mechanism for matching pending Suggestions to the next issue being dispatched. Matching compares suggestion file paths (from the source issue's CHANGED_FILES) and keywords against the AGENT-BRIEF — either a file path hit OR a keyword hit triggers a match (OR logic). Matched Suggestions are passed with full reviewer context as background information to the implementer.
_Avoid_: Suggestion forwarding, feedback relay

**Implementer**:
The agent that reads an AGENT-BRIEF and implements acceptance criteria following TDD discipline. In retry rounds, it fixes only Critical items from the previous `REVIEWER_REPORT` and addresses any cross-issue Suggestions matched by the orchestrator.
_Avoid_: Builder, coder

**Reviewer**:
The read-only agent that performs 4-axis review (Behavior alignment, TDD discipline, Code quality, Plan fidelity) and outputs a `REVIEWER_REPORT` with VERDICT (MERGE | RETRY | BLOCKED). Annotates Suggestions with keywords for downstream matching.
_Avoid_: Code reviewer, auditor

**Meta-review**:
The orchestrator's final pass (Phase 2) that performs cross-module consistency checks and produces a `FINAL_ACCEPTANCE_REPORT`. This report surfaces all pending and rejected Suggestions with rationale, serving as input for human sign-off.
_Avoid_: Post-mortem, final review

**Retry loop**:
The implementer → reviewer cycle within a single issue, repeated up to 3 times. Each retry passes only the most recent `REVIEWER_REPORT` to the implementer (as `PREV_REVIEW`). Suggestions are extracted from every round regardless of retry count.
_Avoid_: Iteration loop, fix cycle

### Example dialogue

> **Dev**: "/autopilot .scratch/auth/issues/01-login"
>
> **Orchestrator**: Dispatches implementer for round 0 on `01-login`. Implementer completes, self-reviews. Dispatches reviewer. Reviewer finds a Suggestion: "提取 token 刷新逻辑到独立模块，后续 issue 也可能需要" with keywords `token, refresh, session` and files `src/auth/login.ts`. Verdict: MERGE.
>
> **Orchestrator**: Extracts the Suggestion, writes to `suggestions.json` with status `pending`. Moves to `02-mfa`.
>
> **Orchestrator**: Matches: `02-mfa` AGENT-BRIEF mentions `src/auth/` and `token, session` → hits the pending Suggestion from `01-login`. Passes full reviewer context to implementer.
>
> **Implementer**: Implements MFA, declares resolution of the token-refactor Suggestion in `IMPLEMENTER_REPORT`. Reviewer confirms. Suggestion marked `resolved_in_issue: 02-mfa`.
>
> **Orchestrator** (meta-review): Produces `FINAL_ACCEPTANCE_REPORT` — all Suggestions resolved. Ready for sign-off.
