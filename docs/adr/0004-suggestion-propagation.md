# Cross-issue suggestion propagation in autopilot

**Status**: accepted

## Context

The autopilot workflow dispatches implementer → reviewer per issue in a retry loop (max 3 rounds). Currently, reviewer findings are only passed within the same issue (most recent `REVIEWER_REPORT` as `PREV_REVIEW`). When an issue completes, all reviewer feedback is discarded — suggestions that apply to downstream issues are lost. This risks "silent dropping" of non-Critical findings and leaves no audit trail for human sign-off.

## Decision

Introduce **cross-issue Suggestion propagation** with three mechanisms:

1. **Extraction**: After every reviewer round (regardless of VERDICT), Suggestion-severity items are extracted from the `REVIEWER_REPORT` and persisted to `.scratch/<feature>/suggestions.json`. Each entry tracks: source issue, round, content, affected files (from the source issue's CHANGED_FILES), keywords (reviewer-annotated, auto-extracted fallback), and status (`pending` | `resolved` | `rejected`). For GitHub issues, suggestions are also stored as issue comments.

2. **Matching**: Before dispatching a new issue, the orchestrator scans pending suggestions and matches them against the issue's AGENT-BRIEF using (a) file path intersection with suggestion's `files` (from the source issue's CHANGED_FILES), AND (b) keyword/semantic overlap. Matched suggestions are passed to the implementer with full reviewer context (original REPORT excerpt, source issue, round).

3. **Acceptance**: In meta-review (Phase 2), the orchestrator produces a `FINAL_ACCEPTANCE_REPORT` listing all pending and rejected suggestions with rationale. Resolved suggestions are included with resolution metadata. This serves as input for human sign-off.

Only `Suggestion` level items propagate. Critical and Important must be resolved within the current issue.

## Considered options

1. **Current behavior (no cross-issue passing)** — Simple, but loses valuable reviewer insights and creates no audit trail.
2. **Accumulated PREV_REVIEW history** — Carry all prior REVIEWER_REPORTs within the same issue's retry loop. Doesn't address cross-issue needs.
3. **Structured suggestion extraction (chosen)** — Persists suggestions independently, enables cross-issue matching, and produces an acceptance audit trail.

## Consequences

- Orchestrator gains suggestion extraction logic, matching logic, and a meta-review audit step
- Reviewer agent must annotate keywords on each Suggestion (format TBD)
- `.scratch/<feature>/suggestions.json` becomes a persistent artifact per feature
- GitHub issue flow requires writing suggestions as issue comments and aggregating during meta-review
- Human sign-off gains visibility into all suggestions that were proposed, addressed, or deferred
