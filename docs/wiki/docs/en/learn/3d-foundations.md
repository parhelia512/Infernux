---
category: Learn
tags: ["3d", "mesh", "material", "light", "camera"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["new-user", "agent"]
agent_summary: "Build and validate a minimal lit 3D scene using a perspective Camera, MeshRenderer, material, Light, shadows, and RenderStack."
source_paths: ["python/Infernux/components/builtin/mesh_renderer.pyi", "python/Infernux/components/builtin/camera.pyi", "python/Infernux/components/builtin/light.pyi", "python/Infernux/core/material.pyi", "python/Infernux/renderstack"]
---

# 3D Foundations

Create a minimal lit 3D scene whose rendering inputs are easy to inspect: one Camera, one mesh, one material, one Light, and one active RenderStack.

**Estimated time:** 20–25 minutes  
**Completion check:** the Game view shows a shaded object with a predictable material and a visible response when the Light moves.

## Before you start

Complete [Getting Started](getting-started.md). Read [Rendering and RenderStack](../manual/rendering-and-renderstack.md) if the project uses a non-default pipeline.

## 1. Establish the render path

Confirm the scene contains one active RenderStack and select a pipeline. Default Forward is a useful first scene because its opaque, sky, transparent, and post-effect order is explicit. Leave optional effects disabled until the base object renders.

Create a perspective Camera. Set its near/far clipping planes tightly enough for the scene scale, then position it toward the world origin. Excessively tiny near clipping and enormous far clipping reduce depth precision.

## 2. Create a visible mesh

Create a primitive GameObject or import a model, then confirm it has a `MeshRenderer`.

- A primitive uses an inline built-in mesh.
- An imported model uses a mesh asset GUID and may expose multiple material slots.
- `casts_shadows` controls shadow contribution.
- `receives_shadows` controls whether other objects shade its surface.

For imported models, inspect `mesh_name`, vertex/index counts, submeshes, and material slot names before diagnosing the shader.

## 3. Assign a material

Use a lit material for the first test. Keep it opaque, assign a visible base color/texture, and leave custom render-state overrides at defaults.

Transparent surfaces add draw-order and overdraw constraints. Alpha clipping is a better first choice for hard-edged leaves, fences, or cutout shapes.

## 4. Add a Light

Create a Light and start with one simple light source. Set intensity to a moderate value, place it where its direction or range is obvious, and enable shadows only after unshadowed lighting works.

Change the Light position, direction, color, or intensity in Edit mode and run again. A visible response proves the object is using a lit path rather than only an unlit fallback.

## 5. Add a rotation check

Reuse the component from [Your First Component](first-component.md), or attach this compact version:

```python
from Infernux import InxComponent, Vector3


class DisplayTurntable(InxComponent):
    def update(self, delta_time: float) -> None:
        self.transform.rotate(Vector3(0.0, 30.0 * delta_time, 0.0))
```

The moving highlight makes normals, lighting, and material response easier to inspect.

## 6. Validate in order

1. Mesh silhouette is visible with effects disabled.
2. The material is assigned to the intended slot.
3. Moving the Light changes the surface.
4. Shadows appear only when both the Light and renderer settings allow them.
5. The Camera clipping range contains the object throughout rotation.
6. The Console has no missing shader, mesh, material, or RenderGraph resource error.

## Common failures

### The Game view is empty

Check the active Camera, Camera direction and clipping, active hierarchy state, RenderStack, mesh assignment, and material in that order.

### The object is magenta, black, or flat

Verify the shader and texture references resolve, then confirm a compatible Light exists. Disable custom effects before changing many material values at once.

### Shadows disappear or flicker

Check Light shadow mode, renderer cast/receive settings, bias, shadow resolution, scene scale, and Camera range. Change one variable at a time.

## Next step

Import a rigged model and continue with [Animation Workflow](animation-workflow.md), or study [Assets and `.meta` Files](../manual/assets-and-meta.md) before moving production content.

