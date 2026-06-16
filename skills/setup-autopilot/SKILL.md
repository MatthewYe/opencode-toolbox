---
name: setup-autopilot
description: Bootstrap autopilot-toolkit in a consuming project. Copies AGENTS.md template with Karpathy coding principles, sets up Codex marketplace entry, and verifies the installation. Use when first setting up autopilot-toolkit in a project.
---

# Autopilot Toolkit Setup

Set up the autopilot-toolkit plugin for the consuming project.

## What this skill does

1. Copies Karpathy coding principles into the project's AGENTS.md
2. Verifies the plugin is installed and discoverable
3. Reports what's been configured

## Setup steps

### 1. Install AGENTS.md with Karpathy principles

Check if the project already has an `AGENTS.md` or `CONTEXT.md` at the project root:

- **If neither exists**: Copy `templates/AGENTS.md` from the autopilot-toolkit package to `<project-root>/AGENTS.md`.
- **If one exists**: Append the Karpathy principles section to the existing file (with a clear separator).

The template file is at `<autopilot-toolkit-root>/templates/AGENTS.md`.

### 2. Verify plugin installation

For **Codex** users:
- Confirm the plugin is installed: check that `codex plugin list` shows `autopilot-toolkit`
- If not installed, guide the user through marketplace setup (add a marketplace entry in `~/.agents/plugins/marketplace.json` pointing at the plugin directory, then restart Codex)

For **OpenCode** users:
- Confirm `@matthewye/autopilot-toolkit` is listed in `opencode.json` under `plugin`
- If not, instruct the user to add it

### 3. Report

After completing the steps, report:

```text
AUTOPILOT-TOOLKIT SETUP COMPLETE:

✅ AGENTS.md: Karpathy principles installed at project root
✅ Plugin: autopilot-toolkit is active
   - Skills available: <list discovered skills>
   - Agents available: implementer, reviewer, argus

Next: Start a new thread and try "/autopilot" (OpenCode) or ask Codex to use an autopilot agent.
```

### Out of scope

- Setting up `.scratch/` issue directories
- Configuring GitHub integration
- Customizing agent prompts
