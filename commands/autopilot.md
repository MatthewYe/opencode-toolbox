---
description: Put issue resolution on autopilot — scans local .scratch/ files AND GitHub Issues for ready-for-agent issues, dispatches implementer → reviewer in a retry loop until resolved. Use when processing autopilot issues from any source.
arguments: [{ name: "target", description: "Optional: a .scratch/<feature>/issues/<NN-slug> directory path, or a GitHub issue number (#N or N). If omitted, scan all sources.", required: false }]
---

Load the `tdd`, `diagnose`, and `zoom-out` skills, then execute the autopilot orchestrator workflow.

## Issue 来源识别

autopilot 支持两种 issue 来源。根据 `target` 参数或扫描结果判断：

| target 特征 | 来源 | 状态机 | 合约文件 |
|---|---|---|---|
| 包含 `/` 的路径 | 本地 `.scratch/` | frontmatter `Status:` | `AGENT-BRIEF.md` |
| `#N` 或纯数字 `N` | GitHub Issue | labels | issue body（含 AC） |
| 无参数扫描到本地 | 本地 `.scratch/` | frontmatter `Status:` | `AGENT-BRIEF.md` |
| 无参数扫描到 GitHub | GitHub Issue | labels | issue body |

下文统称 **issue 来源对象**，包含以下字段：
- `source`: `"local"` | `"github"`
- `id`: 本地路径 或 GitHub issue 号
- `contract`: AGENT-BRIEF 文件路径 或 issue body 文本
- `issue_content`: issue.md 路径 或 issue body 文本

---

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

6. 合并两个来源的结果。向用户列出所有找到的 issue：

```
Found ready-for-agent issues:
  [local] .scratch/feat/issues/01-login — Add login feature
  [github] #2 — Migrate utils.ts
  [github] #3 — Migrate generate_report.ts
```

7. 选择第一个（按先本地后 GitHub，各自内部按自然序），标注正在处理哪个
8. 如果零个 → 回复："No ready-for-agent issues found in .scratch/ or GitHub"
9. 根据选中 issue 的来源，走对应的初始化流程（路径模式 / GitHub 模式）

---

## 调度循环

维护 `retry_count = 0`，最多 3 轮（`retry_count` = 0, 1, 2）：
- retry_count = 0: 首次实现
- retry_count = 1: 第 1 次 retry
- retry_count = 2: 第 2 次 retry
- retry_count >= 3: 转为 needs-info

### 更新状态（抽象）

根据 `source` 类型更新状态：

- **local**: `edit` 工具修改 `issue.md` 的 `Status:` 行
- **github**: `gh issue edit <N> --add-label "<新>" --remove-label "<旧>"`

### 追加注释（抽象）

根据 `source` 类型追加注释：

- **local**: 在 `issue.md` 的 `## Comments` 节末尾添加条目
- **github**: `gh issue comment <N> --body "<时间戳> autopilot: <内容>"`

### 执行 implementer

用 `task` 工具 dispatch `implementer` agent（subagent_type: `implementer`），传递：

- **共同的**：`source`, `id`, `contract`（合约内容），以及：
  - 首次（retry_count = 0）：`ROUND: 0`
  - retry（retry_count >= 1）：`ROUND: <retry_count>` + `PREV_REVIEW: <上一轮 REVIEWER_REPORT 全文>`
- **本地模式**：额外传 issue 目录绝对路径
- **GitHub 模式**：额外传 issue body（含 AC）+ `IS_GITHUB: true`，告知 implementer 没有 AGENT-BRIEF.md 文件，合约内容已直接传入

等待 implementer 回复，解析 `IMPLEMENTER_REPORT:`。如果 implementer 任务失败（无回复或报错），视为 BLOCKED，更新 Status 为 `needs-info` 并停止。

**解析容错：** 回复中找不到 `IMPLEMENTER_REPORT:` 标记头 → 视为不可解析，更新 Status 为 `needs-info` 附原始回复，停止。

### 首次实现：检查 SELF_REVIEW

retry_count = 0 且 STATUS: DONE → 检查报告中有无 `SELF_REVIEW:` 段。"无问题" 或 "发现问题 → 已修复" → 通过。

缺失 SELF_REVIEW 但 STATUS: DONE → 标记为 `needs-info`（implementer 未执行自审），停止。

Retry 轮次（retry_count >= 1）不检查 SELF_REVIEW。

### 处理 implementer 结果

- **STATUS: DONE** → dispatch `reviewer` agent，传递 `source`, `id`, `contract`, `CHANGED_FILES` + 上一轮 `REVIEWER_REPORT`（如有）
  - **GitHub 模式**：额外传 `IS_GITHUB: true`
  - **多模块任务组**：如果当前 issue 属于同一个 PRD/计划下的兄弟模块组，额外传递 `SIBLING_CONTEXT`：列出所有已 resolve 的兄弟 issue 的编号和 CHANGED_FILES。获取方式：扫描同一 PRD 关联的 issue（通过 issue body 中的 Parent 链接），提取 labels 含 `resolved` 或 Status 为 `resolved` 的 issue 的 CHANGED_FILES 列表。reviewer 会在维度四中对照这些兄弟模块检查一致性。
- **STATUS: BLOCKED 或 NEEDS_CONTEXT** → 更新 Status 为 `needs-info`，追加注释说明原因，**停止**

### 处理 reviewer 结果

解析 `REVIEWER_REPORT:`，看 VERDICT。reviewer 任务失败或找不到 `VERDICT:` → 视为 BLOCKED，更新 Status 为 `needs-info` 并停止。

**解析容错：** 找不到 `REVIEWER_REPORT:` 标记头 → 视为不可解析，更新 Status 为 `needs-info` 附原始回复，停止。

VERDICT 分支：

- **MERGE** → 更新 Status 为 `resolved`，追加 reviewer 结论，**停止**
- **RETRY** → `retry_count += 1`
  - `retry_count < 3`：返回"执行 implementer"（传递 PREV_REVIEW）
  - `retry_count >= 3`：更新 Status 为 `needs-info`，追加 reviewer 问题清单 + 说明已达最大重试次数，**停止**
- **BLOCKED** → 更新 Status 为 `needs-info`，追加 reviewer 结论，**停止**

---

## 完成后

向用户报告：处理了哪个 issue、来源类型（local/GitHub）、总轮次、最终状态（resolved / needs-info）、关键发现。
