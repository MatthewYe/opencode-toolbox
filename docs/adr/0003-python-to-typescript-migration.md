# Migrate skill-creator Python scripts to TypeScript

**Status**: accepted

## Context

`skills/skill-creator/` contained 2,404 lines of Python (10 `.py` files + `pyproject.toml`) while the rest of opencode-toolbox used Bun/TypeScript. This dual-stack created maintenance burden: two runtimes, two package managers, and contributors needed Python 3.10+ just to use skill-creator scripts.

## Decision

Rewrite all Python scripts to TypeScript using Bun as the runtime, eliminating Python entirely. Keep the same directory structure (`scripts/*.ts` replacing `scripts/*.py`), same CLI interfaces, same JSON output schemas.

Dependency mapping:
- `pyyaml` → `gray-matter` (already a project dependency)
- `zipfile.ZipFile` → `adm-zip` (added to `dependencies`)
- `http.server` → Node.js built-in `http`
- `ProcessPoolExecutor` → async `spawn` + `Promise.all`
- `webbrowser.open()` → `child_process.exec('open')` on macOS

Verification: each phase must pass output parity before proceeding — run identical inputs through both Python and TypeScript implementations and diff outputs. Deterministic scripts require byte-identical output; AI-dependent scripts require structural equivalence (JSON keys, types, schema conformance).

## Considered options

1. **Keep Python (status quo)**: No migration cost. But dual-stack maintenance continues indefinitely.
2. **Migrate core only (scripts/, not eval-viewer)**: Partial single-stack, but leaves the largest Python file (`generate_review.py`, 471 lines) behind.
3. **Full migration (chosen)**: Single runtime, single package manager. Accepts ~1-2 day one-time migration cost for permanent simplification.

## Consequences

- `pyproject.toml` and all `.py` files removed
- `skills/skill-creator/scripts/` now contains `.ts` files
- New `dependencies`: `adm-zip`, `@types/adm-zip` (dev)
- Bun becomes the only required runtime for the entire project
- SKILL.md references to Python commands updated to `bun run` equivalents
- `__init__.py` deleted (no TypeScript equivalent)
