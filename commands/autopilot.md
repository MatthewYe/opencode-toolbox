---
description: Put issue resolution on autopilot — scans .scratch/ for ready-for-agent issues, dispatches implementer → reviewer in a retry loop until resolved.
arguments: [{ name: "issue_dir", description: "Optional: process a specific .scratch/<feature>/issues/<NN-slug> directory. If omitted, scan all.", required: false }]
---

Load the `tdd`, `diagnose`, and `zoom-out` skills, then execute the autopilot orchestrator workflow:

## 前置约定

- `issue_dir` 必须使用绝对路径。如果用户传入相对路径，拼接当前工作目录得到绝对路径。
- Issue 文件格式：`issue.md` 以 YAML frontmatter 开头，`Status` 字段在 frontmatter 中（`Status: ready-for-agent`）。文件可包含 `## Comments` 二级标题，所有状态变更备注追加到该节末尾。
- 更新 Status：修改 frontmatter 中的 `Status:` 行。追加注释时，在 `## Comments` 节末尾添加 `- <时间戳> autopilot: <内容>` 条目。如果文件没有 `## Comments` 节，在文件末尾创建。

## 如果指定了 issue_dir

直接处理该目录：

1. 确认 `<issue_dir>/issue.md` 存在，不存在则报告错误并停止
2. 确认 `<issue_dir>/AGENT-BRIEF.md` 存在，不存在则报告错误并停止
3. 读取 `<issue_dir>/issue.md`，检查 `Status:` 是否为 `ready-for-agent` 或 `in-progress`（retry）
4. 如果不是以上状态，回复该 issue 当前状态并停止
5. 将 Status 更新为 `in-progress`
6. 跳到"执行 implementer"

## 否则（无参数）：扫描模式

扫描当前工作目录下所有 `.scratch/*/issues/*.md` 文件：

1. Glob 扫描 `.scratch/*/issues/*.md`
2. 对每个文件，读取第一段（前 30 行），检查是否有 `Status: ready-for-agent`
3. 如果有多个，选择第一个，向用户报告遇到了哪些 issue（列出所有找到的，标注正在处理哪个）
4. 如果零个，回复："No ready-for-agent issues found in .scratch/"
5. 确认该 issue 目录下的 `AGENT-BRIEF.md` 存在，不存在则报告错误并停止
6. 将 issue Status 更新为 `in-progress`

## 调度循环

维护 `retry_count = 0`，最多 3 轮 implementer 调度（`retry_count` 依次为 0, 1, 2）。逻辑：
- retry_count = 0: 首次实现
- retry_count = 1: 第 1 次 retry
- retry_count = 2: 第 2 次 retry
- retry_count >= 3: 不再重试，转为 needs-info

### 执行 implementer

用 `task` 工具 dispatch `implementer` agent（subagent_type: `implementer`），传递：

- issue 目录绝对路径
- 如果是首次（retry_count = 0）：传递 `ROUND: 0`
- 如果是 retry（retry_count ≥ 1）：传递 `ROUND: <retry_count>` + `PREV_REVIEW: <上一轮 REVIEWER_REPORT 全文>`

等待 implementer 回复，解析 `IMPLEMENTER_REPORT:`。如果 implementer 任务失败（无回复或报错），视为 BLOCKED，更新 Status 为 `needs-info` 并停止。

**解析容错：** 如果回复中找不到 `IMPLEMENTER_REPORT:` 标记头，将整段回复视为不可解析，更新 Status 为 `needs-info` 附原始回复，停止。

### 首次实现：检查 SELF_REVIEW

如果 retry_count = 0 且 STATUS: DONE，检查报告中有无 `SELF_REVIEW:` 段。如果是 "无问题" 或列出"发现问题 → 已修复"，通过。

如果缺失 SELF_REVIEW 段但 STATUS: DONE → 标记为 `needs-info`（implementer 未执行自审），停止。

Retry 轮次（retry_count ≥ 1）不检查 SELF_REVIEW —— implementer 在 retry 模式下只修 Critical 问题且做快速自检，无需完整自审。

### 处理 implementer 结果

- **STATUS: DONE** → dispatch `reviewer` agent（传递 issue 目录绝对路径 + CHANGED_FILES + 上一轮 REVIEWER_REPORT 如有）
- **STATUS: BLOCKED 或 NEEDS_CONTEXT** → 更新 issue Status 为 `needs-info`，在 `## Comments` 追加原因，**停止**

### 处理 reviewer 结果

解析 `REVIEWER_REPORT:`，看 VERDICT。如果 reviewer 任务失败或报告中找不到 `VERDICT:`，视为 BLOCKED，更新 Status 为 `needs-info` 并停止。

**解析容错：** 找不到 `REVIEWER_REPORT:` 标记头 → 视为不可解析，更新 Status 为 `needs-info` 附原始回复，停止。

VERDICT 分支：

- **MERGE** → 更新 issue Status 为 `resolved`，在 `## Comments` 追加 reviewer 结论，**停止**
- **RETRY** → `retry_count += 1`
  - 如果 `retry_count < 3`：返回"执行 implementer"（传递 PREV_REVIEW）
  - 如果 `retry_count >= 3`：更新 Status 为 `needs-info`，在 `## Comments` 附 reviewer 问题清单并说明已达最大重试次数，**停止**
- **BLOCKED** → 更新 Status 为 `needs-info`，在 `## Comments` 附 reviewer 结论，**停止**

## 完成后

向用户报告：处理了哪个 issue、总轮次、最终状态（resolved / needs-info）、关键发现。
