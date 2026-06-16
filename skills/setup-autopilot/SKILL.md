---
name: setup-autopilot
description: Bootstrap autopilot-toolkit in a consuming project. Copies AGENTS.md template with Karpathy coding principles, installs Codex agent .toml files into .codex/agents/, and verifies the installation. Use when first setting up autopilot-toolkit in a project.
---

# Autopilot Toolkit Setup

Set up the autopilot-toolkit plugin for the consuming project. This skill handles all bootstrap steps automatically.

## Setup steps (execute in order)

### 1. Install AGENTS.md with Karpathy principles

Find the autopilot-toolkit plugin root. The plugin ships `templates/AGENTS.md`. Determine the project root (git root or current directory if not in a repo).

Check if the project already has an `AGENTS.md` at the project root:

- **If no `AGENTS.md` exists**: Copy the template:
  ```bash
  cp <plugin-root>/templates/AGENTS.md <project-root>/AGENTS.md
  ```
- **If `AGENTS.md` already exists**: Read the template, then append its content to the existing file with a `---` separator.

### 2. Install Codex agent .toml files

Find the generated agent `.toml` files at `<plugin-root>/templates/agents/*.toml`. Copy them to the project's `.codex/agents/` directory:

```bash
mkdir -p <project-root>/.codex/agents
cp <plugin-root>/templates/agents/*.toml <project-root>/.codex/agents/
```

This installs three custom agents that will appear in Codex when you type `@`:
- `implementer` — autonomous task implementer following TDD discipline
- `reviewer` — read-only code reviewer on 4 axes (Behavior, TDD, Code quality, Plan fidelity)
- `argus` — multimodal/image analysis agent

**After this step, the user MUST restart Codex** for the agents to appear.

### 3. Verify installation

After the user restarts Codex, ask them to verify:

- Type `@` — should see `implementer`, `reviewer`, `argus` in the agent picker
- Type `$` — should see autopilot-toolkit skills (autopilot, setup-autopilot, skill-creator, etc.)
- Run `codex plugin list` — should show `autopilot-toolkit` as `installed, enabled`

If agents don't appear after restart, verify `.codex/agents/` contains the `.toml` files.

### 4. Report completion

After all steps succeed, output:

```text
AUTOPILOT-TOOLKIT SETUP COMPLETE

AGENTS.md ............. Karpathy principles installed
Codex agents .......... implementer, reviewer, argus → .codex/agents/
Plugin ................ autopilot-toolkit is active

Next steps:
  1. Restart Codex
  2. Try @implementer — spawn the implementer agent
  3. Try $autopilot — run the autopilot workflow
```

### Finding the plugin root

The plugin root is the directory containing `.codex-plugin/plugin.json`. Common locations:

- **Local/personal install**: `~/plugins/autopilot-toolkit`
- **npm install**: `node_modules/@matthewye/autopilot-toolkit`
- **Git clone**: `~/Documents/WorkSpace/opencode-toolbox`

Use `find ~/plugins -name 'plugin.json' -path '*autopilot*' 2>/dev/null` to locate it, or ask the user if uncertain.

### Out of scope

- Setting up `.scratch/` issue directories
- Configuring GitHub integration
- Customizing agent prompts
