---
title: "2D 基础"
description: "使用正交 Camera、SpriteRenderer、导入纹理、明确世界尺度和帧率无关移动检查构建最小 2D 场景。"
category: 学习
tags: ["2D", "Sprite", "相机", "入门"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["new-user", "agent"]
related_api: []
agent_summary: "使用正交 Camera、SpriteRenderer、导入纹理、明确世界尺度和帧率无关移动检查构建最小 2D 场景。"
source_paths: ["python/Infernux/components/builtin/sprite_renderer.py", "python/Infernux/components/builtin/camera.pyi", "python/Infernux/core/asset_types.py"]
---

# 2D 基础

构建一个小而可验证的 2D 场景：一台正交 Camera、一个可见 Sprite，以及一个不会依赖帧率的移动组件。

**预计时间：** 15–20 分钟  
**完成标准：** Sprite 可见、比例正确，并且帧率变化时视觉移动速度保持一致。

## 开始之前

先完成[快速开始](getting-started.md)和[第一个组件](first-component.md)。准备一张带透明通道的 PNG，并保持 Console 可见。

## 1. 导入 Sprite 纹理

把图片复制到项目 `Assets` 层级，在 Project 面板中选择它。

- 只有用于屏幕 UI 时才选择 **UI** 纹理类型；世界 Sprite 可使用普通/默认纹理路径。
- 彩色美术资源保持 sRGB 开启。
- 透明边缘不应重复时使用 Clamp。
- Sprite 在屏幕中始终保持固定大小时可考虑关闭 mipmap；缩放或远近变化时通常保留。

图片与 `.meta` 文件必须一起保留。身份规则见[资源与 `.meta` 文件](../manual/assets-and-meta.md)。

## 2. 配置正交 Camera

创建或选择场景 Camera，把投影改为 Orthographic，并让它朝向 Sprite 所在的 XY 平面。

`orthographic_size` 控制可见世界高度，而不是透视变焦。明确选择一个值，然后用 Game 视图验证目标宽高比。只在 Scene 视图中正确并不代表运行结果已通过。

## 3. 添加 SpriteRenderer

为 Sprite 创建 GameObject，添加 **Rendering / Sprite Renderer**，在 Sprite 字段指定刚导入的纹理。

当前 SpriteRenderer 在 Quad 网格上绘制 Sprite Sheet 的一帧。主要控制项是：

- `frame_index`：显示 Sprite Sheet 的哪一帧；
- `sprite_color`：与纹理相乘的 RGBA 色调；
- `flip_x` / `flip_y`：视觉镜像；
- `casts_shadows` / `receives_shadows`：与受光 Sprite 材质的阴影交互。

先使用白色色调和第 0 帧，再通过 Transform 位置和缩放建立项目统一的世界单位约定。

## 4. 添加移动检查

把以下组件挂到 Sprite：

```python
from Infernux import InxComponent, Vector3, serialized_field


class SpriteDrift(InxComponent):
    speed: float = serialized_field(default=2.0, range=(0.0, 10.0))

    def update(self, delta_time: float) -> None:
        self.transform.translate(Vector3(self.speed * delta_time, 0.0, 0.0))
```

进入 Play，在下一次运行前改变 `speed`。乘以 `delta_time` 后，这个值表示每秒移动的世界单位。

## 5. 验证场景

- Game 视图而不只是 Scene 视图能看到 Sprite。
- 透明边缘没有重复像素。
- Game 视图宽高比变化时图片不被拉伸。
- 移动速度不依赖帧率。
- Console 没有纹理、材质或组件缺失错误。

## 常见失败

### Sprite 不可见

检查 Camera 方向和裁剪范围、对象相对 Camera 的 Z 位置、纹理分配、活动层级状态与当前渲染管线。

### 图片出现意外色调

把 `sprite_color` 设为全 Alpha 白色，并核对源纹理的颜色空间导入设置。

### Sprite Sheet 显示了错误格子

确认导入元数据提供了预期帧，再选择有效的 `frame_index`。之后可由 Animator 驱动该字段。

## 下一步

继续[动画工作流](animation-workflow.md)，创建 `.animclip2d` 并使用 `SpiritAnimator` 驱动；或者结合[输入与时间](../manual/input-and-time.md)控制对象。

