---
description: Put issue resolution on autopilot — scans local .scratch/ files AND GitHub Issues for ready-for-agent issues, dispatches implementer → reviewer in a retry loop until resolved. After all issues complete, runs global meta-review against ADR/PRD and fixes cross-module issues. Use when processing autopilot issues from any source.
arguments: [{ name: "target", description: "Optional: a .scratch/<feature>/issues/<NN-slug> directory path, or a GitHub issue number (#N or N). If omitted, scan all sources.", required: false }]
---
