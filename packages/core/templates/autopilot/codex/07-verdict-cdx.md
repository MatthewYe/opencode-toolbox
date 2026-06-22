### 9. Handle verdict

**MERGE** → Mark `resolved`. Close reviewer agent. Go to next issue.
**VERIFY_NEEDED** → Try running build/tests. If pass → `resolved`. If fail → `needs-info`.
**RETRY** → increment retry_count.
  - retry_count < 3: `send_input(interrupt=true)` with `PREV_REVIEW` to existing implementer. If agent is closed, spawn new implementer.
  - retry_count >= 3: mark `needs-info`, add review summary, go to next issue.
**BLOCKED** → Mark `needs-info`, go to next issue.

After verdict handled, close agents to free concurrency slots:
```javascript
close_agent(target=impl_agent_id)
close_agent(target=rev_agent_id)
```

### 9b. Git cleanup (retry case)

If RETRY occurred, undo the stale commit before next implementer round:
```bash
git reset --soft HEAD~1
```

### 10. Handle suggestions (cross-issue)

If reviewer report has `## Suggestion` items:
- **Local mode**: Write to `.scratch/<feature>/suggestions.json`
- **GitHub mode**: Add issue comment: `autopilot suggestion [pending]: <content>` AND write to local file if feature directory exists

### 11. Loop

Return to step 0 (scan for next ready-for-agent issue). When no more issues → Phase 2.
