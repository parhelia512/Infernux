---
title: "原生层与 Python 的边界"
description: "梳理 C++ 运行时、pybind11 模块、Python 公共 API 与 PyComponentProxy 生命周期桥之间的职责，并说明对象身份、生命周期和序列化规则。"
category: 架构
tags: ["cpp", "python", "pybind11", "组件", "生命周期"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["advanced-user", "contributor", "agent"]
related_api: []
agent_summary: "梳理 C++ 运行时、pybind11 模块、Python 公共 API 与 PyComponentProxy 生命周期桥之间的职责，并说明对象身份、生命周期和序列化规则。"
source_paths: ["cpp/infernux/tools/pybinding/BindingInfernux.cpp", "cpp/infernux/tools/pybinding/BindingScene.cpp", "cpp/infernux/function/scene/PyComponentProxy.cpp", "python/Infernux/__init__.py", "python/Infernux/lib/__init__.py", "python/Infernux/components/component.py", "python/Infernux/components/registry.py"]
---

# 原生层与 Python 的边界

Infernux 的创作层以 Python 为中心，但它并不是纯 Python 引擎。运行时刻意把职责拆给 C++ 执行核心与 Python 编排、玩法层。理解这条边界，可以快速回答三个常见问题：一个功能应写在哪里、谁拥有对象生命周期、某个调用是否适合放进逐帧热循环。

## 四层结构

```text
游戏脚本 / 编辑器工具
        │ 公共导入与 Unity 风格包装
        ▼
Infernux Python 包
        │ Infernux.lib 重新导出原生符号
        ▼
_Infernux pybind11 扩展
        │ 非拥有型句柄、值转换、回调转发
        ▼
C++ 运行时：场景、渲染、物理、音频、资产
```

原生扩展由 `BindingInfernux.cpp` 中的 `PYBIND11_MODULE(_Infernux, m)` 创建，再依次注册场景、资源、RenderGraph、输入、物理、音频和批处理等绑定组。它是底层“能力面”，并不是建议用户直接依赖的命名空间。

`Infernux.lib` 暴露绑定类型；顶层 `Infernux` 包及其子包在此之上提供稳定导入、Python 风格包装、编辑器行为、玩法组件和兼容路由。用户代码通常应从文档所列公共模块导入，而不是直接依赖 `_Infernux`。

## 所有权规则

最重要的区别是**生命周期权威**与**Python 中仍可访问**并不是一回事。

| 对象家族 | 生命周期权威 | Python 侧看到的对象 |
| --- | --- | --- |
| Engine 与管理器 | C++ 单例或引擎实例 | 非拥有型门面或绑定实例 |
| Scene 与 GameObject | C++ 场景图 | 句柄和绑定方法 |
| 内置组件 | C++ GameObject | 原生组件门面，部分会再包装成统一 API |
| 脚本组件 | C++ `PyComponentProxy` 加 Python `InxComponent` 镜像 | 用户继承的玩法对象 |
| 纯 Python 创作数据 | Python | Builder、注册表、编辑器编排 |

保留 Python 引用不一定能延长原生对象寿命。切换场景或销毁对象会使原生句柄失效。公共包装层会通过当前 GameObject 重新解析组件，并把原生生命周期异常视为“引用已失效”，而不是复活对象的许可。

## Python 组件如何进入引擎

玩法组件继承 `InxComponent`。在实例产生前，类创建阶段就会完成若干工作：

1. `__init_subclass__` 发现可序列化字段并建立稳定类型身份。
2. 数值字段注册到原生 `ComponentDataStore` 桥。
3. 组件类通过 Python 注册表与脚本加载路径变得可发现。
4. 组件挂到 GameObject 时，原生场景创建持有该 Python 对象的 `PyComponentProxy`。

真正的生命周期权威是 Proxy。它把 Python 镜像绑定到原生 Component 与 GameObject，同步 enabled、started、destroyed 等状态，在转发生命周期回调时获取 GIL，并调用 `_call_awake`、`_call_update`、`_call_on_destroy` 以及物理回调入口。

```text
C++ 场景 tick
  → PyComponentProxy::Update(deltaTime)
    → 获取 GIL
      → Python InxComponent._call_update(deltaTime)
        → 用户 update(delta_time)
```

Proxy 会检查 `update`、`fixed_update`、`late_update` 是否真的被覆写。如果没有覆写且没有协程调度器需要该阶段，它可以跳过转发。这能消除空回调，但大量活跃 Python 回调仍意味着大量边界穿越。

## 身份与序列化

Python 脚本组件的身份不只是一段类名：

- `type_guid` 标识模块与限定类类型；
- `script_guid` 标识用于恢复组件的脚本资产；
- `component_id` 标识当前挂载的组件实例；
- `py_fields` 保存可序列化字段文档。

`PyComponentProxy::SerializeDocument` 会拒绝序列化缺少稳定脚本 GUID 或类型 GUID 的 Python 组件。加载时，C++ 先恢复原生场景结构和待处理组件记录，再由 Python 解析脚本类型并重建字段。因此移动或重命名脚本首先是资产身份问题，而不只是 Python import 问题。

## 边界成本模型

每次 Python/原生属性访问都是真实操作：包含分派、可能的类型转换，并且经常涉及 GIL。实践规则如下：

- 普通玩法与编辑器交互可以直接使用对象 API；
- 大型内层循环避免逐对象反复 getter/setter；
- 数据并行工作使用批处理 API 与连续数组；
- 资源分配、Vulkan 同步、场景所有权和物理所有权留在原生子系统；
- 声明式拓扑、工具、玩法策略和高层组合优先留在 Python，除非性能数据证明需要下沉。

JIT 架构页会继续解释批处理路径。只有先合并边界流量，JIT 才能有效加速其中的计算。

## 贡献者路由

改行为时，先从真正的所有者开始：

| 变更 | 起点 |
| --- | --- |
| 新增或暴露原生能力 | 对应 `Binding*.cpp`，再补公共 Python 导出与类型存根 |
| 修改组件生命周期语义 | 同时检查 C++ `Component` / `PyComponentProxy` 和 Python 生命周期 mixin |
| 新增 Inspector 字段类型 | 字段元数据、codec、Inspector 渲染；数值类型还要检查原生 CDS |
| 新增友好的玩法 API | 优先 Python 包装；只有底层能力缺失时才增加绑定 |
| 优化大量对象计算 | 先检查批处理桥与数据布局，再考虑 JIT kernel |

不要因为某个符号存在于 `_Infernux` 就推断它是稳定公共 API。当前发布版的公共契约应以生成 API 页及其版本元数据为准。

## 验证说明

本页描述的是 2026-07-15 验证过的仓库状态，并不承诺 `_Infernux` 中所有绑定符号均稳定。精确签名请查阅生成 API；高吞吐脚本路径请继续阅读 [JIT 加速脚本系统](jit.md)。
