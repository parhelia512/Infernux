---
category: Manual
tags: ["physics", "rigidbody", "collider", "raycast", "trigger"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "Explain Rigidbody and Collider roles, dynamic versus kinematic movement, fixed-step forces, collision/trigger callbacks, layers, and physics queries."
source_paths: ["python/Infernux/physics", "python/Infernux/components/builtin", "python/Infernux/components/component.py"]
---

# Physics

Infernux physics combines components that participate in simulation with global spatial queries. The main design decision is whether an object is controlled by physics or by authored transforms.

## Rigidbody and Collider roles

- A **Collider** defines a shape that can be hit, overlap, block, or act as a trigger.
- A **Rigidbody** gives the object simulated mass, velocity, gravity, constraints, and force APIs.
- A collider without a dynamic Rigidbody is suitable for static world geometry or query-only regions.
- A trigger reports overlap events without producing a normal physical response.

Keep collider geometry close to the visible object, but do not assume detailed render meshes make good collision shapes. Prefer the simplest shape that produces the intended play behavior.

## Dynamic or kinematic

| Mode | Controlled by | Use for |
|---|---|---|
| Dynamic | forces, gravity, collisions, velocity | crates, projectiles, physically reactive characters |
| Kinematic | authored target position/rotation | moving platforms, doors, scripted obstacles |
| Static | fixed Transform and collider | floors, walls, level geometry |

Do not move a dynamic Rigidbody by writing its Transform every frame. That bypasses normal simulation intent and can produce tunneling or unstable contact. Apply forces or velocity for dynamic bodies; use `move_position` / `move_rotation` for kinematic bodies.

## Fixed-step control

Physics decisions belong in `fixed_update(fixed_delta_time)`:

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

The force API already participates in the fixed simulation. Do not multiply a continuous force by render-frame `delta_time` unless the selected force mode explicitly expects an impulse value you have computed yourself.

## Collisions and triggers

`InxComponent` exposes paired callbacks:

- `on_collision_enter`, `on_collision_stay`, `on_collision_exit` for physical contact;
- `on_trigger_enter`, `on_trigger_stay`, `on_trigger_exit` for trigger overlap.

Use enter/exit for state transitions. Use stay only when work truly needs to repeat each fixed step. Filter early by component, tag, or layer before doing expensive logic.

If no callback arrives, check both objects:

1. collider shape exists and is enabled;
2. at least one participant has the required simulated body for the intended event;
3. trigger state matches the callback family;
4. layers are not configured to ignore one another;
5. the objects are actually active in the hierarchy.

## Queries

The global `Physics` API supports ray, sphere, and box queries:

```python
from Infernux import InxComponent, Vector3
from Infernux.physics import Physics


class GroundProbe(InxComponent):
    def is_grounded(self) -> bool:
        origin = self.transform.position
        hit = Physics.raycast(origin, Vector3(0.0, -1.0, 0.0), max_distance=1.1)
        return hit is not None
```

- Use `raycast` for a first hit along a thin line.
- Use `raycast_all` when ordering or multiple hits matter.
- Use `overlap_sphere` / `overlap_box` to find colliders already inside a volume.
- Use sphere or box casts when a moving volume must detect what lies ahead.
- Use layer masks to reduce false positives and query cost.
- Decide explicitly whether triggers should be included.

## Stability checklist

- Configure mass, drag, gravity, constraints, and collision mode deliberately.
- Use fixed updates for simulation commands.
- Avoid per-frame Transform writes on dynamic bodies.
- Keep layer-collision rules documented at project level.
- Choose query distance and volume intentionally; unlimited broad queries hide mistakes.
- Draw or log temporary probe data when a query result is surprising.

## Related reference

- [Physics](../api/Physics.md)
- [Rigidbody](../api/Rigidbody.md)
- [Collider](../api/Collider.md)
- [BoxCollider](../api/BoxCollider.md)
- [SphereCollider](../api/SphereCollider.md)
- [InxComponent collision lifecycle](../api/InxComponent.md)
- [Input and Time](input-and-time.md)

