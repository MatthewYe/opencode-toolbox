### 交叉 Issue Suggestion 匹配

dispatch implementer 前，扫描 `suggestions.json`，匹配 pending suggestions 到当前 issue 的 AGENT-BRIEF：

#### 推断 feature 目录

- **本地模式**：从 issue 路径提取（如 `.scratch/auth/issues/01-login/` → `.scratch/auth/`）
- **GitHub 模式**：从 issue title 生成 feature slug → `.scratch/<feature-slug>/`
- 若无从推断 → 跳过匹配，不传 CROSS_ISSUE_SUGGESTIONS

#### 读取和匹配

1. 检查 `.scratch/<feature>/suggestions.json` 是否存在：
   - 不存在 → 跳过匹配，不传 CROSS_ISSUE_SUGGESTIONS
   - 存在 → 读取，筛选 `status: "pending"` 的条目
2. 对每条 pending suggestion，执行双重匹配（**任一命中即视为匹配**）：
   - **文件路径匹配**：suggestion 的 `files` 数组中任一路径字符串作为子串出现在 AGENT-BRIEF 全文（issue body、AC 文本、文件引用）→ 命中
   - **关键词匹配**：suggestion 的 `keywords` 数组中任一关键词作为子串出现在 AGENT-BRIEF 全文中（**大小写不敏感**）→ 命中
3. 未命中的 suggestions 保持 `pending` 状态，不传递
4. 命中的 suggestions 组装为 `CROSS_ISSUE_SUGGESTIONS` JSON 数组。每条附带完整 reviewer 上下文：
   ```json
   {
     "source_issue": "#N 或 <slug>",
     "round": <N>,
     "content": "<suggestion 正文>",
     "files": ["path/to/file1.ts", ...],
     "keywords": ["keyword1", ...],
      "reviewer_context": "<原 REVIEWER_REPORT 摘录：该 Suggestion 所属 REVIEWER_REPORT 中 Suggestion 条目全文（含 KEYWORKS/FILES 标注）>"
    }
    ```
    **`reviewer_context` 重建**：`suggestions.json` 中存储的是结构化字段（`content`、`files`、`keywords`），不含标注行。组装 `CROSS_ISSUE_SUGGESTIONS` 时，orchestrator 需从独立字段重建 `reviewer_context`（即带 KEYWORDS/FILES 标注行的完整 reviewer report 摘录），格式如：
    ```
    - [ ] <content>
      KEYWORDS: <keywords>
      FILES: <files>
    ```
5. 无匹配到任何 suggestion → 不传 CROSS_ISSUE_SUGGESTIONS
