---
Status: resolved
---

# Issue #16: Delete DataRow and consolidate to OhlcvRecord

We have `DataRow` — a historical artifact identical to `OhlcvRecord` minus the `datetime` field. There are three `OhlcvRecord ↔ DataRow` conversion blocks across the codebase creating unnecessary boilerplate.

Goal: Remove `DataRow` entirely and wire all consumers to use `OhlcvRecord` directly. Engine binaries should use the new `read_ohlcv_json()` function for data loading.

This is part of a broader refactoring to eliminate duplicated JSON parsing and type conversions across the quantflow codebase.
