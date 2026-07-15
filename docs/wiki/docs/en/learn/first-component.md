---
category: Learn
tags: ["beginner", "python", "component", "inspector"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["new-user", "agent"]
agent_summary: "Create an InxComponent Python script, expose a serialized speed field, attach it to a GameObject, and verify lifecycle behavior in Play mode."
source_paths: ["python/Infernux/components", "python/Infernux/__init__.pyi"]
---

# Your First Component

Infernux gameplay scripts are Python classes derived from `InxComponent`. This tutorial creates a component that rotates its owning object and exposes its speed in the Inspector.

## Before you start

Complete [Getting Started](getting-started.md) and open a saved scene containing a visible GameObject. Keep the Console visible while testing.

## 1. Create the script

Create a Python script inside your project's script or asset area and name it `SpinComponent.py`.

```python
from Infernux import Debug, InxComponent, Vector3, serialized_field


class SpinComponent(InxComponent):
    speed: float = serialized_field(
        default=45.0,
        range=(0.0, 360.0),
        tooltip="Rotation speed in degrees per second",
    )

    def start(self) -> None:
        Debug.log("SpinComponent started", self.game_object)

    def update(self, delta_time: float) -> None:
        self.transform.rotate(Vector3(0.0, self.speed * delta_time, 0.0))
```

What each part does:

- `InxComponent` connects the Python class to the engine component lifecycle.
- `serialized_field` makes `speed` editable and serializable in the Inspector.
- `start()` runs before the first frame update after the component becomes active.
- `update(delta_time)` runs every frame; multiplying by `delta_time` keeps movement frame-rate independent.
- `self.transform` is a shortcut to the owning GameObject's Transform.

## 2. Attach it to an object

1. Save the script and wait for the editor to discover or reload it.
2. Select the visible GameObject in the Hierarchy.
3. In the Inspector, add the `SpinComponent` script component.
4. Set **Speed** to a noticeable value such as `90`.
5. Save the scene.

If the component does not appear, inspect the first Console error. A syntax error, an invalid import, or a class that does not inherit `InxComponent` prevents discovery.

## 3. Verify the behavior

Enter Play mode.

### Expected result

- The object rotates around its Y axis.
- The Console logs `SpinComponent started` once.
- Changing **Speed** before Play changes the rotation rate.
- Stopping Play ends the update loop without repeated errors.

## Lifecycle choices

| Method | Use it for |
|---|---|
| `awake()` | One-time internal initialization when the component is created |
| `start()` | Setup that depends on the active scene and other initialized components |
| `update(delta_time)` | Frame-rate-dependent gameplay and input |
| `fixed_update(fixed_delta_time)` | Fixed-step physics decisions |
| `late_update(delta_time)` | Follow-up work after normal updates, such as camera following |
| `on_destroy()` | Releasing resources or unregistering callbacks |

See the [InxComponent API](../api/InxComponent.md) for the complete lifecycle and component helpers.

## Common mistakes

### `update` never runs

- Confirm the method includes `self` and `delta_time`.
- Confirm the component and its GameObject are enabled.
- Confirm the editor attached the class from the file you edited.

### The Inspector does not show `speed`

- Keep the type annotation: `speed: float`.
- Assign `serialized_field(...)` at class scope, not inside `start()`.
- Resolve script reload errors before re-adding the component.

### The object rotates at different speeds on different machines

Use `speed * delta_time`; do not add a fixed number of degrees per frame.

## Next step

Use the [Engine Map](../manual/engine-map.md) to choose the next system—input, physics, scenes, UI, coroutines, or rendering—and then open its exact API page.

