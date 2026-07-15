---
category: 手册
tags: ["物理", "rigidbody", "collider", "射线", "触发器"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "解释 Rigidbody 与 Collider 职责、动态和运动学移动、固定步力、碰撞/触发回调、层与物理查询。"
source_paths: ["python/Infernux/physics", "python/Infernux/components/builtin", "python/Infernux/components/component.py"]
---

# 物理

Infernux 物理系统由参与模拟的组件和全局空间查询组成。最重要的设计决定，是对象由物理控制，还是由脚本直接编排 Transform。

## Rigidbody 与 Collider 职责

- **Collider** 定义可命中、重叠、阻挡或作为触发器的形状。
- **Rigidbody** 让对象拥有模拟质量、速度、重力、约束与力接口。
- 没有动态 Rigidbody 的 Collider 适合静态世界几何或只参与查询的区域。
- Trigger 报告重叠事件，不产生普通物理响应。

碰撞几何应接近可见对象，但不要认为复杂渲染网格天然就是好碰撞体。优先使用能实现玩法目标的最简单形状。

## 动态、运动学或静态

| 模式 | 由谁控制 | 适合 |
|---|---|---|
| 动态 | 力、重力、碰撞、速度 | 箱子、投射物、物理响应角色 |
| 运动学 | 编排的目标位置/旋转 | 移动平台、门、脚本障碍物 |
| 静态 | 固定 Transform 与 Collider | 地面、墙壁、关卡几何 |

不要每帧写 Transform 来移动动态 Rigidbody。这样会绕过正常模拟意图，导致穿透或接触不稳定。动态物体使用力或速度；运动学物体使用 `move_position` / `move_rotation`。

## 固定步控制

物理决策放在 `fixed_update(fixed_delta_time)`：

```python
from Infernux import InxComponent, Rigidbody, Vector3


class Thruster(InxComponent):
    thrust: float = 12.0

    def start(self) -> None:
        self.body = self.game_object.get_component(Rigidbody)

    def fixed_update(self, fixed_delta_time: float) -> None:
        if self.body is not None:
            self.body.add_force(Vector3(0.0, self.thrust, 0.0))
```

力接口本身会进入固定模拟。除非所选 force mode 明确要求自行计算的 impulse，否则不要再乘渲染帧 `delta_time`。

## 碰撞与触发器

`InxComponent` 提供两组回调：

- `on_collision_enter`、`on_collision_stay`、`on_collision_exit`：物理接触；
- `on_trigger_enter`、`on_trigger_stay`、`on_trigger_exit`：触发器重叠。

状态切换使用 enter/exit；只有确实需要每个固定步重复时才使用 stay。先按组件、tag 或 layer 快速过滤，再执行昂贵逻辑。

如果回调没有到达，检查双方：

1. Collider 存在且启用；
2. 至少一方拥有目标事件所需的模拟刚体；
3. Trigger 状态与回调家族匹配；
4. Layer 没有被配置为相互忽略；
5. 对象在层级中实际激活。

## 查询

全局 `Physics` API 支持射线、球体与盒体查询：

```python
from Infernux import InxComponent, Vector3
from Infernux.physics import Physics


class GroundProbe(InxComponent):
    def is_grounded(self) -> bool:
        origin = self.transform.position
        hit = Physics.raycast(origin, Vector3(0.0, -1.0, 0.0), max_distance=1.1)
        return hit is not None
```

- `raycast`：细线方向上的第一个命中。
- `raycast_all`：需要多个命中或顺序时使用。
- `overlap_sphere` / `overlap_box`：查找已经位于体积内的 Collider。
- sphere/box cast：让移动体积检测前方目标。
- 使用 layer mask 减少误报与查询成本。
- 明确决定是否包含 Trigger。

## 稳定性清单

- 主动配置质量、阻力、重力、约束与碰撞检测模式。
- 在固定更新中发送模拟命令。
- 不要逐帧写动态刚体的 Transform。
- 在项目层记录 Layer 碰撞规则。
- 明确设置查询距离与体积；无界宽泛查询会掩盖错误。
- 查询结果异常时，临时绘制或记录探针数据。

## 相关参考

- [Physics](../api/Physics.md)
- [Rigidbody](../api/Rigidbody.md)
- [Collider](../api/Collider.md)
- [BoxCollider](../api/BoxCollider.md)
- [SphereCollider](../api/SphereCollider.md)
- [InxComponent 碰撞生命周期](../api/InxComponent.md)
- [输入与时间](input-and-time.md)

