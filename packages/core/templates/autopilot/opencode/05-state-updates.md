### 更新状态（抽象）

- **local**: `edit` 工具修改 `issue.md` 的 `Status:` 行
- **github**: `gh issue edit <N> --add-label "<新>" --remove-label "<旧>"`

### 追加注释（抽象）

- **local**: 在 `issue.md` 的 `## Comments` 节末尾添加条目
- **github**: `gh issue comment <N> --body "<时间戳> autopilot: <内容>"`
