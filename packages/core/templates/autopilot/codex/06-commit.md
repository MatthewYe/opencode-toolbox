### 6b. Commit changes

After implementer STATUS: DONE, commit to isolate this issue's changes:

This gives reviewer a clean diff boundary via `git show HEAD`.

### 7. Dispatch reviewer

Use `spawn_agent` (new agent per issue):

```
agent_type: "reviewer"
items: [
  {type:"skill", path:"skills/tdd/"},
  {type:"text", text: <DIFF>}
]
message: <REVIEWER_DISPATCH_TEMPLATE>
```

See [REVIEWER_DISPATCH_TEMPLATE](#reviewer-dispatch-template) below.

### 8. Wait for reviewer

```javascript
wait_agent(targets=[rev_agent_id], timeout_ms=600000)
```

Parse for `REVIEWER_REPORT:` and `VERDICT: MERGE | RETRY | BLOCKED | VERIFY_NEEDED`.
