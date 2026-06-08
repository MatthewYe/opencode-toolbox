---
name: autopilot-v2
description: Improved autopilot orchestrator with context-aware dispatching. Adds pre-flight toolchain detection, REFACTORING mode awareness, UNVERIFIED status handling, and VERIFY_NEEDED verdict path. For eval-driven iteration before merging into /autopilot.
compatibility: opencode
---

# Autopilot v2 — Context-Aware Orchestrator

Improved orchestrator workflow for `/autopilot`. This skill is in eval-driven iteration; the canonical source is `commands/autopilot.md`.

## What's improved from v1

| Area | v1 Behavior (audit issue) | v2 Improvement |
|------|--------------------------|----------------|
| **STATUS confidence** | Implementer claimed DONE even when toolchain unavailable (Q3 WARN) | New `UNVERIFIED` STATUS; toolchain detection required before DONE |
| **Review path for UNVERIFIED** | No path existed | Reviewer receives `UNVERIFIED: true` flag, can issue `VERIFY_NEEDED` verdict |
| **Orchestrator handling** | No post-review verification | Orchestrator attempts to run tests after `VERIFY_NEEDED` verdict |
| **REFACTORING tasks** | TDD discipline applied uniformly, inappropriate for refactoring (Q9 WARN) | `REFACTORING: true` flag detected from contract keywords; relaxes TDD expectations |
| **Scope creep guard** | No cleanup-awareness in AC convention (Q8 WARN) | Toolchain awareness encourages explicit cleanup ACs |

## Usage

Load this skill, then follow the improved orchestrator workflow:

```
/autopilot-v2 [target]
```

Or load it programmatically: `skill(name: "autopilot-v2")`

---

## Improved Orchestrator Workflow

The complete workflow below is the improved version of `commands/autopilot.md`. Changes from v1 are marked with `[v2]`.

### Pre-flight: Toolchain Detection `[v2]`

Before dispatching any implementer, detect the project's toolchain:

1. Infer test command from project type:
   - Rust/Cargo → `cargo test`
   - Node.js → `npm test` or `bun test`
   - Python → `pytest` or `uv run pytest`
2. Run `which <tool>` to check availability (e.g., `which cargo`, `which npm`)
3. If not found, try common install paths (`~/.cargo/bin/`, `~/.rustup/toolchains/*/bin/`)
4. Set `TOOLCHAIN: available` or `TOOLCHAIN: unavailable`

### Pre-flight: REFACTORING Detection `[v2]`

Analyze the contract to determine if this is a refactoring task:

1. Scan contract keywords: `replace`, `consolidate`, `extract`, `delete`, `Remove`, `Replace`, `inline`, `shared function`, `duplicated`, `migrate`
2. If 2+ keywords hit AND no `Add`, `Implement` (as new feature), `new feature` keywords → mark `REFACTORING: true`
3. Also check: if all ACs describe "replace/delete/consolidate" rather than "add/create/implement" → `REFACTORING: true`
4. Set `REFACTORING: true` or `REFACTORING: false`

### Dispatch Implementer `[v2]`

Pass these flags in the implementer's dispatch prompt:

```
SOURCE: <local|github>
ISSUE_ID: <id>
TOOLCHAIN: <available|unavailable>
REFACTORING: <true|false>
ROUND: <N>
```

### Handle Implementer Result `[v2]`

New STATUS handling:

- **STATUS: DONE** → dispatch reviewer (standard flow)
- **STATUS: UNVERIFIED** `[v2]` → dispatch reviewer with `UNVERIFIED: true` flag + implementer's full SELF_REVIEW (with per-AC verification notes)
- **STATUS: BLOCKED or NEEDS_CONTEXT** → mark needs-info, stop

### Handle Reviewer Result `[v2]`

New VERDICT handling:

- **MERGE** → resolved (standard)
- **VERIFY_NEEDED** `[v2]` → structure correct but toolchain unavailable. Orchestrator should:
  1. Attempt to run test command in its own environment
  2. If tests pass → update to resolved with "Orchestrator verified"
  3. If tests fail or toolchain still unavailable → mark needs-info with reviewer report
  4. Always extract and persist Suggestions
- **RETRY** → increment retry_count, dispatch implementer with PREV_REVIEW (standard)
- **BLOCKED** → mark needs-info (standard)

## Eval Strategy

This skill is evaluated against 6 test cases in `evals/evals.json`:

1. **Toolchain unavailable + code complete** → STATUS: UNVERIFIED (not DONE)
2. **Orchestrator receives UNVERIFIED** → dispatches reviewer with UNVERIFIED flag
3. **Reviewer with UNVERIFIED** → issues VERIFY_NEEDED when structure is correct
4. **REFACTORING: true** → implementer runs existing tests before/after, skips new test requirement
5. **REFACTORING: false (feature)** → implementer follows full TDD (new failing tests first)
6. **REFACTORING: true + TOOLCHAIN: unavailable** → implementer reports UNVERIFIED, notes that baseline tests couldn't run

Each eval case verifies a specific behavioral transition from the audit findings.
