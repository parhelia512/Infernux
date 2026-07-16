---
title: "RenderGraph 的职责与所有权"
description: "解释渲染权威的拆分：Python 定义 RenderGraph 拓扑与 RenderStack 组合，C++ 负责验证、编译、资源分配、Vulkan 屏障插入和执行。"
category: 架构
tags: ["渲染", "rendergraph", "vulkan", "python", "资源"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["advanced-user", "graphics-contributor", "agent"]
related_api: []
agent_summary: "解释渲染权威的拆分：Python 定义 RenderGraph 拓扑与 RenderStack 组合，C++ 负责验证、编译、资源分配、Vulkan 屏障插入和执行。"
source_paths: ["python/Infernux/rendergraph/graph.py", "python/Infernux/renderstack/render_pipeline.py", "python/Infernux/renderstack/render_stack_pipeline.py", "cpp/infernux/tools/pybinding/BindingRenderGraph.cpp", "cpp/infernux/function/renderer/SceneRenderGraph.h", "cpp/infernux/function/renderer/vk/RenderGraph.h", "cpp/infernux/function/renderer/vk/RenderGraphCompile.cpp"]
---

# RenderGraph 的职责与所有权

Infernux 的渲染采用一条明确的权威分界：**Python 定义一帧应该包含什么，C++ 决定如何把描述变成安全的 Vulkan 工作**。这样既能用脚本组合渲染管线，又不会把资源生命周期、同步和命令录制搬进 Python。

## 端到端流程

```text
RenderPipeline / RenderStack（Python）
  → RenderGraph builder
    → RenderGraphDescription（绑定的 POD）
      → SceneRenderGraph::ApplyPythonGraph
        → vk::RenderGraph::Compile
          → 分配 + 裁剪 + 排序 + 屏障
            → vk::RenderGraph::Execute
```

Python builder 记录纹理声明、Pass 读写、清除操作、绘制动作、渲染队列过滤、Shader 输入和最终输出。`build()` 会把这些状态转换成由 `BindingRenderGraph.cpp` 暴露的原生 `GraphTextureDesc`、`GraphPassDesc` 与 `RenderGraphDescription`。

`SceneRenderGraph` 保存描述，并把声明的动作翻译为原生 Pass 回调。更底层的 `vk::RenderGraph` 继续掌握无用 Pass 裁剪、资源生命周期分析、拓扑排序、瞬态资源分配、RenderPass/Framebuffer 创建、执行数据预计算和 Vulkan 图像屏障。

## 为什么传递的是数据而不是任意回调

公共 builder 暴露一组封闭动作，例如绘制 Renderer、绘制阴影投射者、绘制屏幕 UI 和执行全屏 Shader。Python 不会在每个 Pass 里录制任意 Vulkan 命令。这带来几个直接结果：

- 原生编译器能看见完整读写依赖；
- 瞬态资源不会被 Python 对象生命周期泄漏；
- 命令录制保留在原生热路径；
- 不支持的动作会在明确的翻译边界失败；
- 图可以从稳定描述中检查并重建。

`CUSTOM` 动作目前是保留项，不能把它理解为已经提供任意 Python 回调能力。

## RenderPipeline、RenderStack 与 RenderGraph

这些名称分别承担不同责任：

| 层 | 责任 |
| --- | --- |
| `RenderPipeline` | 定义相机的基础拓扑和相机级策略 |
| `RenderStack` | 选择 Pipeline，并组合注入的 Pass / Effect |
| `RenderGraph` builder | 记录一次具体图描述 |
| `SceneRenderGraph` | 把描述桥接到场景绘制回调与渲染目标 |
| `vk::RenderGraph` | 编译资源和依赖，并录制可执行 Vulkan 工作 |

`RenderStackPipeline` 是引擎入口桥。它为每个相机查找场景中的活动 RenderStack 并委托执行；没有 RenderStack 时，会构建并缓存默认 Forward 回退。C++ 引擎只需要标准 RenderPipeline 回调接口，不需要了解 RenderStack 的专有概念。

## 编译阶段与逐帧阶段

拓扑变化会把场景图标为 dirty。`EnsureGraphBuilt()` 在命令录制开始前完成重建与编译。普通帧则应用相机状态、提交裁剪结果、更新不改变 RenderPass 兼容性的值，再执行已编译图。

这种区分同时保护正确性与性能：

- Pass 连接、附件格式、目标尺寸或 load 行为变化可能要求重新构建和编译；
- 只改变 clear color 的数值可以更新缓存执行数据，不必重建拓扑；
- 场景切换会先清理跨帧 DrawCall 与图像句柄状态，避免旧图再次执行；
- 已编译执行顺序不会包含与最终输出无关、已被裁掉的 Pass。

## 资源真相

每个图纹理都有名称和使用历史。Pass 必须通过 builder 声明读写；隐藏的资源访问会让同步推导失真。编译器依据这些声明计算生命周期，并把用法转换成 Vulkan layout、access mask 与 pipeline stage。

资源分为两类：

- **导入资源**已经存在于图外，例如场景目标。它们的真实初始/最终状态必须与外部 transition 保持一致。
- **瞬态资源**为图注册并在编译时分配。有效寿命由 Pass 使用区间推导，互不重叠时可复用或做内存 alias。

名称是创作标识，原生层会在执行前把它们解析成类型化 Handle。最终输出同样是显式的，无用 Pass 裁剪会从这个输出反向遍历。

## 故障与调试边界

图出现问题时，先分类再改代码：

1. **描述错误**：纹理名缺失/重复、输出错误、动作错误或依赖漏声明。从 Python 拓扑开始。
2. **翻译错误**：描述有效，但映射到场景回调或附件时出错。从 `SceneRenderGraph` 与绑定类型开始。
3. **编译错误**：排序、生命周期、RenderPass 兼容性或分配失败。从 `vk::RenderGraph::Compile` 和 `RenderGraphCompile.cpp` 开始。
4. **执行错误**：屏障、外部 layout、descriptor 或绘制回调错误。检查已编译 Pass 顺序和 Vulkan Validation 输出。

跨入 C++ 前先使用 `RenderGraph.get_debug_string()`。运行时再用 `SceneRenderGraph.get_debug_string()`、Pass 数量、已执行 Pass 名称与瞬态资源常驻字节数，确认预期拓扑是否被接受、编译并真正执行。

## 扩展规则

新增渲染功能时，优先扩展声明式词汇，而不是增加不透明的 Python 命令录制。一个完整功能通常涉及 Python builder 或 RenderStack Pass、绑定描述类型、原生翻译回调，以及依赖/资源行为测试。如果只是改变组合且现有动作足够，工作可以完全留在 Python。

本页描述的是 2026-07-15 验证过的仓库状态。精确公共类型与方法仍以生成 API 为准。
