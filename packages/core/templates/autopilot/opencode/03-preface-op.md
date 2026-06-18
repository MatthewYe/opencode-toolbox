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
