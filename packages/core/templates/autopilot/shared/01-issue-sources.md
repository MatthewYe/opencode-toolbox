## Issue 来源识别

autopilot 支持两种 issue 来源。根据 `target` 参数或扫描结果判断：

| target 特征 | 来源 | 状态机 | 合约文件 |
|---|---|---|---|
| 包含 `/` 的路径 | 本地 `.scratch/` | frontmatter `Status:` | `AGENT-BRIEF.md` |
| `#N` 或纯数字 `N` | GitHub Issue | labels | issue body（含 AC） |
| 无参数扫描到本地 | 本地 `.scratch/` | frontmatter `Status:` | `AGENT-BRIEF.md` |
| 无参数扫描到 GitHub | GitHub Issue | labels | issue body |
