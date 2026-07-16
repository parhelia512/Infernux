# RenderPassBuilder

<div class="class-info">
class in <b>Infernux.rendergraph</b>
</div>

## Description

Fluent builder for constructing a render pass.

<!-- USER CONTENT START --> description

<!-- USER CONTENT END -->

## Constructors

| Signature | Description |
|------|------|
| `RenderPassBuilder.__init__(name: str, graph: RenderGraph | None = ...) → None` |  |

<!-- USER CONTENT START --> constructors

<!-- USER CONTENT END -->

## Properties

| Name | Type | Description |
|------|------|------|
| name | `str` | The name of this render pass. *(read-only)* |

<!-- USER CONTENT START --> properties

<!-- USER CONTENT END -->

## Public Methods

| Method | Description |
|------|------|
| `read(texture: str | TextureHandle) → RenderPassBuilder` | Declare a texture as a read dependency for this pass. |
| `write_color(texture: str | TextureHandle, slot: int = ...) → RenderPassBuilder` | Declare a color attachment output for this pass. |
| `write_depth(texture: str | TextureHandle) → RenderPassBuilder` | Declare a depth attachment output for this pass. |
| `set_texture(sampler_name: str, texture: str | TextureHandle) → RenderPassBuilder` | Bind a texture to a sampler input for this pass. |
| `set_textures(bindings: Mapping[str, object]) → RenderPassBuilder` | Bind multiple textures to sampler inputs for this pass. |
| `set_clear(color: Optional[Tuple[float, float, float, float]] = ..., depth: Optional[float] = ...) → RenderPassBuilder` | Set clear values for color and/or depth attachments. |
| `draw_renderers(queue_range: Tuple[int, int] = ..., sort_mode: str = ..., pass_tag: str = ..., override_material: str = ...) → RenderPassBuilder` | Draw visible renderers filtered by queue range. |
| `draw_skybox() → RenderPassBuilder` | Draw the skybox in this pass. |
| `draw_shadow_casters(queue_range: Tuple[int, int] = ..., light_index: int = ..., shadow_type: str = ...) → RenderPassBuilder` | Draw shadow-casting geometry for a light. |
| `draw_screen_ui(list: str | int = ...) → RenderPassBuilder` | Draw screen-space UI elements in this pass. |
| `fullscreen_quad(shader: str) → RenderPassBuilder` | Draw a fullscreen quad with the specified shader. |
| `set_param(name: str, value: float) → RenderPassBuilder` | Set a push-constant parameter for this pass. |

<!-- USER CONTENT START --> public_methods

<!-- USER CONTENT END -->

## Operators

| Method | Returns |
|------|------|
| `__repr__() → str` | `str` |

<!-- USER CONTENT START --> operators

<!-- USER CONTENT END -->

## Example

<!-- USER CONTENT START --> example
> **Example status:** No curated example has been verified for this symbol in 0.2.1. Use the signatures above and related Manual/Learn pages; do not infer behavior from similarly named APIs in other engines.
<!-- USER CONTENT END -->

## See Also

<!-- USER CONTENT START --> see_also

<!-- USER CONTENT END -->
