---
title: "2D Foundations"
description: "Build a minimal 2D scene with an orthographic Camera, SpriteRenderer, imported texture, predictable world scale, and a frame-rate-independent movement check."
category: Learn
tags: ["2d", "sprite", "camera", "beginner"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["new-user", "agent"]
related_api: []
agent_summary: "Build a minimal 2D scene with an orthographic Camera, SpriteRenderer, imported texture, predictable world scale, and a frame-rate-independent movement check."
source_paths: ["python/Infernux/components/builtin/sprite_renderer.py", "python/Infernux/components/builtin/camera.pyi", "python/Infernux/core/asset_types.py"]
---

# 2D Foundations

Build a small, testable 2D scene: one orthographic Camera, one visible sprite, and one component that moves the sprite without depending on frame rate.

**Estimated time:** 15–20 minutes  
**Completion check:** the sprite is visible, keeps its proportions, and moves at the same apparent speed when the frame rate changes.

## Before you start

Complete [Getting Started](getting-started.md) and [Your First Component](first-component.md). Prepare a PNG texture with transparency and keep the Console open.

## 1. Import the sprite texture

Copy the image into the project's `Assets` hierarchy and select it in the Project panel.

- Set its texture type to **UI** only when it is intended for screen UI; a world sprite can use the normal/default texture path.
- Keep sRGB enabled for color artwork.
- Use Clamp when transparent edge pixels should not repeat.
- Disable mipmaps only when the sprite will remain at a fixed screen size; moving or zooming sprites can benefit from them.

Keep the image and its `.meta` file together. See [Assets and `.meta` Files](../manual/assets-and-meta.md) for the identity rules.

## 2. Configure an orthographic Camera

Create or select the scene Camera and change its projection to orthographic. Position it so that it faces the XY plane where the sprite will live.

`orthographic_size` controls the visible world height rather than perspective zoom. Choose a size deliberately, then use the Game view to verify the target aspect ratios. A sprite that looks correct only in the Scene view is not yet validated.

## 3. Add a SpriteRenderer

Create a GameObject for the sprite and add **Rendering / Sprite Renderer**. Assign the imported texture in the sprite field.

The current SpriteRenderer draws a sprite-sheet frame on a Quad mesh. Its important controls are:

- `frame_index` — which frame of a sprite sheet is visible;
- `sprite_color` — RGBA tint multiplied with the texture;
- `flip_x` / `flip_y` — visual mirroring;
- `casts_shadows` / `receives_shadows` — interaction with lit sprite materials.

Start with a white tint and frame 0. Use Transform position and scale to establish a consistent world-unit convention for the project.

## 4. Add a movement check

Attach this component to the sprite:

```python
from Infernux import InxComponent, Vector3, serialized_field


class SpriteDrift(InxComponent):
    speed: float = serialized_field(default=2.0, range=(0.0, 10.0))

    def update(self, delta_time: float) -> None:
        self.transform.translate(Vector3(self.speed * delta_time, 0.0, 0.0))
```

Enter Play mode and change `speed` before the next run. The `delta_time` multiplier makes the value mean world units per second.

## 5. Validate the scene

- The Game view, not only the Scene view, shows the sprite.
- Transparency has no repeated edge pixels.
- The sprite does not stretch when the Game view aspect ratio changes.
- Movement remains frame-rate independent.
- No missing texture, material, or component error appears in the Console.

## Common failures

### The sprite is invisible

Check Camera direction and clipping range, the object's Z relationship to the Camera, texture assignment, active hierarchy state, and the current render pipeline.

### The image is tinted unexpectedly

Set `sprite_color` to white with full alpha and verify the source texture's color-space import setting.

### A sprite sheet shows the wrong tile

Confirm the imported metadata exposes the expected frames, then choose a valid `frame_index`. An Animator can drive this field later.

## Next step

Continue with [Animation Workflow](animation-workflow.md) to build an `.animclip2d` and drive it with `SpiritAnimator`, or add [Input and Time](../manual/input-and-time.md) to control the object.

