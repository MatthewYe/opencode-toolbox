### 执行 implementer

#### 前置：Pre-flight 工具链检测

dispatch implementer 前，检测项目的工具链是否可用：

1. 根据项目类型推断测试命令（Rust → `cargo test`，Node → `npm test`，Python → `pytest` 或 `uv run pytest`）
2. 运行 `which <tool>` 检测工具链是否存在（如 `which cargo`、`which npm`）
3. 不可用时尝试常见安装路径（`~/.cargo/bin/cargo`、`~/.rustup/toolchains/*/bin/cargo`）
4. 设置 `TOOLCHAIN: available` 或 `TOOLCHAIN: unavailable`，传入 implementer 的 dispatch prompt

#### 前置：REFACTORING 模式检测

分析合约内容，检测当前 issue 是否为纯重构任务（非新功能开发）：

1. 扫描合约关键词：`replace`、`consolidate`、`extract`、`delete`、`Remove`、`Replace`、`inline`、`shared function`、`duplicated` → 命中 2+ 且不含 `Add`、`new feature`、`Implement`（作为新增功能时）→ 标记 `REFACTORING: true`
2. 对照 AC：如果所有 AC 描述的是"替换"或"删除"而非"新增功能" → `REFACTORING: true`
3. 设置 `REFACTORING: true|false`，传入 implementer 的 dispatch prompt

#### 强制 Skill 加载指令

**在开始任何操作之前，必须使用 `skill` 工具加载以下技能：**
```
1. `skill(name: "tdd")` — TDD 方法论（红绿重构循环、测试质量标准、mock 纪律）
2. `skill(name: "diagnose")` — 系统性诊断流程（遇到意外错误时使用）
3. `skill(name: "zoom-out")` — 不熟悉代码区域时上探抽象层次

**这是强制步骤，不可跳过。** 未加载技能前不得执行任何其他操作。
```

---

<以下为任务描述>

<根据 retry_count 和模式动态生成>

任务描述部分传递：
- **共同的**：`source`, `id`, `contract`（合约内容）, `TOOLCHAIN: <available|unavailable>`, `REFACTORING: <true|false>`，以及：
  - 首次（retry_count = 0）：`ROUND: 0`
  - retry（retry_count >= 1）：`ROUND: <retry_count>` + `PREV_REVIEW: <上一轮 REVIEWER_REPORT 全文>`
  - 如有匹配到的 CROSS_ISSUE_SUGGESTIONS，一并传入
- **本地模式**：额外传 issue 目录绝对路径
- **GitHub 模式**：额外传 issue body（含 AC）+ `IS_GITHUB: true`

等待 implementer 回复，解析 `IMPLEMENTER_REPORT:`。

**空回复处理：** 如果 implementer 返回空结果（无 `IMPLEMENTER_REPORT:` 标记头），自动重试 1 次（重新 dispatch 相同 prompt）。两次都空 → 更新 Status 为 `needs-info` 并停止。

**解析容错：** 回复中找不到 `IMPLEMENTER_REPORT:` 标记头 → 视为不可解析，更新 Status 为 `needs-info` 附原始回复，停止。
