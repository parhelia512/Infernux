---
category: 手册
tags: ["API", "版本", "兼容性", "Agent"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "解释 API 快照不可变性、机器可读版本比较、当前 0.2.1 基线限制，以及如何理解新增、移除或改变的符号。"
source_paths: ["docs/tools/build-api-diff.mjs", "docs/api-snapshots", "docs/api-changes.json", "docs/api-index.json"]
---

# API 版本与兼容性

生成的 API 索引描述一个已记录引擎版本。紧凑且不可变的快照保存英文符号键、类型、签名、状态与 canonical URL；下一版本与最近的更早快照比较。

## 当前基线

`0.2.1` 是第一个权威快照。仓库中没有更早的机器可读 API 基线，因此当前比较会正确报告 `comparison_available: false`，不会根据文件日期或提交噪声猜测历史。

- [当前 API 索引](https://infernux-engine.com/api-index.json)
- [机器可读 API 变更](https://infernux-engine.com/api-changes.json)

## 理解未来比较

| 变化 | 含义 | 迁移响应 |
|---|---|---|
| Added | 出现新的符号键 | 可选采用；检查状态与 `since` |
| Removed | 旧符号键不再存在 | 升级前寻找替代能力 |
| Changed | 类型、签名、状态或 `since` 不同 | 检查变化字段与精确 API 页面 |

变更记录只能证明结构 API 差异，不是完整行为兼容性承诺。迁移前还应阅读 Release Notes 和受影响的 Manual/Learn。

## 发布规则

已经发布版本的快照不能静默移动。当当前 API 与已记录快照不同时，CI 会失败。维护者必须恢复该版本 API、提升文档版本，或显式记录新的发布基线。

Agent 在建议代码前应把已安装引擎版本与 `generated_for_release` 比较。没有可用比较时，应明确说明，而不是虚构兼容性。

