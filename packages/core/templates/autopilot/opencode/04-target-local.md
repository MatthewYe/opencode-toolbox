---

## 如果指定了 target

### target 是路径（含 `/`）

1. 确认 `<target>/issue.md` 存在，不存在则报告错误并停止
2. 确认 `<target>/AGENT-BRIEF.md` 存在，不存在则报告错误并停止
3. 读取 `<target>/issue.md`，检查 `Status:` 是否为 `ready-for-agent` 或 `in-progress`
4. 非以上状态 → 回复当前状态并停止
5. 更新 Status 为 `in-progress`
6. 设置 `source = "local"`, `id = <target>`
7. 从 `<target>` 推断 feature 目录（取 issue 目录的父级父级，如 `.scratch/auth/issues/01-login/` → `.scratch/auth/`）
8. 设置 `contract = <target>/AGENT-BRIEF.md` 的内容作为合约文本
9. 跳到"交叉 Issue Suggestion 匹配"

### target 是 GitHub issue 号（`#N` 或纯数字 `N`）

提取数字部分为 `issueNumber`：

1. `gh issue view <issueNumber> --json number,title,body,labels,state` 获取 issue 信息
2. 检查 labels 是否含 `ready-for-agent` 或 `in-progress`
3. 非以上标签 → 回复当前状态并停止
4. 将 `ready-for-agent` 标签替换为 `in-progress`：`gh issue edit <issueNumber> --add-label "in-progress" --remove-label "ready-for-agent"`
5. 追加评论：`gh issue comment <issueNumber> --body "autopilot: 开始处理"`
6. 从 issue body 提取 Acceptance Criteria 和 What to build 作为合约文本
7. 设置 `source = "github"`, `id = <issueNumber>`, `contract = <解析出的合约文本>`
8. 从 issue title 生成 feature slug（如 `Implement Suggestion matching` → `suggestion-matching` → `.scratch/suggestion-matching/`）
9. 跳到"交叉 Issue Suggestion 匹配"

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
