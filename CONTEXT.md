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
The orchestrator's final pass (Phase 2) that dispatches a reviewer subagent in parallel with its own inspection of the codebase. Both produce independent review reports, which are merged using a union strategy (stricter finding wins in conflicts). The merged report drives a fix loop capped at 2 rounds, followed by a `FINAL_ACCEPTANCE_REPORT` that surfaces all pending and rejected Suggestions with rationale for human sign-off.
_Avoid_: Post-mortem, final review

**Retry loop**:
The implementer → reviewer cycle within a single issue, repeated up to 3 times. Each retry passes only the most recent `REVIEWER_REPORT` to the implementer (as `PREV_REVIEW`). Suggestions are extracted from every round regardless of retry count.
_Avoid_: Iteration loop, fix cycle

**audit-autopilot**:
A post-hoc audit skill (`/audit-autopilot`) that analyzes an autopilot session trace to evaluate execution fidelity. Takes an orchestrator session ID as input, auto-discovers child subagent sessions via task call metadata, then scores execution quality across three layers (Fidelity, Errors, Friction & Drift) using a fixed question set.
_Avoid_: Autopilot debugger, session inspector

**Session trace**:
The JSON output of `opencode export <sessionID>` — a full record of an OpenCode conversation containing all messages, tool calls (with input/output), reasoning blocks, and cost/token metadata. Used as the sole input data source for audit-autopilot.
_Avoid_: Session log, conversation dump

**Fidelity score**:
A 3-point rubric (PASS / WARN / FAIL) applied to each analysis question. FAIL and WARN entries must include evidence anchors. Aggregated into an overall fidelity percentage: PASS count ÷ total questions.
_Avoid_: Audit score, quality grade

**Fidelity layer**:
One of three analysis levels in audit-autopilot: Layer 1 — Fidelity (intent translation, AC coverage, report credibility); Layer 2 — Errors (unfixed criticals, verdict inconsistency, suggestion chain breaks); Layer 3 — Friction & Drift (retry churn, scope creep, TDD discipline violations).
_Avoid_: Analysis tier, audit dimension

**Evidence anchor**:
A message ID + excerpt from a session trace that supports a FAIL or WARN finding. Every finding must cite at least one anchor, enabling full traceability from the scorecard back to the raw conversation.
_Avoid_: Citation, reference

**Spot-check**:
In Phase 1 of audit-autopilot, sampling subagent session traces even when the orchestrator-level analysis reveals no issues. Ensures the audit does not miss problems hidden below the orchestrator's view (e.g., implementer claiming TDD but skipping tests).
_Avoid_: Random check, sanity sample

**Deep-dive**:
Phase 2 of audit-autopilot — mandatory when Phase 1 finds any WARN or FAIL. Loads the full subagent session trace for the flagged round/issue and performs targeted analysis against the specific analysis question that triggered the flag. Uses session-level evidence (tool call sequences, actual test runs) to confirm or refute the Phase 1 signal.
_Avoid_: Full review, second pass

**Analysis question**:
One of 9 fixed questions in the audit-autopilot checklist, each mapped to a fidelity layer and scoring rubric. Questions are answered by examining session traces (orchestrator ± subagent), with each answer requiring a score, rationale, and evidence anchor when non-PASS.
_Avoid_: Audit item, evaluation criteria

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
