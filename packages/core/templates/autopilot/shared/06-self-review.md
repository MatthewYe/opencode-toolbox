### 首次实现：检查 SELF_REVIEW

retry_count = 0 时，检查报告中有无 `SELF_REVIEW:` 段：

- STATUS: DONE → "无问题" 或 "发现问题 → 已修复" → 通过
- STATUS: UNVERIFIED → 必须包含每条 AC 的验证方式标注（测试运行 / 代码结构分析）。**标注缺失但 STATUS: UNVERIFIED → 通过**（UNVERIFIED 本身已声明验证不全）
- STATUS: DONE 或 UNVERIFIED 但缺失 SELF_REVIEW 段 → 标记为 `needs-info`，停止

Retry 轮次（retry_count >= 1）不检查 SELF_REVIEW。
