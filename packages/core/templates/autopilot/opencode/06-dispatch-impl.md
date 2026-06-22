用 `task` 工具 dispatch `implementer` agent（`subagent_type: "implementer"`）。**prompt 必须以 skill 加载指令开头（强制，不可省略）**：

```
**在开始任何操作之前，必须使用 `skill` 工具加载以下技能：**
1. `skill(name: "tdd")` — TDD 方法论（红绿重构循环、测试质量标准、mock 纪律）
2. `skill(name: "diagnose")` — 系统性诊断流程（遇到意外错误时使用）
3. `skill(name: "zoom-out")` — 不熟悉代码区域时上探抽象层次

**这是强制步骤，不可跳过。** 未加载技能前不得执行任何其他操作。
```
