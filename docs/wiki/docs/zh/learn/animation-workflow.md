---
category: 学习
tags: ["动画", "2D", "3D", "FSM", "Animator"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "创建 2D 或 3D 动画 Clip，放入 .animfsm 控制器，挂载 SpiritAnimator 或 SkeletalAnimator，并验证状态、过渡、事件与播放行为。"
source_paths: ["python/Infernux/engine/ui/animclip2d_editor_panel.py", "python/Infernux/engine/ui/animfsm_editor_panel.py", "python/Infernux/core/animation_clip.py", "python/Infernux/core/animation_clip3d.py", "python/Infernux/core/anim_state_machine.py", "python/Infernux/components/spirit_animator.py", "python/Infernux/components/skeletal_animator.py"]
---

# 动画工作流

Infernux 把动画数据分为 Clip 与状态机控制器。运行时 Animator 读取控制器，驱动 Sprite 帧或骨骼模型。

**预计时间：** 25–35 分钟  
**完成标准：** 默认状态在 Game 视图中播放，并且明确的参数或 Trigger 能切换到第二个状态。

## 选择路径

| 路径 | Clip | Renderer | 运行时组件 |
|---|---|---|---|
| 2D Sprite | `.animclip2d` | `SpriteRenderer` | `SpiritAnimator` |
| 3D 骨骼 | `.animclip3d` 或导入模型的嵌入 Take | `SkinnedMeshRenderer` | `SkeletalAnimator` |

两者都使用 `.animfsm` 控制器。`SpiritAnimator` 是当前 Sprite 动画组件的公开名称。

## 1. 准备 Renderer

2D 路径先完成[2D 基础](2d-foundations.md)，确认 SpriteRenderer 能手工显示所需的每个 Sprite Sheet 帧。

3D 路径导入绑定骨骼的模型，确认 SkinnedMeshRenderer 能显示 Bind Pose。在创建状态前检查模型的嵌入动画 Take；嵌入 Take 可能通过模型的虚拟子动画身份引用。

在 Renderer 和资源引用能独立工作之前，不要先排查 Animator。

## 2. 创建 Clip

2D 路径打开 **Window → 2D Animation Clip Editor**，选择 Sprite Sheet 纹理，设置 FPS 和帧序列，预览后保存为 `Assets` 内的 `.animclip2d`。

3D 路径创建或选择一个标识源模型与 Take 的 `.animclip3d`，在资源详情中确认 Take 时长与 Bind Pose 骨骼信息。

Idle/Run 循环使用 Loop。Hit、Death 等一次性 Clip 在状态机应于结束后离开时保持非循环。

## 3. 构建状态机

在 Animation State Machine Editor 中创建或打开 `.animfsm`；双击该资源也会打开 Graph。

1. 选择正确的 2D 或 3D 控制器模式。
2. 至少添加两个状态，并为每个状态分配 Clip/Take。
3. 明确指定默认状态。
4. 添加一个参数或 Trigger。
5. 创建一条过渡，第一条条件保持简单。
6. 决定过渡是否等待 Exit Time。
7. 保存，并确认 `.meta` 与资源仍在一起。

同时具有复杂条件和 Exit Time 的过渡很难排查，应先分别证明一种机制。

## 4. 挂载 Animator

把 `SpiritAnimator` 加到 SpriteRenderer 所在 GameObject，或把 `SkeletalAnimator` 加到 SkinnedMeshRenderer 所在对象。组件元数据会强制要求对应 Renderer。

把 `.animfsm` 分配给 `controller`，第一次运行保持 `auto_play` 开启、播放速度为 `1.0`。`SkeletalAnimator.cross_fade_duration` 控制 3D 状态间默认混合时长。

## 5. 驱动过渡

从玩法组件调用运行时参数 API：

```python
from Infernux import InxComponent, SpiritAnimator


class AnimationDriver(InxComponent):
    def start(self) -> None:
        self.animator = self.game_object.get_component(SpiritAnimator)

    def begin_move(self) -> None:
        if self.animator is not None:
            self.animator.set_bool("moving", True)

    def react(self) -> None:
        if self.animator is not None:
            self.animator.set_trigger("react")
```

3D 路径把组件类型替换为 `SkeletalAnimator`。参数从控制器初始化，并在每次 Update 中由过渡求值。

## 6. 验证可观察状态

- `current_state` 与预期 Graph 节点一致。
- Clip 推进时 `is_playing` 为 true。
- `normalized_time` 从 0 向 1 推进，只在循环状态中回绕。
- Trigger 被过渡消耗，不会永久触发。
- 2D 帧索引或活动 3D Take 发生可见变化。
- 停止 Play 并重新打开场景后，控制器引用仍存在。

## 常见失败

### 默认动画没有开始

检查 `auto_play`、控制器引用、明确默认状态、匹配的 Renderer，以及 Console 第一条错误。

### 状态改变但图片或骨骼不变

2D 检查 Clip 帧索引是否存在于导入 Sprite 元数据中；3D 检查 Take 是否属于指定模型且骨架兼容。

### 过渡始终不触发

确认参数拼写与类型、条件方向、Exit Time 阈值、当前 normalized time，以及 Trigger 是否已被消耗。

## 当前文档边界

`SpiritAnimator`、`SkeletalAnimator` 与 Clip/FSM 数据模型是公开运行时类，但当前 API 索引还没有它们的生成符号页。在匹配 Stub 补齐前，本 Learn 页面及其 `source_paths` 是权威 Preview 指南。

## 下一步

谨慎添加 Animation Event 表达特定帧玩法信号，或继续[音频工作流](audio-workflow.md)，从同一玩法动作触发一次性音效。

