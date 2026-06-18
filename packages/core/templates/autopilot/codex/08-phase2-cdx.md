## Phase 2: Global Meta-Review

### 1. Parallel dispatch

**A) Spawn reviewer** (same as Phase 1 step 7, but with meta-review scope):

```
agent_type: "reviewer"
items: [{type:"skill", path:"skills/tdd/"}]
message: <META_REVIEWER_TEMPLATE>
```

**B) Orchestrator self-review** (run concurrently):
- Scan for cross-module inconsistencies: `rg` for import styles, entry detection patterns
- Check for orphan files: `git diff --stat` against parent branch
- Verify build passes: run build command
- Check test coverage: run test suite

### 2. Merge reports

Union of Critical + Important items from both reports. Default to stricter finding on conflicts.

### 3. Fix loop (max 2 rounds)

Fix merged Critical + Important items directly (no subagent dispatch for meta fixes — these are mechanical). Verify with build + tests.
