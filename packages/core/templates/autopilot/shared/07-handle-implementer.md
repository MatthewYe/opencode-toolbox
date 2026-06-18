### 处理 implementer 结果

- **STATUS: DONE** → dispatch `reviewer` agent。**prompt 必须以 skill 加载指令开头（强制，不可省略）**：

```
**在开始任何操作之前，必须使用 `skill` 工具加载以下技能：**
1. `skill(name: "tdd")` — 测试质量标准和 mock 纪律（用于 TDD 审查维度）

**这是强制步骤，不可跳过。** 未加载技能前不得执行任何其他操作。

---

<以下为任务描述>
```

任务描述部分传递 `source`, `id`, `contract`, `CHANGED_FILES`, `SIBLING_CONTEXT` + 上一轮 `REVIEWER_REPORT`（如有）
  - **GitHub 模式**：额外传 `IS_GITHUB: true`

- **STATUS: UNVERIFIED** → dispatch `reviewer` agent（同上 prompt 格式）。任务描述中额外传递 `UNVERIFIED: true` + implementer 的完整 `SELF_REVIEW` 段（含逐 AC 验证方式标注）。reviewer 的审查侧重：
  - 结构正确性（代码逻辑是否符合 AC）
  - 是否所有 AC 都有对应的代码实现
  - VERDICT 可选 `VERIFY_NEEDED`（结构通过但需工具链验证）或 `RETRY`（结构本身有问题）

- **STATUS: BLOCKED 或 NEEDS_CONTEXT** → 更新 Status 为 `needs-info`，追加注释说明原因，**停止**

#### 解析 SUGGESTION_RESOLUTIONS

STATUS: DONE 时，从 `IMPLEMENTER_REPORT` 中解析 `SUGGESTION_RESOLUTIONS:` 段，暂存待 reviewer 确认后执行：

1. 如段内容为 "无" 或不存在 → 无需要处理的跨 issue suggestion，跳过
2. 逐条解析，每行格式：`[resolved|rejected|deferred] 来源 <source_issue> round <N>: <content 摘要> → <处理说明>`
3. 提取字段：
   - `type`：`resolved` / `rejected` / `deferred`
   - `source_issue`：来源 issue 标识（如 `#18`、`01-login`）
   - `round`：reviewer 轮次
   - `summary`：`→` 前的 content 摘要
   - `detail`：`→` 后的处理说明（对 rejected 即拒绝理由）
4. 暂存为 `pending_resolutions` 列表，在 reviewer 返回 MERGE 后统一执行状态更新
