# RenderPipeline

<div class="class-info">
类位于 <b>Infernux.renderstack</b>
</div>

## 描述

可编程渲染管线基类。继承它来定制整个渲染流程。

<!-- USER CONTENT START --> description

<!-- USER CONTENT END -->

## 构造函数

| 签名 | 描述 |
|------|------|
| `RenderPipeline.__init__() → None` |  |

<!-- USER CONTENT START --> constructors

<!-- USER CONTENT END -->

## 属性

| 名称 | 类型 | 描述 |
|------|------|------|
| name | `str` | Display name for Editor UI and pipeline discovery. *(只读)* |

<!-- USER CONTENT START --> properties

<!-- USER CONTENT END -->

## 公共方法

| 方法 | 描述 |
|------|------|
| `render(context: Any, cameras: Any) → None` | 每帧调用，执行渲染。 |
| `should_render_camera(camera: Any) → bool` | Decide whether *camera* should be rendered this frame. |
| `render_camera(context: Any, camera: Any, culling: Any) → None` | Per-camera render hook. |
| `define_topology(graph: RenderGraph) → None` | Define the rendering topology on *graph*. |
| `dispose() → None` | Override to release resources when the pipeline is replaced. |

<!-- USER CONTENT START --> public_methods

<!-- USER CONTENT END -->

## 示例

<!-- USER CONTENT START --> example
> **示例状态：** 当前尚未为此符号验证 0.2.1 示例。请使用上方签名及相关 Manual/Learn；不要根据其他引擎中的同名 API 推测行为。
<!-- USER CONTENT END -->

## 另请参阅

<!-- USER CONTENT START --> see_also

<!-- USER CONTENT END -->
