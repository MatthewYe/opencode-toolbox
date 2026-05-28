---
description: Put issue resolution on autopilot — scans local .scratch/ files AND GitHub Issues for ready-for-agent issues, dispatches implementer → reviewer in a retry loop until resolved. After all issues complete, runs global meta-review against ADR/PRD and fixes cross-module issues. Use when processing autopilot issues from any source.
arguments: [{ name: "target", description: "Optional: a .scratch/<feature>/issues/<NN-slug> directory path, or a GitHub issue number (#N or N). If omitted, scan all sources.", required: false }]
---

Execute the autopilot orchestrator workflow below. Implementer and reviewer agents load `tdd`, `diagnose`, and `zoom-out` skills autonomously — orchestrator does not need to load them.

## Issue 来源识别

autopilot 支持两种 issue 来源。根据 `target` 参数或扫描结果判断：

| target 特征 | 来源 | 状态机 | 合约文件 |
|---|---|---|---|
| 包含 `/` 的路径 | 本地 `.scratch/` | frontmatter `Status:` | `AGENT-BRIEF.md` |
| `#N` 或纯数字 `N` | GitHub Issue | labels | issue body（含 AC） |
| 无参数扫描到本地 | 本地 `.scratch/` | frontmatter `Status:` | `AGENT-BRIEF.md` |
| 无参数扫描到 GitHub | GitHub Issue | labels | issue body |

## 前置约定

### 本地 issue 模式

- `target` 使用绝对路径。如传入相对路径，拼接当前工作目录。
- `issue.md` 以 YAML frontmatter 开头，`Status` 字段在 frontmatter 中。
- 更新 Status：用 `edit` 工具修改 frontmatter 中的 `Status:` 行。
- 追加注释：在 `## Comments` 节末尾加 `- <时间戳> autopilot: <内容>`。无该节则在文件末尾创建。
- 合约文件：同目录下 `AGENT-BRIEF.md`。

### GitHub Issue 模式

- 使用 `gh` CLI 操作 issue。从 `git remote -v` 自动推断 repo。
- 状态通过 labels 表达：`in-progress`、`resolved`、`needs-info`。
- 追加注释用 `gh issue comment <N> --body "..."`。
- 合约来自 issue body（其中包含 Acceptance Criteria 和 What to build，由 `to-issues` 创建）。
- 读取 issue：`gh issue view <N> --json number,title,body,labels,state`。

### 共用概念

- `Status: ready-for-agent`（本地 frontmatter）↔ label `ready-for-agent`（GitHub）
- `Status: in-progress` ↔ label `in-progress`
- `Status: resolved` ↔ label `resolved`
- `Status: needs-info` ↔ label `needs-info`

---

## 如果指定了 target

### target 是路径（含 `/`）

1. 确认 `<target>/issue.md` 存在，不存在则报告错误并停止
2. 确认 `<target>/AGENT-BRIEF.md` 存在，不存在则报告错误并停止
3. 读取 `<target>/issue.md`，检查 `Status:` 是否为 `ready-for-agent` 或 `in-progress`
4. 非以上状态 → 回复当前状态并停止
5. 更新 Status 为 `in-progress`
6. 设置 `source = "local"`, `id = <target>`
7. 跳到"执行 implementer"

### target 是 GitHub issue 号（`#N` 或纯数字 `N`）

提取数字部分为 `issueNumber`：

1. `gh issue view <issueNumber> --json number,title,body,labels,state` 获取 issue 信息
2. 检查 labels 是否含 `ready-for-agent` 或 `in-progress`
3. 非以上标签 → 回复当前状态并停止
4. 将 `ready-for-agent` 标签替换为 `in-progress`：`gh issue edit <issueNumber> --add-label "in-progress" --remove-label "ready-for-agent"`
5. 追加评论：`gh issue comment <issueNumber> --body "autopilot: 开始处理"`
6. 从 issue body 提取 Acceptance Criteria 和 What to build 作为合约文本
7. 设置 `source = "github"`, `id = <issueNumber>`, `contract = <解析出的合约文本>`
8. 跳到"执行 implementer"

---

## 否则（无参数）：扫描模式

同时扫描两个来源：

### 本地扫描

1. Glob 扫描 `.scratch/*/issues/*.md`
2. 对每个文件，读取前 30 行，检查是否有 `Status: ready-for-agent`
3. 收集所有匹配项

### GitHub 扫描

4. `gh issue list --label "ready-for-agent" --state open --json number,title --limit 50`
5. 收集所有匹配项

### 选择并报告

6. 合并两个来源的结果。向用户列出所有找到的 issue
7. 选择第一个（按先本地后 GitHub，各自内部按自然序），标注正在处理哪个
8. 如果零个 → 跳到"Phase 2: 全局 meta-review"
9. 根据选中 issue 的来源，走对应的初始化流程

---

## Phase 1: 调度循环

维护 `retry_count = 0`，最多 3 轮（`retry_count` = 0, 1, 2）：
- retry_count = 0: 首次实现
- retry_count = 1: 第 1 次 retry
- retry_count = 2: 第 2 次 retry
- retry_count >= 3: 转为 needs-info

### 更新状态（抽象）

- **local**: `edit` 工具修改 `issue.md` 的 `Status:` 行
- **github**: `gh issue edit <N> --add-label "<新>" --remove-label "<旧>"`

### 追加注释（抽象）

- **local**: 在 `issue.md` 的 `## Comments` 节末尾添加条目
- **github**: `gh issue comment <N> --body "<时间戳> autopilot: <内容>"`

### 执行 implementer

用 `task` 工具 dispatch `implementer` agent（subagent_type: `implementer`），传递：

- **共同的**：`source`, `id`, `contract`（合约内容），以及：
  - 首次（retry_count = 0）：`ROUND: 0`
  - retry（retry_count >= 1）：`ROUND: <retry_count>` + `PREV_REVIEW: <上一轮 REVIEWER_REPORT 全文>`
- **本地模式**：额外传 issue 目录绝对路径
- **GitHub 模式**：额外传 issue body（含 AC）+ `IS_GITHUB: true`

等待 implementer 回复，解析 `IMPLEMENTER_REPORT:`。

**空回复处理：** 如果 implementer 返回空结果（无 `IMPLEMENTER_REPORT:` 标记头），自动重试 1 次（重新 dispatch 相同 prompt）。两次都空 → 更新 Status 为 `needs-info` 并停止。

**解析容错：** 回复中找不到 `IMPLEMENTER_REPORT:` 标记头 → 视为不可解析，更新 Status 为 `needs-info` 附原始回复，停止。

### 首次实现：检查 SELF_REVIEW

retry_count = 0 且 STATUS: DONE → 检查报告中有无 `SELF_REVIEW:` 段。"无问题" 或 "发现问题 → 已修复" → 通过。

缺失 SELF_REVIEW 但 STATUS: DONE → 标记为 `needs-info`，停止。

Retry 轮次（retry_count >= 1）不检查 SELF_REVIEW。

### 收集 SIBLING_CONTEXT

dispatch reviewer 前，自动收集当前 issue 所属 PRD 下所有已 resolved 的兄弟模块信息：

1. 从当前 issue body 的 `Parent` 链接提取 PRD issue 号
2. `gh issue list --label "resolved" --json number,title` 获取所有已 resolve 的 issue
3. 对于每个已 resolve 的 issue（排除当前 issue 自己），提取其 title 和关键约定（入口模式、测试框架、文件布局）
4. 组装为 `SIBLING_CONTEXT` 字符串，包含："已完成的兄弟模块: #N title — 关键约定: ..."

### 处理 implementer 结果

- **STATUS: DONE** → dispatch `reviewer` agent，传递 `source`, `id`, `contract`, `CHANGED_FILES`, `SIBLING_CONTEXT` + 上一轮 `REVIEWER_REPORT`（如有）
  - **GitHub 模式**：额外传 `IS_GITHUB: true`
- **STATUS: BLOCKED 或 NEEDS_CONTEXT** → 更新 Status 为 `needs-info`，追加注释说明原因，**停止**

### 处理 reviewer 结果

解析 `REVIEWER_REPORT:`，看 VERDICT。reviewer 任务失败或找不到 `VERDICT:` → 视为 BLOCKED，更新 Status 为 `needs-info` 并停止。

**解析容错：** 找不到 `REVIEWER_REPORT:` 标记头 → 视为不可解析，更新 Status 为 `needs-info` 附原始回复，停止。

VERDICT 分支：

- **MERGE** → 更新 Status 为 `resolved`，追加 reviewer 结论，**返回扫描模式处理下一个 issue**
- **RETRY** → `retry_count += 1`
  - `retry_count < 3`：返回"执行 implementer"（传递 PREV_REVIEW）
  - `retry_count >= 3`：更新 Status 为 `needs-info`，追加 reviewer 问题清单 + 说明已达最大重试次数，**返回扫描模式处理下一个 issue**
- **BLOCKED** → 更新 Status 为 `needs-info`，追加 reviewer 结论，**返回扫描模式处理下一个 issue**

### Phase 1 退出条件

当扫描模式返回零个 ready-for-agent issue 时，Phase 1 完成。进入 Phase 2。

---

## Phase 2: 全局 Meta-Review

当所有 issue 处理完毕（无 ready-for-agent 剩余），执行全局审查。

### 目的

对照 ADR、PRD 和所有 issue 合约，审视整个 codebase 的：
- 实现正确性（所有模块是否符合各自的 AC 和 PRD 全局约束）
- 跨模块一致性（是否有模式漂移、重复实现、约定不一致）
- 计划外变更（是否有孤儿文件、未声明依赖、残留引用）

### 执行方式

**不 dispatch reviewer agent** — orchestrator 自己执行审查：

1. 读取 PRD 全文和 ADR 0003，列出每条全局约束
2. 逐条检查：用 grep/glob 扫描 codebase，验证约束满足
3. 对照 issue 合约，检查每个 resolved issue 的 AC 覆盖率
4. 检查跨模块一致性（见 `docs/agents/reviewer-checklist.md` 维度四 4b）
5. 检查计划外变更（见维度四 4c）
6. 输出结构化报告：Critical / Important / Suggestion + VERDICT

### 修复循环

meta-review 发现的问题由 **orchestrator 直接修复**（不 dispatch implementer），因为 meta 问题通常是机械性的：

- **统一模式**：isMain 不一致 → 直接 edit 文件统一为一种模式
- **删除残留**：孤儿文件 / __pycache__ / 残留引用 → 直接 delete/edit
- **更新文档**：SKILL.md / schemas.md / ADR 引用 → 直接 edit

遇到需要判断的设计级问题（如"两种算法选哪个"），追加 comment 标记为 needs-info。

### 修复后验证

修复完成后：
1. 运行 `bun test` 确认测试全绿
2. 重新执行 meta-review，确认 0 Critical + 0 Important
3. 最多 **2 轮**修复循环。2 轮后仍有问题 → 报告残余问题，标记 needs-info

### 完成后

向用户报告 Phase 1 和 Phase 2 的完整结果：处理了多少 issue、总轮次、最终状态、meta-review 发现和修复了哪些问题。
