---
title: "屏幕空间 UI"
description: "解释屏幕空间 UI 层级、Canvas 缩放、锚点、文本和图片布局、按钮事件、命中测试与当前过渡效果限制。"
category: 手册
tags: ["UI", "Canvas", "布局", "事件", "响应式"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: ["Infernux.ui.UICanvas","Infernux.ui.UIText","Infernux.ui.UIImage","Infernux.ui.UIButton","Infernux.ui.UISelectable"]
agent_summary: "解释屏幕空间 UI 层级、Canvas 缩放、锚点、文本和图片布局、按钮事件、命中测试与当前过渡效果限制。"
source_paths: ["python/Infernux/ui", "python/Infernux/renderstack/default_forward_pipeline.pyi", "python/Infernux/renderstack/default_deferred_pipeline.pyi"]
---

# 屏幕空间 UI

Infernux UI 是以 `UICanvas` 为根的组件层级。其子 GameObject 挂载 `UIText`、`UIImage`、`UIButton` 等屏幕组件。布局使用 Canvas 设计像素，渲染与输入时再转换到当前 Game 视口。

## 先确定 Canvas

把 Canvas 参考分辨率视为界面的设计坐标系，默认值是 1920 × 1080。

| 设置 | 作用 |
|---|---|
| `render_mode` | 使用 `ScreenOverlay`，或为特定相机使用 `CameraOverlay` |
| `sort_order` | Canvas 间的顺序；数值较小者先绘制 |
| `ui_scale_mode` | 保持像素大小，或从参考分辨率缩放 |
| `screen_match_mode` | 决定如何处理宽高比例差异 |
| `match_width_or_height` | 从匹配宽度（`0`）过渡到匹配高度（`1`） |
| `pixel_perfect` | 条件允许时优先整数倍缩放 |

游戏 HUD 可先采用 `ScaleWithScreenSize`，然后同时验证最窄和最宽的目标比例。`ConstantPhysicalSize` 目前是面向未来的选项，现阶段行为等同固定像素。

屏幕 UI 还依赖当前渲染管线的 `enable_screen_ui` 设置。

## 锚点与矩形

每个 `InxUIScreenComponent` 都具有水平/垂直对齐锚点和 `x`、`y`、`width`、`height`。这些值相对于父 UI 元素；没有父元素时相对于 Canvas。

- 根据用途选择边缘：生命值贴角，弹窗居中。
- 把相关元素放在同一父节点下，使其作为一个布局单元移动。
- `rotation` 负责视觉旋转，命中测试也会使用旋转后的矩形。
- `opacity` 控制透明度，`raycast_target` 决定是否参与指针命中。
- 装饰图片不要开启 raycast，否则可能挡住后方按钮。

`UICanvas.raycast()` 返回最前方的可命中元素，`raycast_all()` 返回从前到后的完整列表。

```text
[INX-DIAGRAM:pipeline:指针事件在屏幕空间 UI 中的传播]
Game 视口中的指针
          ▼
转换到 Canvas 设计坐标
          ▼
Canvas 排序 → 父子矩形 → 从前向后 raycast
          ▼
第一个启用的 raycast_target
          ▼
UISelectable 状态 → UIButton on_click 监听器

raycast_target = false 的装饰 UIImage ──▶ 跳过
模态 UI 获得焦点 ──▶ 抑制玩法输入
```

## 文本、图片与按钮

`UIText` 支持水平/垂直对齐、行高、字距、溢出行为及三种尺寸模式。短标签使用 `AutoWidth`，自动换行段落使用 `AutoHeight`，布局不可移动时使用 `FixedSize`。

`UIImage.texture_path` 指向纹理资源；其颜色是乘法色调，使用 `[1, 1, 1, 1]` 可保留原图颜色。

`UIButton` 组合了背景、标签、选择状态颜色和 `on_click` 事件：

```python
from Infernux import GameObject, InxComponent
from Infernux.ui import UIButton


class MainMenu(InxComponent):
    def start(self) -> None:
        button_object = GameObject.find("StartButton")
        if button_object is None:
            return

        button = button_object.get_component(UIButton)
        if button is not None:
            button.on_click.add_listener(self.start_game)

    def start_game(self) -> None:
        print("Start requested")
```

如果之后需要 `remove_listener`，应保留稳定的方法回调。`ColorTint` 是当前已实现的选择过渡；Sprite Swap 与 Animation 标记为未来能力。

## 何时使用屏幕空间 UI

| 适合 | 不适合 |
|---|---|
| HUD、菜单、弹窗、叠层和贴附视口的提示 | 必须存在于 3D 场景中的世界空间标签 |
| 相对 Canvas 的指针交互 | 对世界几何做物理拾取或 Camera 射线 |
| 拥有明确焦点归属的可选择控件 | 会拦截 raycast 的装饰层 |
| 在目标宽高比上验证过的响应式布局 | 假设 1920 × 1080 设计尺寸就是物理视口 |

## 响应式检查清单

1. 在参考分辨率、16:9、16:10、超宽屏和窄竖屏中测试 Canvas。
2. 使用最长的目标语言文本检查布局，不要只验证较短的英文。
3. 确保缩放后交互目标仍足够大。
4. 确认渲染顺序、命中顺序和视觉顺序一致。
5. 模态 UI 获得焦点时禁用游戏输入。
6. 确认当前渲染管线已启用屏幕 UI。

## 相关参考

- [UICanvas](../api/UICanvas.md)
- [UIText](../api/UIText.md)
- [UIImage](../api/UIImage.md)
- [UIButton](../api/UIButton.md)
- [UISelectable](../api/UISelectable.md)
- [输入与时间](input-and-time.md)
