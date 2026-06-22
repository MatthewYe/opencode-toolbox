### 4. Dispatch implementer

Use `spawn_agent`:

```
agent_type: "implementer"
items: [
  {type:"skill", path:"skills/tdd/"},
  {type:"skill", path:"skills/diagnose/"},
  {type:"skill", path:"skills/zoom-out/"}
]
message: <IMPLEMENTER_DISPATCH_TEMPLATE>
```

See [IMPLEMENTER_DISPATCH_TEMPLATE](#implementer-dispatch-template) below for the exact message format.

### 5. Wait for implementer

```javascript
wait_agent(targets=[impl_agent_id], timeout_ms=600000)
```

Parse the completed status message for `IMPLEMENTER_REPORT:`.

If no report found (empty reply or parse error): retry once (new spawn). If still no report: mark `needs-info`, stop.

### 6. Process implementer result

**STATUS: DONE** → Dispatch reviewer (step 7).
**STATUS: UNVERIFIED** → Dispatch reviewer with `UNVERIFIED: true` flag.
**STATUS: BLOCKED or NEEDS_CONTEXT** → Mark `needs-info`, add comment, stop.
