---

## Phase 2: 全局 Meta-Review

当所有 issue 处理完毕（无 ready-for-agent 剩余），执行全局审查。

### 目的

对照 ADR、PRD 和所有 issue 合约，审视整个 codebase 的：
- 实现正确性（所有模块是否符合各自的 AC 和 PRD 全局约束）
- 跨模块一致性（是否有模式漂移、重复实现、约定不一致）
- 计划外变更（是否有孤儿文件、未声明依赖、残留引用）

### 执行方式

Orchestrator 自主审查与 reviewer 子 agent **并行**执行。两者均产出独立报告后，进入「报告合并」统一处理。

#### 1. 派遣 reviewer 子 agent（并行）

Dispatch `reviewer` agent（只读，无 edit/bash 权限）。**prompt 必须以 skill 加载指令开头（强制，不可省略）**：

```
**在开始任何操作之前，必须使用 `skill` 工具加载以下技能：**
1. `skill(name: "tdd")` — 测试质量标准和 mock 纪律

**这是强制步骤，不可跳过。** 未加载技能前不得执行任何文件读取或审查操作。

---

你正在执行全局 meta-review。审查范围为整个 codebase，对照以下基准：

**审查基准（读取以下全文）：**
- 所有 ADR（docs/adr/）
- 所有 PRD（如有）
- 所有已 resolved issue 的合约（AGENT-BRIEF.md 或 GitHub issue body 中的 AC）

**审查维度（适配 reviewer 四维框架到全局 meta-review 上下文）：**

1. **ADR/PRD 全局约束验证**（维度四：计划忠实度）：
   - 逐条检查 ADR 和 PRD 中声明的全局约束（输出格式要求、依赖白名单、运行时约束、目录结构约定等）是否在所有模块中满足
   - 是否存在约束降级（如 PRD 要求 byte-identical 但实现仅做到结构等价）
   - 依赖白名单是否被超出

2. **跨模块一致性**（维度三代码质量 + 维度四工程约定）：
   - 入口检测方式、import 风格（静态/动态）、错误处理模式、日志格式、算法选择、文件布局是否一致
   - 是否存在模式漂移（不同模块用不同方式解决同一问题）
   - 是否有重复实现

3. **计划外变更检测**（维度四：孤儿文件、未声明行为）：
   - 是否存在孤儿文件：不在任何合约中声明的新文件
   - 合约要求删除但尚未删除的文件
   - 合约未声明的新行为（悄悄加的 UX 优化、额外校验、额外日志）
   - 未在合约中声明的副作用（自动创建目录、修改全局配置、静默改写其他模块文件）

4. **AC 覆盖率**（维度一：行为对齐的全局化）：
   - 对照所有 resolved issue 合约，逐条检查 AC 是否有对应实现

输出格式与标准 reviewer 一致：以 `REVIEWER_REPORT:` 开头，分 Critical / Important / Suggestion 三级 + VERDICT（MERGE / RETRY / BLOCKED）。
```

#### 2. Orchestrator 自主审查（并行）

Orchestrator 自身用 grep/glob 工具执行审查，覆盖与 reviewer 子 agent 相同的范围：

1. 读取 PRD 全文和所有相关 ADR（包含 ADR 0003、ADR 0004 等），列出每条全局约束
2. 逐条检查：用 grep/glob 扫描 codebase，验证约束满足
3. 对照 issue 合约，检查每个 resolved issue 的 AC 覆盖率
4. 检查跨模块一致性（入口检测方式、import 风格、错误处理、日志格式、算法选择、文件布局）
5. 检查计划外变更（孤儿文件、未声明新行为、副作用、未删除文件）
6. 输出结构化报告：Critical / Important / Suggestion + VERDICT

#### 3. 等待两份报告

上述 1、2 两步并行执行。两者均完成后（均产出独立报告），进入下方「报告合并」流程。

### 报告合并

`执行方式` 产生两份独立的 meta-review 报告：
- **orchestrator 自主审查报告** — 对照 ADR、PRD 和 issue 合约逐条检查
- **reviewer 子 agent 并行审查报告** — 4 轴审查（Behavior alignment、TDD discipline、Code quality、Plan fidelity）

进入修复循环前，将两份报告合并为一份 `MERGED_META_REPORT`：

1. **Union 策略**：两份报告中 Critical 和 Important 级别的问题取其并集——任一份报告标记的问题均纳入修复范围。Suggestion 级别条目同样取并集（去重后）。

2. **冲突裁决**：当两份报告对同一文件/路径有不同结论时（如一方标记为问题，另一方认为正常），orchestrator 手动核实并裁定：
   - **默认采纳更严格结论**：无法确认是否为误报时，默认采纳更严格的发现（标记为问题）。
   - **确认误报后降级**：仅当 orchestrator 明确确认某发现为误报（false positive）时，方可将该条目从修复范围移除或降级为 Suggestion。
   - 裁决过程记录到合并报告中，注明"冲突裁决：\<路径\> — 采纳 \<来源\> 的结论"

3. **去重**：完全相同的发现（同一文件 + 同一问题模式）在两份报告中均出现时，合并为单一条目，标注"双来源一致：<发现描述>"。

合并后产出 `MERGED_META_REPORT`，包含：
- Critical 条目（合并去重后）
- Important 条目（合并去重后）
- Suggestion 条目（合并去重后）
- 冲突裁决记录

### 修复循环

从合并报告（`MERGED_META_REPORT`）中取 Critical + Important 条目，由 **orchestrator 直接修复**（不 dispatch implementer），因为 meta 问题通常是机械性的：

- **统一模式**：isMain 不一致 → 直接 edit 文件统一为一种模式
- **删除残留**：孤儿文件 / __pycache__ / 残留引用 → 直接 delete/edit
- **更新文档**：SKILL.md / schemas.md / ADR 引用 → 直接 edit

遇到需要判断的设计级问题（如"两种算法选哪个"），追加 comment 标记为 needs-info。

### 修复后验证

修复完成后：
1. 运行 `bun test` 确认测试全绿
2. 重新执行 meta-review，确认 0 Critical + 0 Important
3. 最多 **2 轮**修复循环。2 轮后仍有问题 → 报告残余问题，标记 needs-info

### 完成后

向用户报告 Phase 1 和 Phase 2 的完整结果：处理了多少 issue、总轮次、最终状态、meta-review 发现和修复了哪些问题。
