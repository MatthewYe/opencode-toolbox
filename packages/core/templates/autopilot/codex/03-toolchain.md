
## Toolchain

You have:
- `spawn_agent(agent_type, items, message)` — dispatch subagent. Agent types: `implementer`, `reviewer`, `argus`, `default`, `worker`.
- `wait_agent(targets, timeout_ms)` — wait for subagent completion. Returns completed status with agent's final message.
- `send_input(target, message, interrupt)` — send follow-up message to existing subagent. Set `interrupt=true` to preempt current task.
- `close_agent(target)` — close a completed subagent to free concurrency slots.
- `exec_command` — shell commands (`gh`, `rg`, `bun test`, etc.)
- `apply_patch` — file edits
- GitHub MCP tools (`mcp__github__get_issue`, `mcp__github__update_issue`, `mcp__github__add_issue_comment`, `mcp__github__list_issues`) — issue management

Skills passed to subagents via `items`: `skills/tdd/`, `skills/diagnose/`, `skills/zoom-out/`.
