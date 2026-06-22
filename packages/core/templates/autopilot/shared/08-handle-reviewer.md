### 处理 reviewer 结果

解析 `REVIEWER_REPORT:`，看 VERDICT。reviewer 任务失败或找不到 `VERDICT:` → 视为 BLOCKED，更新 Status 为 `needs-info` 并停止。

**解析容错：** 找不到 `REVIEWER_REPORT:` 标记头 → 视为不可解析，更新 Status 为 `needs-info` 附原始回复，停止。

#### 提取 Suggestion 并持久化

解析完 REVIEWER_REPORT 后，无论 VERDICT 如何，提取 `## Suggestion` 节的所有条目并写入 `suggestions.json`：

1. **解析条目**：逐条解析 `## Suggestion` 下的每个 `- [ ]` 项：
   - `content`：`- [ ] ` 后的正文文本（不含 KEYWORDS/FILES 标注行）
   - `keywords`：`KEYWORDS:` 行（逗号分隔，可选）→ 解析为数组
   - `files`：`FILES:` 行（逗号分隔，可选）→ 解析为数组
2. **兜底提取**（仅当对应标注缺失时）：
   - **关键词兜底**：从 `content` 文本中提取 2-5 个最有代表性的术语（优先提取技术术语、模块名、模式名）
   - **文件路径兜底**：从当前 issue 的 implementer 报告 `CHANGED_FILES` 中提取，去重
3. **推断 feature 目录**：
   - 本地模式（`source = "local"`）：从 issue 路径提取，如 `.scratch/auth/issues/01-login/` → `.scratch/auth/`
   - GitHub 模式（`source = "github"`）：从 issue title 生成 feature slug，创建 `.scratch/<feature-slug>/`
4. **读取现有文件**：检查 `.scratch/<feature>/suggestions.json` 是否存在，存在则读取，不存在则初始化为空数组 `[]`
5. **去重**：按 `content` 字段比较，已存在相同 `content` 的条目不重复写入
6. **追加新条目**：每个新条目格式为：
   ```json
   { "issue": "<issue-slug>", "round": <N>, "content": "...", "files": [...], "keywords": [...], "status": "pending" }
   ```
   - `issue`：本地模式用目录名（如 `01-login`），GitHub 模式用 `#<N>`
   - `round`：当前 `retry_count`
7. **写入文件**：将更新后的数组写回 `.scratch/<feature>/suggestions.json`（使用文件写入工具）
8. **GitHub Issue 评论同步**（仅 `source = "github"` 时执行）：
   - 对每条**新增**的 suggestion（去重跳过的不写），追加 issue comment，格式：`autopilot suggestion [<status>]: <正文>`
9. **报告**：向用户报告提取结果 — "从 reviewer 提取了 N 条 Suggestion（M 条新增，K 条去重跳过）"；如有 GitHub comment 同步，注明已写入 N 条 comment

**注意**：仅提取 `## Suggestion` 级别条目。Critical 和 Important 必须在当前 issue 内解决，不传播。

---

VERDICT 分支：

- **MERGE** → 更新 Status 为 `resolved`，追加 reviewer 结论。进入"Update Suggestion 状态"步骤，完成后**返回扫描模式处理下一个 issue**
- **VERIFY_NEEDED** → 审查通过（结构正确）但 implementer 工具链不可用，无法实际验证。处理流程：
  1. 尝试运行项目的测试命令（如 `cargo test`、`npm test`、`pytest`）。如工具链在 orchestrator 环境可用 → 运行验证
  2. 验证通过 → 更新 Status 为 `resolved`，追加 "Orchestrator verified: all tests pass"
  3. 验证失败或工具链仍不可用 → 更新 Status 为 `needs-info`，追加 reviewer 结论 + "Toolchain unavailable — requires manual verification"
  4. 所有情况下保留 reviewer 报告和 Suggestion 提取
- **RETRY** → `retry_count += 1`，清空 `pending_resolutions = []`（上一轮 resolutions 在 retry 后失效，新轮次 implementer 需重新声明）
  - `retry_count < 3`：返回"执行 implementer"（传递 PREV_REVIEW）
  - `retry_count >= 3`：更新 Status 为 `needs-info`，追加 reviewer 问题清单 + 说明已达最大重试次数，**返回扫描模式处理下一个 issue**
- **BLOCKED** → 更新 Status 为 `needs-info`，追加 reviewer 结论，**返回扫描模式处理下一个 issue**
