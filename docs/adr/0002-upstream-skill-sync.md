# Sync mattpocock/skills via git subtree

**Status**: accepted

## Context

14 of 15 skills in opencode-toolbox are verbatim copies from [mattpocock/skills](https://github.com/mattpocock/skills). They were originally installed via `npx skills add` into `~/.agents/skills/`, then bulk-migrated into the project repo (commit `7b950b1`). Since then, there has been no mechanism to pull upstream updates. Upstream is actively maintained (85 commits, 104k stars) with an evolving skill set across `skills/engineering/` and `skills/productivity/`.

The upstream repo organizes skills in categorized subdirectories; opencode-toolbox uses a flat `skills/` layout. Any sync mechanism must bridge this structural mismatch while preserving the project's own `skill-creator/` skill and its plugin architecture (`index.js`, `agents/`, `commands/`).

## Decision

Use **git subtree** to import the full upstream repo into `upstream/`, then register only the relevant subdirectories in `index.js`.

### Setup

1. Add upstream as a remote: `git remote add mattpocock-skills https://github.com/mattpocock/skills.git`
2. Import with squashed history: `git subtree add --prefix=upstream/ mattpocock-skills main --squash`
3. Remove the 14 verbatim copies from `skills/` (keep only `skill-creator/`)
4. Update `index.js` to register:
   - `upstream/skills/engineering/` (diagnose, grill-with-docs, improve-codebase-architecture, prototype, setup-matt-pocock-skills, tdd, to-issues, to-prd, triage, zoom-out)
   - `upstream/skills/productivity/` (caveman, grill-me, handoff, write-a-skill)
5. All four changes committed atomically

### Syncing

```bash
git fetch mattpocock-skills main
git subtree pull --prefix=upstream/ mattpocock-skills main --squash
```

The remote persists in local `.git/config` for convenience (not propagated to other clones).

## Considered options

1. **Git submodule**: Standard and traceable, but breaks clone-and-go (`--recurse-submodules` required) and npm publishing (npm ignores submodules).
2. **Git subtree (chosen)**: All content lives in the repo — zero setup for clones and npm consumers. One-command sync. Accepts that unused upstream content (deprecated, personal, misc skills) occupies negligible disk space.
3. **Automated sync script**: Maximum selectivity and control, but requires building and maintaining custom tooling. Overkill for a verbatim-copy use case where no transformations are needed.
4. **Manual process**: Unsustainable across 14 skills and frequent upstream changes.

## Consequences

- `upstream/` contains the full mattpocock/skills repo including unused directories (`deprecated/`, `personal/`, `misc/`). These are harmless — OpenCode only discovers skills from registered paths.
- Upstream updates require one manual command (`git subtree pull`). Not automated, but trivial.
- Upstream commit history is squashed on import and each sync, keeping opencode-toolbox's `git log` clean.
- The `--squash` strategy means exact upstream version must be tracked manually (e.g., a `UPSTREAM_SHA` file or git notes) if needed in the future.
- If upstream renames or restructures skill directories, index.js paths must be updated accordingly.
