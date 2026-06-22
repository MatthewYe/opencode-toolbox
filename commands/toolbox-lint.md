---
description: Verify the toolbox plugin is correctly and completely installed. Runs a three-level self-check — L1 existence, L2 content correctness, L3 functional smoke — and outputs a TOOLBOX_LINT_REPORT with per-item PASS/FAIL/WARN verdicts.
---

# Toolbox Lint

Run a comprehensive three-level self-check of the opencode-toolbox plugin installation. **Report only — do not modify any files, do not install anything, do not fix any failures.**

## Working directory

Your working directory is the project root (where OpenCode was started).

- **Plugin files** — `dist/`, `agents/`, `commands/`, `skills/`, `upstream/`, `principles/` — are relative to the plugin installation directory (the directory containing this `toolbox-lint.md` file). To locate the plugin directory, look for `node_modules/@matthewye/opencode-toolbox/` or check the plugin path in `opencode.jsonc`.
- **Self-report file** (L2.6) — the plugin writes `.opencode/.toolbox-lint-report.json` in the **project root**. Read it at `.opencode/.toolbox-lint-report.json` relative to your working directory.

## Output format

Start output with `TOOLBOX_LINT_REPORT:` on its own line. Every check item uses one of:

| Verdict | Meaning |
|---------|---------|
| `[PASS]` | Check passed |
| `[FAIL]` | Check failed — include brief reason after `:description:` |
| `[WARN]` | Warning — non-critical issue, include reason |

End the report with a `## 汇总` (Summary) section showing per-level pass rates:

```
## 汇总
L1: N/M PASS, X FAIL, Y WARN
L2: N/M PASS, X FAIL, Y WARN
L3: N/M PASS, X FAIL, Y WARN
```

## Self-report

The plugin writes a self-report JSON file at `.opencode/.toolbox-lint-report.json` in the **project root** (your working directory). This is NOT in the plugin installation directory. Read it using a path relative to your working directory: `.opencode/.toolbox-lint-report.json`. If this file does not exist, all L2 items that depend on it are marked `[FAIL]` with reason `: no self-report file found`. Do not crash.

---

## L1 — 存在性检查 (Existence)

Use `ls`, `stat`, or file-read tools to check existence of each item. The `commands/` count check should count `.md` files in the `commands/` directory (including this `toolbox-lint.md` file itself). Expected count: ≥ 7 (6 existing + this file).

Check the following items:

| # | Item | Expected |
|---|------|----------|
| 1 | `dist/index.js` | exists |
| 2 | `node_modules/` | exists (directory) |
| 3 | `agents/implementer.md` | exists |
| 4 | `agents/reviewer.md` | exists |
| 5 | `agents/argus.md` | exists |
| 6 | `commands/` — at least 7 `.md` files (including toolbox-lint itself) | count ≥ 7 |
| 7 | `skills/` directory | non-empty (contains at least 1 subdirectory or file) |
| 8 | `upstream/skills/engineering/` — contains at least 1 `SKILL.md` file | exists |
| 9 | `upstream/skills/productivity/` — contains at least 1 `SKILL.md` file | exists |
| 10 | `principles/karpathy.md` | exists |
| 11 | `principles/karpathy-primary.md` | exists |
| 12 | Canary skill `skills/_toolbox-canary/SKILL.md` | exists |
| 13 | Canary command `commands/_toolbox-canary.md` | exists |

For item 6: count all `.md` files in `commands/`. If count ≥ 7 → `[PASS]`. Otherwise `[FAIL]`.

For item 7: list `skills/` directory. If at least 1 entry exists → `[PASS]`. Otherwise `[FAIL]`.

---

## L2 — 内容正确性检查 (Content Correctness)

Use `gray-matter` equivalent parsing. Since `gray-matter` is a Node.js library, read each file as raw text and parse the YAML frontmatter (between `---` delimiters). For the self-report, read and `JSON.parse` the `.opencode/.toolbox-lint-report.json` file. If the file does not exist, all cross-check items in this section become `[FAIL] : no self-report file found`.

### L2.1 Agent frontmatter

Read each agent `.md` file in `agents/`. Parse frontmatter. Verify:
- Frontmatter is valid YAML between `---` delimiters
- Contains a `prompt` field (may be empty)

Report one item per agent file (implementer.md, reviewer.md, argus.md):

```
[PASS] agents/implementer.md — frontmatter valid, prompt field present
```

### L2.2 Agent Karpathy principles injection

Read each agent `.md` file's content (after frontmatter). The prompt content is the body after frontmatter delimiters. Verify:

- **implementer.md** body contains substring `"Principle 1: Think Before Coding"`
- **reviewer.md** body contains substring `"Principle 1: Think Before Judging"`
- **argus.md** body contains substring `"Principle 1: Think Before Analyzing"`

Note: the principles are injected at plugin load time by the config hook. If an agent file does not contain the expected string, mark `[WARN]` (not FAIL) — the principles may be injected at runtime rather than present in the source file.

```
[WARN] agents/reviewer.md — prompt missing "Principle 1: Think Before Judging"
```

### L2.3 Command frontmatter

Read each `.md` file in `commands/`. Parse frontmatter. Verify:
- Frontmatter is valid YAML
- Contains a `description` field

Report one item per command file. Skip `_toolbox-canary.md` (it has no `description` by design — its content is `CANARY_OK:`).

```
[PASS] commands/autopilot.md — frontmatter valid, description present
[WARN] commands/some-cmd.md — frontmatter missing description field
```

### L2.4 SKILL.md files

Scan `skills/` and `upstream/skills/engineering/` and `upstream/skills/productivity/` directories for `SKILL.md` files. For each found, parse frontmatter and verify:
- Frontmatter is valid YAML
- Contains `name` field
- Contains `description` field

Report one item per SKILL.md, grouped by directory. If a directory has no SKILL.md files, report `[WARN] : no SKILL.md files found`.

### L2.5 Karpathy principles content

Read `principles/karpathy.md`. Verify it contains all four principle headers:
- `"Principle 1"`
- `"Principle 2"`
- `"Principle 3"`
- `"Principle 4"`

Report one item:
```
[PASS] principles/karpathy.md — contains all 4 principles
```

### L2.6 Self-report cross-checks

If `.opencode/.toolbox-lint-report.json` exists:
1. Read and `JSON.parse` it. If parse fails → `[FAIL] : JSON parse error`.
2. Extract `agents` field (object). Verify count matches number of agent `.md` files in `agents/` (excluding non-.md entries).
3. Extract `commands` field (object). Verify all command keys correspond to `.md` files in `commands/` (strip `.md` extension).
4. Extract `skill_paths` field (array). Verify it has 3 entries, all exist as directories.
5. Extract `upstream_skill_commands` field (array). Verify each corresponds to a subdirectory under `upstream/skills/engineering/` or `upstream/skills/productivity/` containing a `SKILL.md`.

If any field is missing from the JSON → `[FAIL] : field '<name>' missing from self-report`.

If the file does not exist → all items become `[FAIL] : no self-report file found`.

---

## L3 — 功能冒烟检查 (Functional Smoke)

Run each of the following checks using available tools. If a check is not possible (e.g., tool not available), mark `[WARN]` with reason.

### L3.1 Canary skill

Use the `skill` tool to load `_toolbox-canary`:
```
skill(name: "_toolbox-canary")
```
Check that the response contains `CANARY_OK: toolbox skill registration verified`.

- Success → `[PASS] canary skill 加载成功`
- Not found → `[FAIL] canary skill 加载失败 : skill not found`
- Wrong output → `[FAIL] canary skill 加载失败 : unexpected output`

### L3.2 Upstream engineering skill

Use the `skill` tool to load `diagnose` (or `tdd`):
```
skill(name: "diagnose")
```
Check that the response contains skill instructions (non-empty, not an error).

- Success → `[PASS] upstream engineering skill (diagnose) 加载成功`
- Not found → `[FAIL] upstream engineering skill (diagnose) 加载失败`

### L3.3 Upstream productivity skill

Use the `skill` tool to load `caveman`:
```
skill(name: "caveman")
```
Check that the response contains skill instructions.

- Success → `[PASS] upstream productivity skill (caveman) 加载成功`
- Not found → `[FAIL] upstream productivity skill (caveman) 加载失败`

### L3.4 Canary command

Invoke the `_toolbox-canary` command. Check its output contains `CANARY_OK: toolbox command registration verified`.

- Success → `[PASS] canary command 执行成功`
- Failure → `[FAIL] canary command 执行失败`

### L3.5 Upstream command

Invoke the `/caveman` command (or any upstream productivity command). Check that it returns a normal response (non-error).

- Success → `[PASS] upstream command 执行正常`
- Failure → `[FAIL] upstream command 执行失败`

### L3.6 Agent dispatch

Use the `task` tool to dispatch the `general` agent with a trivial task: "Reply with exactly: TOOLBOX_LINT_OK". Check the response.

- Normal response → `[PASS] agent dispatch 正常`
- Error or no response → `[FAIL] agent dispatch 失败`

### L3.7 Bun runtime

Run: `bun --version`
Check exit code 0 and output contains a version string.

- Success → `[PASS] bun runtime 可用`
- Failure → `[FAIL] bun runtime 不可用`

---

## Execution order

Run checks in order: L1 → L2 → L3. Within each level, run all items (do not stop on first failure). Collect all results before producing the report.

## Self-reference rules

- `/toolbox-lint` itself is counted in L1 item 6 (commands file count) — this is self-referential verification.
- L3 does **not** invoke `/toolbox-lint` — do not self-invoke to avoid infinite loops.
