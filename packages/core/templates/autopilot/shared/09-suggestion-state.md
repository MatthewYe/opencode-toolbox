#### Update Suggestion 状态

VERDICT: MERGE 时，根据 `pending_resolutions` 更新 `suggestions.json` 中对应条目的状态：

1. **定位条目**：在 `suggestions.json` 中按 `issue`（匹配 `source_issue`）、`round` 和 `content` 三级匹配对应 suggestion 条目：
   - 一级：`issue` 字段匹配 `source_issue`（字符串全等）
   - 二级：`round` 字段匹配 `round`（数字全等）
   - 三级：`summary`（`→` 前的 content 摘要）作为子串出现在条目的 `content` 字段中（子串匹配，大小写敏感）
   - 无匹配条目（implementer 声明了但 suggestions.json 中找不到）→ 跳过该条
   - **多命中歧义消解**（三级命中 2+ 条）：执行四级匹配打破平局——
     1. 计算每条候选 entry 的 `files` 与当前 issue 的 implementer `CHANGED_FILES` 的交集，取交集最多者
     2. 仍平局：取 `summary` 在 `content` 中匹配长度最长者（最精确匹配）
     3. 仍平局（极少见，如相同 content、相同 files）：跳过该条并报告歧义 — "Suggestion resolution ambiguous: `summary` 命中 N 条内容相近的 entry（source_issue + round），无法自动消歧，请人工处理"
2. **状态校验**：定位到条目后，检查其 `status`：
   - `status === "pending"` → 继续步骤 3（正常处理）
   - `status !== "pending"`（如 `resolved`/`rejected`）→ **跳过该条**并报告异常 — "Skipping suggestion resolution: matched entry already has status `<status>` (expected pending). Possible multi-hit mis-match or duplicate resolution."
3. 根据 `type` 执行状态转换：

   | type | 操作 | 字段更新 |
   |------|------|---------|
   | `resolved` | 标记为已解决 | `status: "resolved"`, `resolved_in_issue`: 当前 issue 的 slug（本地模式用目录名，GitHub 模式用 `#<N>`） |
   | `rejected` | 标记为已拒绝 | `status: "rejected"`, `rejected_reason`: `detail` 字段内容（即 `→` 后的处理说明） |
   | `deferred` | 保持 pending + 备注 | `status` 仍为 `"pending"`, `deferred_by`: 当前 issue slug |

4. **写回文件**：将更新后的数组写回 `.scratch/<feature>/suggestions.json`
5. **GitHub Issue 评论同步**（仅 `source = "github"` 时执行）：
   - 对 `resolved` 和 `rejected` 类型，追加 issue comment
   - `deferred` 不需要额外 issue comment（状态未变，且 initial pending comment 已存在）

6. **报告**：汇总更新结果 — "处理了 N 条 suggestion（M resolved, K rejected, J deferred）"

### Phase 1 退出条件

当扫描模式返回零个 ready-for-agent issue 时，Phase 1 完成。进入 Phase 2。
