### FINAL_ACCEPTANCE_REPORT

meta-review 完成后，产出跨 issue Suggestion 验收报告，供人类签收。

#### 1. 聚合 Suggestions

扫描所有 feature 目录的 `suggestions.json`，汇总所有条目：

- 用 `glob` 扫描 `.scratch/*/suggestions.json`，读取每个文件
- 将每个条目合并到统一列表中，保留来源 feature 信息

**GitHub Issue 模式附加聚合**：

当 Phase 1 处理过 GitHub issue 时，从 issue comments 中提取 suggestions，与本地 `suggestions.json` 合并：

1. 对每个处理过的 GitHub issue，用读取 comments API 获取所有 comments
2. 筛选格式为 `autopilot suggestion [<status>]: <正文>` 的 comments
3. 对每条提取：`status`（从 `[<status>]` 块）、`content`（`:` 后的正文）、`source_issue`（`#<N>`）
4. 与本地 `suggestions.json` 条目按 `content` 去重合并（本地优先：本地已有相同 content 的条目保留本地版本及完整字段）

#### 2. 分组统计

按 `status` 字段分组：

| 分组 | 内容 | 来源 |
|------|------|------|
| **Pending** | `status: "pending"` 的所有条目 | 列出 `content`、`source_issue`、`keywords`；如有 `deferred_by`，注明 |
| **Rejected** | `status: "rejected"` 的所有条目 | 列出 `content`、`source_issue`、`rejected_reason` |
| **Resolved** | `status: "resolved"` 的所有条目 | 列出 `content`、`resolved_in_issue`、原 `source_issue` |

#### 3. 输出 FINAL_ACCEPTANCE_REPORT

以 `FINAL_ACCEPTANCE_REPORT:` 为标记头输出结构化报告：

```
FINAL_ACCEPTANCE_REPORT:

## Pending（需处理）
- <content>
  - 来源: <source_issue>
  - 关键词: <keywords>
  - [deferred by: <issue-slug>]
...（如无 pending，写 "无"）

## Rejected（已拒绝）
- <content>
  - 来源: <source_issue>
  - 理由: <rejected_reason>
...（如无 rejected，写 "无"）

## Resolved（已解决）
- <content>
  - 来源: <source_issue>
  - 由 <resolved_in_issue> 处理
...（如无 resolved，写 "无"）
```

#### 4. 边界处理

- `suggestions.json` 不存在（glob 无结果）→ 报告 "No suggestions.json found. Skipping acceptance report."（**不影响 meta-review 流程**）
- 存在但无 pending → 报告 "All suggestions resolved. Ready for sign-off."
- 有 pending → 报告 "The following suggestions require human attention:" + 逐条列出 + 建议人工判断处理方向（落实为后续 issue 或标记 rejected）
- 仅 GitHub issue comments 中有 suggestions 而本地无 `suggestions.json` → 以 comments 聚合结果为准，仍输出完整报告

#### 5. Self-Verification

FINAL_ACCEPTANCE_REPORT 输出后，orchestrator 执行以下快速自检：

- [ ] `suggestions.json` 中的每条 `status: "resolved"` 条目均有 `resolved_in_issue` 字段
- [ ] `suggestions.json` 中的每条 `status: "rejected"` 条目均有 `rejected_reason` 字段
- [ ] 无 `status: "pending"` 条目被意外标记为 `resolved_in_issue`（仅 resolved 应有此字段）
- [ ] FINAL_ACCEPTANCE_REPORT 的 Pending / Rejected / Resolved 三组条目数之和 = `suggestions.json` 总条目数（去重后）
- [ ] 无空 `content` 字段的条目
- [ ] 发现异常 → 记录到报告末尾的 `## Self-Verification Issues` 节，人工跟进
