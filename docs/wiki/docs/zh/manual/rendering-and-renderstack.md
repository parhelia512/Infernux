---
title: "渲染与 RenderStack"
description: "解释场景 RenderStack 单例、前向/延迟管线、注入点、Pass 顺序、Graph 失效、后处理效果与安全扩展边界。"
category: 手册
tags: ["渲染", "RenderStack", "管线", "RenderGraph", "后处理"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: ["Infernux.renderstack.RenderStack","Infernux.renderstack.RenderPipeline","Infernux.rendergraph.RenderGraph","Infernux.renderstack.BloomEffect","Infernux.renderstack.ToneMappingEffect","Infernux.core.Material"]
agent_summary: "解释场景 RenderStack 单例、前向/延迟管线、注入点、Pass 顺序、Graph 失效、后处理效果与安全扩展边界。"
source_paths: ["python/Infernux/renderstack", "python/Infernux/rendergraph", "python/Infernux/core/material.py"]
---

# 渲染与 RenderStack

Infernux 将“渲染什么”与“一帧如何调度”分离。Camera、可渲染组件、灯光与材质描述场景内容；场景级 `RenderStack` 选择管线、构建 RenderGraph 拓扑，并把可选 Pass 挂载到声明的注入点。

## 一个 Stack，一条管线

`RenderStack` 是场景单例组件；存在活动实例时，`RenderStack.instance()` 会返回它。序列化状态记录管线类、挂载 Pass 和管线参数。

内置选择面向不同约束：

| 管线 | 结构 | 主要设置 |
|---|---|---|
| Default Forward | 阴影 → 不透明 → 天空 → 透明 | 阴影分辨率、MSAA、屏幕 UI |
| Default Deferred | G-buffer / 延迟光照拓扑 | 阴影分辨率、屏幕 UI；延迟 MSAA 关闭 |

应根据光照、材质、透明和抗锯齿需求为整个场景选择管线，不要每帧切换。

```text
[INX-DIAGRAM:pipeline:场景数据经 RenderStack 生成最终帧]
场景内容             RenderStack               RenderGraph                 最终帧
Camera ────────┐     ┌ 选择管线       ┐       ┌ 稳定拓扑       ┐
灯光 ──────────┼───▶ │ 挂载 Pass      │ ───▶  │ 资源依赖       │ ───▶  屏幕目标
材质 ──────────┤     └ 注入与排序     ┘       └ 执行 Pass      ┘
可渲染对象 ────┘             ▲
                             └── 配置改变 → invalidate → rebuild
```

## 注入点与效果

管线公开具名 `InjectionPoint`。默认前向管线提供 `after_opaque`、`after_sky`、`after_transparent`。Pass 声明其位置，以及需要或修改的资源。

`RenderStack.add_pass()` 挂载 Pass；启用、移除、重排和 move-before 操作控制执行。Stack 会序列化这些配置，因此应使用这些操作或 Inspector，不要直接编辑 `mounted_passes_json`。

内置全屏效果包括 Bloom、Tone Mapping、Color Adjustments、White Balance、Vignette、Film Grain、Sharpen 与 Chromatic Aberration。顺序有语义：Tone Mapping 与依赖颜色空间的效果不能随意互换。

## Graph 生命周期

管线定义稳定拓扑，可选 Pass 对其扩展。配置改变时，`invalidate_graph()` 标记 Graph 为脏；`build_graph()` 在渲染前重建。不要在逐帧玩法循环中反复失效。

自定义管线应覆盖 `define_topology(graph)`；自定义全屏效果应声明资源契约并实现 `setup_passes(graph, bus)`，不要直接获取其他 Pass 的私有对象。

```python
from Infernux.renderstack import BloomEffect, RenderStack

stack = RenderStack.instance()
if stack is not None:
    bloom = BloomEffect()
    bloom.threshold = 1.0
    bloom.intensity = 0.7
    stack.add_pass(bloom)
```

应在场景初始化阶段配置挂载，而不是在 `update` 中持续执行。

## 材质与透明

材质决定 Shader、属性、纹理、表面类型、Alpha 裁剪、深度、混合、剔除与渲染队列。默认使用不透明表面；透明混合具有排序和 overdraw 成本。可接受硬边时用 Alpha Clip 表现镂空形状。

材质属性只有在 Shader 暴露对应名称时才生效。编写通用工具时可先检查 `has_property()`。

## 排查顺序

1. 确认场景只有一个活动 RenderStack，且管线可被发现。
2. 确认活动 Camera 符合管线渲染条件。
3. 检查材质、Shader、网格与纹理引用是否可解析。
4. 检查 Pass 已启用且位于兼容注入点。
5. 检查所需 ResourceBus 名称与 Pass 顺序。
6. 配置改变后使 Graph 失效，但不要每帧执行。
7. 逐一关闭可选效果，隔离第一个失败 Pass。

## 相关参考

- [RenderStack](../api/RenderStack.md)
- [RenderPipeline](../api/RenderPipeline.md)
- [RenderGraph](../api/RenderGraph.md)
- [BloomEffect](../api/BloomEffect.md)
- [ToneMappingEffect](../api/ToneMappingEffect.md)
- [Material](../api/Material.md)
