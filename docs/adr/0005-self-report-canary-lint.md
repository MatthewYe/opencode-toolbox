# Self-report JSON + Canary 探针用于插件安装自检

`/toolbox-lint` 命令需要验证插件在 OpenCode 中的实际加载状态，而不仅仅检查文件系统。由于 OpenCode 不暴露运行时配置给 agent 直接读取，我们采用双重数据源策略：插件在 `config` hook 中将注入清单写入 `.opencode/.toolbox-lint-report.json`（自我报告），同时注入无副作用 canary skill 和 command 用于运行时探针验证。

**Considered Options**:
- **纯文件系统检查**：被拒，因为无法验证 OpenCode 是否实际加载了配置（如 skill 路径是否生效、command 是否注册）
- **仅自我报告**：被拒，因为无法区分"报告写了"和"注册实际生效"（可能报告存在但 OpenCode 未正确消费）
- **仅 Canary**：被拒，因为无法覆盖文件级检查（如 dist/ 缺失、principles 未包含）

**Consequences**:
- 插件增加一次性文件 I/O 开销（每启动覆盖写入 ~2KB JSON）
- 需维护两份 canary 文件（`skills/_toolbox-canary/SKILL.md`、`commands/_toolbox-canary.md`）
- 新增 `/toolbox-lint` 命令依赖此基础设施
