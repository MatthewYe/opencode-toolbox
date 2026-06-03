---
description: Set up git guardrails in OpenCode — adds permission rules to block dangerous git commands (push, reset --hard, clean, branch -D, checkout/restore .) before they execute. Use to prevent destructive git operations.
arguments: [{ name: "scope", description: "Install scope: 'global' (all projects) or 'project' (this project only). If omitted, ask the user.", required: false }]
---

Load the `git-guardrails` skill and follow its instructions.
