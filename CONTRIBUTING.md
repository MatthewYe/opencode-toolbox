# Contributing

## Setup

```bash
bun install
bun run build    # compile src/index.ts → dist/
bun run dev      # watch mode
```

`tsconfig.json` is for editor support only. There are no lint, typecheck, or test commands.

## Conventions

### Upstream skills (DO NOT MODIFY)

`upstream/` is a squashed git subtree of [mattpocock/skills](https://github.com/mattpocock/skills). **Do not edit files in `upstream/` directly** — your changes will be clobbered on the next sync.

To pull upstream updates:

```bash
git subtree pull --prefix=upstream/ mattpocock-skills main --squash
```

### Where to put new content

| What | Where |
|------|-------|
| New skill | `skills/<name>/SKILL.md` |
| New agent | `agents/<name>.md` |
| New command | `commands/<name>.md` |
| Agent docs | `docs/agents/` |

Skills, agents, and commands use YAML frontmatter for metadata. The plugin reads `.md` files at runtime via `gray-matter` and injects them into OpenCode's config hook.

### PR process

1. Fork, branch, implement
2. `bun run build` and verify the plugin loads in a test OpenCode project
3. Open a PR against `main`
4. No formal CI yet — PRs are reviewed manually

## Project structure

```
opencode-toolbox/
├── skills/                  # Custom skills (skill-creator, opencode-plugin-scaffold)
├── upstream/skills/         # mattpocock/skills subtree (read-only)
│   ├── engineering/
│   └── productivity/
├── agents/                  # implementer.md, reviewer.md
├── commands/                # autopilot.md
├── docs/agents/             # reviewer-checklist.md, issue-tracker.md, triage-labels.md
├── src/                     # Plugin entry point (index.ts)
└── dist/                    # Build output (gitignored)
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
