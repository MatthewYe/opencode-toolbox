---
Status: resolved
---

# Issue #14: Add shared read_ohlcv_json function

There are 7 duplicated JSON parse blocks across the quantflow codebase. Each one manually deserializes OHLCV data from either `{"data": [...]}` or bare `[...]` JSON formats.

Goal: Create a single `read_ohlcv_json()` function in `core/src/io.rs` that handles both formats, and wire all consumers to use it.

The function needs to handle both JSON shapes produced by the fetch pipeline:
- `{"data": [row, ...]}` — uses `map.remove("data")` to take ownership without cloning
- `[row, ...]` — bare array, deserialized directly
