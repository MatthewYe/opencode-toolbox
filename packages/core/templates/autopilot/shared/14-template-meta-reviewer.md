---

## Meta-Reviewer Template

Same as Reviewer Dispatch Template above, but with this context:

```
You are executing a GLOBAL META-REVIEW. Review the entire codebase, not a single issue.

## Review Scope
- All resolved issues in this PRD
- Cross-module consistency
- ADR/PRD global constraint compliance
- Orphan files and undeclared behavior

## Contract
<All resolved issue contracts, concatenated>

## Context
ALL_RESOLVED_ISSUES: <list of #N or slugs>
SOURCE: github
```
