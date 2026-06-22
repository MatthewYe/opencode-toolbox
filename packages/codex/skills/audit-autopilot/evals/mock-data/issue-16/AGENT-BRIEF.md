# AGENT-BRIEF: Issue #16

## Acceptance Criteria

- [ ] `DataRow` struct no longer exists anywhere in the codebase
- [ ] `parse_data_rows()` function no longer exists
- [ ] `slice_windows` works with `OhlcvRecord` (all 4 slicing tests pass)
- [ ] `run_phase1_window` accepts `OhlcvRecord` directly; no conversion boilerplate
- [ ] All engine binaries use `read_ohlcv_json()` instead of `parse_data_rows()`
- [ ] `engine_tests.rs` integration tests use `OhlcvRecord` throughout
- [ ] `cargo test -p quantflow-engine` passes
- [ ] `cargo test -p quantflow-core` passes

## What to build

### slice.rs
- Delete `DataRow` struct (5 fields: open, high, low, close, volume)
- Change `slice_windows` signature from `&[DataRow]` to `&[OhlcvRecord]`
- Update unit tests to use `OhlcvRecord` (fill datetime with `UNIX_EPOCH`)

### backtest.rs (library)
- Delete `parse_data_rows()` function
- Change `run_phase1_window(window_data: &[OhlcvRecord], ...)` — remove DataRow→OhlcvRecord conversion
- Change `run_backtest(data: &[OhlcvRecord], ...)`
- Update test helpers to produce `OhlcvRecord`

### Engine binaries
- Replace `parse_data_rows()` with `read_ohlcv_json()` in phase1, backtest, sandbox
- Remove all `DataRow` imports and field mappings

### engine_tests.rs
- Replace all `DataRow` usage with `OhlcvRecord`

## Out of scope

- Do not modify `crates/core/src/io.rs`
- Do not modify `crates/core/src/types.rs`
