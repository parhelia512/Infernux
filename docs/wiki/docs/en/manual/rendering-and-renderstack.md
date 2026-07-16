---
title: "Rendering and RenderStack"
description: "Explain the scene RenderStack singleton, forward/deferred pipelines, injection points, pass ordering, graph invalidation, post-processing effects, and safe extension boundaries."
category: Manual
tags: ["rendering", "renderstack", "pipeline", "rendergraph", "post-processing"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: ["Infernux.renderstack.RenderStack","Infernux.renderstack.RenderPipeline","Infernux.rendergraph.RenderGraph","Infernux.renderstack.BloomEffect","Infernux.renderstack.ToneMappingEffect","Infernux.core.Material"]
agent_summary: "Explain the scene RenderStack singleton, forward/deferred pipelines, injection points, pass ordering, graph invalidation, post-processing effects, and safe extension boundaries."
source_paths: ["python/Infernux/renderstack", "python/Infernux/rendergraph", "python/Infernux/core/material.py"]
---

# Rendering and RenderStack

Infernux separates **what is rendered** from **how a frame is scheduled**. Cameras, renderable components, lights, and materials describe scene content. A scene-level `RenderStack` selects a pipeline, builds its RenderGraph topology, and mounts optional passes at declared injection points.

## One stack, one pipeline

`RenderStack` is a scene singleton component. `RenderStack.instance()` returns the active stack when one exists. Its serialized state records the pipeline class, mounted passes, and pipeline parameters.

The built-in choices serve different constraints:

| Pipeline | Shape | Notable settings |
|---|---|---|
| Default Forward | shadow → opaque → sky → transparent | shadow resolution, MSAA, screen UI |
| Default Deferred | G-buffer/deferred lighting topology | shadow resolution, screen UI; deferred MSAA is off |

Choose a pipeline for the whole scene based on lighting, material, transparency, and antialiasing needs. Do not switch pipelines every frame.

```text
[INX-DIAGRAM:pipeline:Scene data to final frame through RenderStack]
Scene content        RenderStack               RenderGraph                 Frame
Camera ────────┐     ┌ pipeline choice ┐       ┌ stable topology ┐
Lights ────────┼───▶ │ mounted passes  │ ───▶  │ resource edges  │ ───▶  screen target
Materials ─────┤     └ injection order ┘       └ pass execution  ┘
Renderables ───┘             ▲
                             └── configuration change → invalidate → rebuild
```

## Injection points and effects

Pipelines expose named `InjectionPoint` objects. In the default forward pipeline, the public points are `after_opaque`, `after_sky`, and `after_transparent`. A pass declares where it belongs and which resources it requires or modifies.

`RenderStack.add_pass()` mounts a pass, while enable, remove, reorder, and move-before operations control its execution. The stack serializes that configuration, so prefer these operations or the Inspector over editing `mounted_passes_json` directly.

Built-in full-screen effects include Bloom, Tone Mapping, Color Adjustments, White Balance, Vignette, Film Grain, Sharpen, and Chromatic Aberration. Order matters: tone mapping and color-space-sensitive effects are not generally interchangeable.

## Graph lifetime

The pipeline defines stable topology and optional passes extend it. When configuration changes, `invalidate_graph()` marks the graph dirty; `build_graph()` reconstructs it before rendering. Avoid invalidation in a per-frame gameplay loop.

Custom pipeline code should override `define_topology(graph)`. Custom full-screen effects should declare resource contracts and implement `setup_passes(graph, bus)` rather than manually reaching into another pass's private objects.

```python
from Infernux.renderstack import BloomEffect, RenderStack

stack = RenderStack.instance()
if stack is not None:
    bloom = BloomEffect()
    bloom.threshold = 1.0
    bloom.intensity = 0.7
    stack.add_pass(bloom)
```

Mount configuration during scene setup, not continuously in `update`.

## Materials and transparency

The material chooses shaders, properties, textures, surface type, alpha clipping, depth, blending, culling, and render queue. Use opaque surfaces by default; transparent blending has ordering and overdraw costs. Use alpha clipping for cutout shapes when hard edges are acceptable.

A material property only has an effect when its shader exposes the corresponding name. Check `has_property()` when writing generic tools.

## Diagnosis order

1. Confirm the scene has one active RenderStack and a discovered pipeline.
2. Confirm the active Camera is eligible for that pipeline.
3. Verify the material, shader, mesh, and texture references resolve.
4. Check the pass is enabled and mounted at a compatible injection point.
5. Check required ResourceBus names and pass order.
6. Invalidate the graph after configuration changes, but not every frame.
7. Disable optional effects one at a time to isolate the first failing pass.

## Related reference

- [RenderStack](../api/RenderStack.md)
- [RenderPipeline](../api/RenderPipeline.md)
- [RenderGraph](../api/RenderGraph.md)
- [BloomEffect](../api/BloomEffect.md)
- [ToneMappingEffect](../api/ToneMappingEffect.md)
- [Material](../api/Material.md)
