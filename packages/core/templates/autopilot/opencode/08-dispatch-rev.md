用 `task` 工具 dispatch `reviewer` agent（`subagent_type: "reviewer"`）。**prompt 必须以 skill 加载指令开头（强制，不可省略）**：

```
**在开始任何操作之前，必须使用 `skill` 工具加载以下技能：**
1. `skill(name: "tdd")` — 测试质量标准和 mock 纪律（用于 TDD 审查维度）

**这是强制步骤，不可跳过。** 未加载技能前不得执行任何其他操作。

---

<以下为任务描述>
```
