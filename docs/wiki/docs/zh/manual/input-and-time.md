---
category: 手册
tags: ["输入", "时间", "键盘", "鼠标", "帧"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "解释 held/down/up 输入语义、Game 视图焦点、鼠标坐标、帧时间、固定时间、非缩放时间与帧率无关移动。"
source_paths: ["python/Infernux/input", "python/Infernux/timing.pyi"]
---

# 输入与时间

Input 描述当前帧发生了什么，Time 决定这一帧对连续行为贡献多少。把二者职责分开，控制逻辑才能适应帧率变化和编辑器焦点。

## 按键状态是三段契约

| 查询 | 何时为 True | 常见用途 |
|---|---|---|
| `get_key(key)` | 按键持续按下 | 连续移动、蓄力 |
| `get_key_down(key)` | 本帧刚刚按下 | 跳跃、打开、确认 |
| `get_key_up(key)` | 本帧刚刚释放 | 释放、结束蓄力 |

鼠标按钮也有相同区分。`down` 与 `up` 是边沿事件，应在普通逐帧更新中读取，不能当成持续状态。

```python
from Infernux import InxComponent, Vector3
from Infernux.input import Input, KeyCode


class KeyboardMover(InxComponent):
    speed: float = 4.0

    def update(self, delta_time: float) -> None:
        direction = 0.0
        if Input.get_key(KeyCode.A):
            direction -= 1.0
        if Input.get_key(KeyCode.D):
            direction += 1.0

        self.transform.translate(Vector3(direction * self.speed * delta_time, 0.0, 0.0))
```

乘以 `delta_time`，可以把“每秒速度”换算成本帧距离。

## 焦点与鼠标坐标

编辑器与运行中的游戏可能争夺键鼠输入。`Input.is_game_focused()` 表示 Game 视口是否拥有玩法焦点。不要把点击编辑器面板解释成游戏操作。

- `mouse_position` 使用屏幕坐标。
- `game_mouse_position` 相对于 Game 视口。
- `get_game_mouse_frame_state(...)` 一次返回视口位置、增量、滚轮与按钮状态。

运行时 UI 和相机拾取使用 Game 视口坐标。需要把屏幕点转换为世界射线时，再交给活动 Camera。

光标锁定是一种明确状态：相对视角控制时锁定，菜单中解锁，并始终保留可预测的退出方式。

## 时间域

| 值 | 含义 |
|---|---|
| 回调参数 `delta_time` | 当前渲染帧经过的缩放时间 |
| `Time.fixed_delta_time` | 固定模拟间隔 |
| `Time.unscaled_delta_time` | 不受 `time_scale` 影响的帧时长 |
| `Time.time` | 游戏开始后的缩放时间 |
| `Time.realtime_since_startup` | 不受暂停影响的实际运行时间 |
| `Time.time_scale` | 缩放玩法时间的倍率 |

会随游戏减速或暂停的行为使用缩放时间；暂停菜单、无障碍提示等在玩法暂停时仍需运行的 UI 使用非缩放时间。

## update 还是 fixed_update？

- 在 `update(delta_time)` 读取即时输入边沿。
- 在 `fixed_update(fixed_delta_time)` 执行物理决策。
- 输入需要驱动物理时，在 `update` 保存意图，再在 `fixed_update` 消费该状态。

不要假设一个渲染帧等于一个物理步。慢帧可能执行多个固定步，快帧也可能在下一个固定步之前完成渲染。

## 常见失败

### 按住按键后跳跃反复触发

一次性动作使用 `get_key_down`，而不是 `get_key`。

### 移动速度随帧率变化

把速度表示为每秒单位，并乘以回调提供的 `delta_time`。

### 点击编辑器面板也触发游戏输入

检查 Game 焦点，并使用 Game 视口鼠标坐标。

### 暂停菜单动画也停止了

使用非缩放时间驱动，而不是缩放玩法时间。

## 相关参考

- [Input](../api/Input.md)
- [KeyCode](../api/KeyCode.md)
- [Time](../api/Time.md)
- [Camera](../api/Camera.md)
- [InxComponent 生命周期](../api/InxComponent.md)

