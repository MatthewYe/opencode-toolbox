---

## Phase 1: 调度循环

维护 `retry_count = 0`，最多 3 轮（`retry_count` = 0, 1, 2）：
- retry_count = 0: 首次实现
- retry_count = 1: 第 1 次 retry
- retry_count = 2: 第 2 次 retry
- retry_count >= 3: 转为 needs-info
