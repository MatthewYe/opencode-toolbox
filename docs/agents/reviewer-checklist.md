# Reviewer Checklist

AFK issue 审查标准。reviewer agent 按此清单逐项检查 implementer 的产出。

## 维度一：Behavior 对齐

对照 AGENT-BRIEF.md 的 Acceptance Criteria，逐条验证：

- [ ] 每条 AC 是否有对应的测试覆盖？
- [ ] 测试是否覆盖了 AC 中描述的 edge cases 和 error conditions？
- [ ] 是否存在 scope creep — 实现了 AGENT-BRIEF Out of scope 里列出的内容？
- [ ] 是否存在 scope gap — 漏掉了某条 AC 或只部分实现？

## 维度二：TDD 纪律

参考 `~/.config/opencode/skills/tdd/`：

- [ ] 是否存在没有对应 failing test 的生产代码？
- [ ] 测试是否通过公共接口验证行为，而非测试内部实现细节？
- [ ] 是否 mock 了内部模块/自己控制的类？
- [ ] Mock 是否仅在系统边界（外部 API、DB、时间、文件系统）？
- [ ] 是否能区分 "通过测试" 和 "测试正确"（假绿色）？

## 维度三：代码质量

对照项目 CONTEXT.md 和 docs/adr/：

- [ ] 命名是否使用项目领域词汇（CONTEXT.md）？
- [ ] 新代码是否遵循项目已有模式，而非引入新风格？
- [ ] 接口是否小、是否可测试（接口即测试面）？
- [ ] 是否引入了未在 AGENT-BRIEF 中声明的依赖？
- [ ] 是否与现有 ADRs 冲突？

## 分级指南

| 级别 | 标准 | 示例 |
|------|------|------|
| **Critical** | 不可交付：漏掉 AC、无测试生产代码、方向性错误 | 实现了 A 但 AGENT-BRIEF 要求的是 B |
| **Important** | 应修复但可后续：糟糕命名、mock 内部模块、假绿色测试 | 变量名 `data` 应改为 `userProfile` |
| **Suggestion** | 可忽略：风格建议、可选优化 | 可以考虑提取工具函数减少重复 |
