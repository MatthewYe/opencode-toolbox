### 收集 SIBLING_CONTEXT

dispatch reviewer 前，自动收集当前 issue 所属 PRD 下所有已 resolved 的兄弟模块信息：

1. 从当前 issue body 的 `Parent` 链接提取 PRD issue 号
2. `gh issue list --label "resolved" --json number,title` 获取所有已 resolve 的 issue
3. 对于每个已 resolve 的 issue（排除当前 issue 自己），提取其 title 和关键约定（入口模式、测试框架、文件布局）
4. 组装为 `SIBLING_CONTEXT` 字符串，包含："已完成的兄弟模块: #N title — 关键约定: ..."
