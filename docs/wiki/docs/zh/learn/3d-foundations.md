---
title: "3D 基础"
description: "使用透视 Camera、MeshRenderer、材质、Light、阴影与 RenderStack 构建并验证最小受光 3D 场景。"
category: 学习
tags: ["3D", "网格", "材质", "灯光", "相机"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["new-user", "agent"]
related_api: []
agent_summary: "使用透视 Camera、MeshRenderer、材质、Light、阴影与 RenderStack 构建并验证最小受光 3D 场景。"
source_paths: ["python/Infernux/components/builtin/mesh_renderer.pyi", "python/Infernux/components/builtin/camera.pyi", "python/Infernux/components/builtin/light.pyi", "python/Infernux/core/material.pyi", "python/Infernux/renderstack"]
---

# 3D 基础

创建一个容易检查渲染输入的最小受光 3D 场景：一台 Camera、一个网格、一份材质、一盏 Light 和一个活动 RenderStack。

**预计时间：** 20–25 分钟  
**完成标准：** Game 视图显示有明暗的对象，移动 Light 时材质表面产生可预期变化。

## 开始之前

完成[快速开始](getting-started.md)。如果项目使用非默认管线，先阅读[渲染与 RenderStack](../manual/rendering-and-renderstack.md)。

## 1. 建立渲染路径

确认场景只有一个活动 RenderStack，并选择管线。Default Forward 适合第一个场景，因为不透明、天空、透明与后处理顺序明确。基础对象成功渲染前先关闭可选效果。

创建透视 Camera。根据场景尺度合理收紧 Near/Far 裁剪面，再让 Camera 朝向世界原点。过小的 Near 和过大的 Far 会降低深度精度。

## 2. 创建可见网格

创建基础体 GameObject 或导入模型，并确认它具有 `MeshRenderer`。

- 基础体使用内联的内置网格。
- 导入模型通过网格资源 GUID 引用，并可能提供多个材质槽。
- `casts_shadows` 决定是否贡献阴影。
- `receives_shadows` 决定表面是否接受其他对象阴影。

对导入模型，应先检查 `mesh_name`、顶点/索引数量、子网格和材质槽名称，再排查 Shader。

## 3. 分配材质

第一次测试使用 Lit 材质，保持 Opaque，指定明显的基础颜色/纹理，并让自定义渲染状态保持默认。

透明表面会增加绘制排序与 overdraw 限制。树叶、栅栏等硬边镂空形状首先考虑 Alpha Clip。

## 4. 添加 Light

创建一盏简单 Light。使用中等强度，把它放在方向或范围明显的位置；无阴影光照工作后再启用阴影。

在 Edit 模式改变 Light 位置、方向、颜色或强度，然后重新运行。表面产生变化可以证明对象使用 Lit 路径，而不是只有 Unlit 回退。

## 5. 添加旋转检查

复用[第一个组件](first-component.md)，或挂载以下紧凑版本：

```python
from Infernux import InxComponent, Vector3


class DisplayTurntable(InxComponent):
    def update(self, delta_time: float) -> None:
        self.transform.rotate(Vector3(0.0, 30.0 * delta_time, 0.0))
```

移动的高光便于检查法线、光照与材质响应。

## 6. 按顺序验证

1. 关闭效果时能看到网格轮廓。
2. 材质位于预期槽位。
3. 移动 Light 会改变表面。
4. 只有 Light 与 Renderer 设置都允许时才出现阴影。
5. 对象旋转全程处于 Camera 裁剪范围内。
6. Console 没有 Shader、网格、材质或 RenderGraph 资源缺失错误。

## 常见失败

### Game 视图为空

依次检查活动 Camera、Camera 方向和裁剪、活动层级、RenderStack、网格分配与材质。

### 对象呈洋红、黑色或完全平坦

确认 Shader 与纹理引用可解析，再确认存在兼容 Light。先关闭自定义效果，不要同时改变大量材质参数。

### 阴影消失或闪烁

检查 Light 阴影模式、Renderer 投射/接收设置、Bias、阴影分辨率、场景尺度和 Camera 范围，每次只改变一个变量。

## 下一步

导入绑定骨骼的模型并继续[动画工作流](animation-workflow.md)，或在移动生产资源前学习[资源与 `.meta` 文件](../manual/assets-and-meta.md)。

