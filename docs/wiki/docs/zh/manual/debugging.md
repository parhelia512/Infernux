---
title: "调试与 Console"
description: "使用 Console、Debug 日志、生命周期检查、最小复现与 GitHub Issue 证据进行可重复的 Infernux 调试。"
category: 手册
tags: ["调试", "console", "日志", "故障排查"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: ["Infernux.debug.Debug","Infernux.components.InxComponent"]
agent_summary: "使用 Console、Debug 日志、生命周期检查、最小复现与 GitHub Issue 证据进行可重复的 Infernux 调试。"
source_paths: ["python/Infernux/debug.py", "python/Infernux/engine/ui/console_utils.py", "python/Infernux/components/component.py"]
---

# 调试与 Console

把**第一原因**与它引发的后续错误分开，调试才会高效。Infernux 同时包含 Python 玩法、原生运行时、资源导入和编辑器状态，一个错误输入可能表现成多条下游故障。

## 第一错误原则

Console 中出现大量消息时：

1. 停止 Play；
2. 清空 Console；
3. 只复现一次；
4. 从最早的警告或错误开始；
5. 先修复或隔离它，再解释后续消息。

一次脚本导入失败可能导致组件无法发现，继而产生引用缺失，最后变成更新异常。直接从最后一条消息开始通常会浪费时间。

## 有目的地记录日志

需要进入引擎 Console 的信息使用 `Debug`：

```python
from Infernux import Debug, InxComponent


class Door(InxComponent):
    def start(self) -> None:
        Debug.log("Door initialized", self.game_object)

    def open(self) -> None:
        if not self.enabled:
            Debug.log_warning("Ignored open request while disabled", self.game_object)
            return
        Debug.log("Door opened", self.game_object)
```

- `Debug.log(...)`：记录预期里程碑或临时观察值。
- `Debug.log_warning(...)`：记录可恢复但值得怀疑的状态。
- `Debug.log_error(...)`：记录需要调查的失败操作。
- `Debug.log_exception(...)`：保留异常上下文。
- 把相关对象作为 context 传入，可让报告更容易追踪。

除非只抓取很短的调试片段，否则不要每帧输出日志。逐帧日志会淹没第一错误，并改变时序表现。

## 组件没有运行

按这个顺序检查：

1. **导入：** 脚本是否没有语法或 import 错误？
2. **发现：** 类是否继承 `InxComponent`，Inspector 能否添加它？
3. **所有权：** 是否真的挂在正在观察的 GameObject 上？
4. **激活：** 组件、GameObject 与父层级是否实际激活？
5. **签名：** `update` 是否接受 `(self, delta_time)`，`fixed_update` 是否接受 `(self, fixed_delta_time)`？
6. **Play 状态：** 是否正在测试只会在 Play 中运行的行为？
7. **提前返回：** 某个保护条件是否主动跳过了工作？

先在 `start()` 放一条日志，再在预期进入的分支放一条。确定失败的生命周期边界之前，不要到处堆日志。

## 引用与资源问题

组件或对象引用缺失时：

- 在初始化时只记录一次 owner 与请求类型；
- 确认对象存在于活动场景；
- 确认组件已挂载并启用；
- 不依赖重复名称；
- 场景切换后使旧引用失效，或重新获取。

资源在编辑器中正常、独立构建中缺失时：

- 确认资源位于项目内部；
- 确认引用使用项目相对路径，移动项目后仍成立；
- 构建到干净输出目录；
- 查看最早的复制、导入或加载错误；
- 测试完整打包目录，而不是被单独拿出的可执行文件。

## 缩小问题

有效的最小复现应包含：

- 一个已保存场景；
- 仍能触发失败的最少 GameObject 与组件；
- 没有无关资源或插件；
- 简短且确定的操作顺序；
- 引擎版本与平台；
- 预期结果和实际结果。

每次只移除一个依赖。如果问题消失，只恢复该依赖并确认问题重新出现。这样才能把“整个项目坏了”变成可测试的引擎或使用问题。

## 报告证据

不确定行为是否为缺陷时，使用 GitHub Discussions / Q&A。能够提供稳定复现时，使用 GitHub Issues。

一份可靠 Issue 包含：

```text
引擎版本：
操作系统：
项目类型 / 相关设置：

复现步骤：
1.
2.
3.

预期结果：
实际结果：
第一条相关 Console 错误：
最小项目或代码：
```

公开日志或项目之前，移除凭据、本地用户名、私有路径和专有资源。

## 相关参考

- [Debug](../api/Debug.md)
- [InxComponent](../api/InxComponent.md)
- [场景与对象](scenes-and-objects.md)
- [社区入口](https://infernux-engine.com/community.html)
