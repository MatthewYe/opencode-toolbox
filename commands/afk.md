---
description: Scan .scratch/ for ready-for-agent issues, dispatch implementer → reviewer → update status
arguments: [{ name: "issue_dir", description: "Optional: process a specific .scratch/<feature>/issues/<NN-slug> directory. If omitted, scan all.", required: false }]
---

Load the `tdd`, `diagnose`, and `zoom-out` skills, then execute the AFK orchestrator workflow:

## 如果指定了 issue_dir

直接处理该目录：

1. 读取 `<issue_dir>/issue.md`，检查 `Status:` 是否为 `ready-for-agent` 或 `in-progress`（retry）
2. 读取 `<issue_dir>/AGENT-BRIEF.md`
3. 将 Status 更新为 `in-progress`
4. 跳到"执行 implementer"

## 否则（无参数）：扫描模式

扫描当前工作目录下所有 `.scratch/*/issues/*.md` 文件：

1. Glob 扫描 `.scratch/*/issues/*.md`
2. 对每个文件，读取第一段（前 30 行），检查是否有 `Status: ready-for-agent`
3. 如果有多个，选择第一个，向用户报告遇到了哪些 issue
4. 如果零个，回复："No ready-for-agent issues found in .scratch/"
5. 读取该 issue 目录下的 `AGENT-BRIEF.md`
6. 将 issue Status 更新为 `in-progress`

## 调度循环

维护 `retry_count = 0`，最大 3 轮（首次 + 2 次 retry 后进入第 3 轮 = 总共 3 次 implementer 调度机会）。

### 执行 implementer

用 `task` 工具 dispatch `implementer` agent，传递：

- issue 目录绝对路径
- 如果是首次（retry_count = 0）：传递 `ROUND: 0`
- 如果是 retry（retry_count ≥ 1）：传递 `ROUND: <retry_count>` + `PREV_REVIEW: <上一轮 REVIEWER_REPORT 全文>`

等待 implementer 回复，解析 `IMPLEMENTER_REPORT:`。

### 首次实现：检查 SELF_REVIEW

如果 retry_count = 0 且 STATUS: DONE，检查报告中有无 `SELF_REVIEW:` 段。如果是 "无问题" 或列出"发现问题 → 已修复"，通过。

如果缺失 SELF_REVIEW 段但 STATUS: DONE → 标记为 `needs-info`（implementer 未执行自审）。

### 处理 implementer 结果

- **STATUS: DONE** → dispatch `reviewer` agent（传递 issue 目录 + CHANGED_FILES + 上一轮 REVIEWER_REPORT 如有）
- **STATUS: BLOCKED 或 NEEDS_CONTEXT** → 更新 issue Status 为 `needs-info`，在 `## Comments` 追加原因，**停止**

### 处理 reviewer 结果

解析 `REVIEWER_REPORT:`，看 VERDICT：

- **MERGE** → 更新 issue Status 为 `resolved`，在 `## Comments` 追加 reviewer 结论，**停止**
- **RETRY** → `retry_count += 1`
  - 如果 `retry_count < 3`：返回"执行 implementer"（传递 PREV_REVIEW）
  - 如果 `retry_count >= 3`：更新 Status 为 `needs-info`，附 reviewer 问题清单，**停止**
- **BLOCKED** → 更新 Status 为 `needs-info`，附 reviewer 结论，**停止**

## 完成后

向用户报告处理了哪个 issue、轮次、最终状态、关键发现。
