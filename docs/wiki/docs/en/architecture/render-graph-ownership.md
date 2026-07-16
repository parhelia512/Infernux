---
title: "Render Graph Ownership"
description: "Explains the rendering authority split: Python defines RenderGraph topology and RenderStack composition while C++ validates, compiles, allocates resources, inserts Vulkan barriers, and executes passes."
category: Architecture
tags: ["rendering", "rendergraph", "vulkan", "python", "resources"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["advanced-user", "graphics-contributor", "agent"]
related_api: []
agent_summary: "Explains the rendering authority split: Python defines RenderGraph topology and RenderStack composition while C++ validates, compiles, allocates resources, inserts Vulkan barriers, and executes passes."
source_paths: ["python/Infernux/rendergraph/graph.py", "python/Infernux/renderstack/render_pipeline.py", "python/Infernux/renderstack/render_stack_pipeline.py", "cpp/infernux/tools/pybinding/BindingRenderGraph.cpp", "cpp/infernux/function/renderer/SceneRenderGraph.h", "cpp/infernux/function/renderer/vk/RenderGraph.h", "cpp/infernux/function/renderer/vk/RenderGraphCompile.cpp"]
---

# Render Graph Ownership

Infernux rendering uses an explicit authority split: **Python defines what the frame should contain; C++ decides how that description becomes safe Vulkan work**. This makes render pipelines scriptable without moving resource lifetime, synchronization, or command recording into Python.

## End-to-end flow

```text
RenderPipeline / RenderStack (Python)
  → RenderGraph builder
    → RenderGraphDescription (bound POD)
      → SceneRenderGraph::ApplyPythonGraph
        → vk::RenderGraph::Compile
          → allocate + cull + order + barriers
            → vk::RenderGraph::Execute
```

The Python builder records texture declarations, pass reads and writes, clear operations, draw actions, queue filters, shader inputs, and the final output. `build()` converts that state into native `GraphTextureDesc`, `GraphPassDesc`, and `RenderGraphDescription` values exposed by `BindingRenderGraph.cpp`.

`SceneRenderGraph` stores the description and translates the declared actions into native pass callbacks. The lower-level `vk::RenderGraph` remains responsible for dead-pass culling, resource lifetime analysis, topological ordering, transient allocation, render-pass/framebuffer creation, precomputed execution data, and Vulkan image barriers.

## Why the description is data, not callbacks

The public builder exposes a closed set of actions such as drawing renderers, drawing shadow casters, drawing screen UI, and executing a fullscreen shader. Python does not record arbitrary Vulkan commands inside each pass. This has several consequences:

- the native compiler can see complete read/write dependencies;
- transient resources can be managed without Python object lifetime leaks;
- command recording stays on the native hot path;
- unsupported action types fail at a defined translation boundary;
- a graph can be inspected and rebuilt from a stable description.

The `CUSTOM` action is reserved; its existence should not be read as a shipped arbitrary Python callback facility.

## RenderPipeline, RenderStack, and RenderGraph

These names describe different responsibilities:

| Layer | Responsibility |
| --- | --- |
| `RenderPipeline` | Defines the base topology for a camera and controls camera-level policy |
| `RenderStack` | Selects a pipeline and composes injected render passes/effects |
| `RenderGraph` builder | Records one concrete graph description |
| `SceneRenderGraph` | Bridges the description into scene draw callbacks and render targets |
| `vk::RenderGraph` | Compiles resources and dependencies, then records executable Vulkan work |

`RenderStackPipeline` is the engine entry-point bridge. For each camera it locates the active scene RenderStack and delegates to it; when none exists, it builds and caches a default forward fallback. The C++ engine only needs the standard render-pipeline callback interface and does not need RenderStack-specific knowledge.

## Compile time versus frame time

Topology changes mark the scene graph dirty. `EnsureGraphBuilt()` performs rebuild and compilation before command recording. A normal frame then applies camera state, submits culling results, updates values that do not alter render-pass compatibility, and executes the compiled graph.

This distinction protects both correctness and performance:

- changing pass connections, attachment formats, target size, or load behavior may require rebuild/compile;
- changing a clear color value can update cached execution data without rebuilding the topology;
- scene switches clear cross-frame draw-call and image-handle state before another graph can execute;
- the compiled execution order excludes passes culled as irrelevant to the selected output.

## Resource truth

Every graph texture has a name and usage history. A pass must declare reads and writes through the builder; hidden resource access would make synchronization incorrect. The compiler uses those declarations to compute lifetimes and translate usage into Vulkan layouts, access masks, and pipeline stages.

There are two resource families:

- **Imported resources** already exist outside the graph, such as the scene target. Their real initial and final states must stay aligned with external transitions.
- **Transient resources** are registered for the graph and allocated during compilation. Their useful lifetime is derived from pass usage, enabling reuse or aliasing when lifetimes do not overlap.

Names are authoring identifiers, but the native layer resolves them to typed handles before execution. The final output is also explicit; dead-pass culling walks backward from that output.

## Failure and debugging boundaries

When a graph is wrong, classify the problem before editing:

1. **Description error** — duplicate/missing texture names, invalid output, wrong pass action, or undeclared dependency. Start in Python topology code.
2. **Translation error** — the description is valid but mapped incorrectly to scene callbacks or attachments. Start in `SceneRenderGraph` and its binding types.
3. **Compile error** — ordering, lifetime, render-pass compatibility, or allocation fails. Start in `vk::RenderGraph::Compile` and `RenderGraphCompile.cpp`.
4. **Execution error** — barriers, external layout state, descriptor state, or draw callbacks are wrong. Inspect compiled pass order and Vulkan validation output.

Use `RenderGraph.get_debug_string()` before crossing into C++. At runtime, `SceneRenderGraph.get_debug_string()`, pass count, executed pass names, and transient resident bytes help determine whether the expected topology was accepted, compiled, and executed.

## Extension rule

When adding a render feature, prefer extending the declarative vocabulary over adding opaque Python-side command recording. A complete feature usually touches the Python builder or RenderStack pass, the bound description type, the native translation callback, and tests for dependency/resource behavior. If only the composition changes and existing actions are sufficient, the work can remain entirely in Python.

This page describes the repository state verified on 2026-07-15. Exact public types and methods remain governed by the generated API reference.
