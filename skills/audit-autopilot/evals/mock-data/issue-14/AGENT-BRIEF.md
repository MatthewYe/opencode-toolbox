# AGENT-BRIEF: Issue #14

## Acceptance Criteria

- [ ] `read_ohlcv_json` parses `{"data": [...]}` format correctly
- [ ] `read_ohlcv_json` parses bare `[...]` array format correctly
- [ ] Invalid JSON returns `CoreError::Data` with descriptive message
- [ ] Object missing `"data"` key returns `CoreError::Data` including file path
- [ ] Scalar root (string, number, etc.) returns `CoreError::Data`
- [ ] File not found returns `CoreError::Io`
- [ ] Empty array parses successfully (returns empty vec)
- [ ] PascalCase field aliases (Datetime, Open, High, Low, Close, Volume) deserialize correctly
- [ ] `cargo test -p quantflow-core` passes

## What to build

Add `read_ohlcv_json(path: &Path) -> Result<Vec<OhlcvRecord>, CoreError>` in `crates/core/src/io.rs`.

Handles both JSON shapes produced by the fetch pipeline:
- `{"data": [row, ...]}` — uses `map.remove("data")` to take ownership without cloning
- `[row, ...]` — bare array, deserialized directly

Rejects non-array/non-object roots with `CoreError::Data`. Does NOT check for empty data — callers decide.

## Out of scope

- Do not modify any engine binary files (phase1.rs, backtest.rs, sandbox.rs)
- Do not modify `crates/core/src/types.rs`
- This issue only adds the function; wiring consumers is separate work
