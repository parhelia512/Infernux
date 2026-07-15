---
category: Manual
tags: ["input", "time", "keyboard", "mouse", "frame"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "Explain held/down/up input semantics, game-view focus, mouse coordinates, delta time, fixed time, unscaled time, and frame-independent movement."
source_paths: ["python/Infernux/input", "python/Infernux/timing.pyi"]
---

# Input and Time

Input describes what happened during the current frame. Time determines how that frame contributes to continuous behavior. Keeping those responsibilities separate produces controls that survive changing frame rates and editor focus.

## Button state is a three-part contract

| Query | True when | Typical use |
|---|---|---|
| `get_key(key)` | the key is held | continuous movement or charging |
| `get_key_down(key)` | the key changed to pressed this frame | jump, open, confirm |
| `get_key_up(key)` | the key changed to released this frame | release, stop charging |

The same distinction exists for mouse buttons. A `down` or `up` query is an edge event: read it in normal frame updates, not as a persistent state.

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

Multiplying by `delta_time` converts a per-second speed into the distance for this frame.

## Focus and mouse coordinates

The editor and the running game can compete for keyboard and mouse input. `Input.is_game_focused()` tells you whether the Game viewport owns gameplay focus. Do not interpret editor clicks as gameplay actions.

- `mouse_position` is in screen coordinates.
- `game_mouse_position` is relative to the game viewport.
- `get_game_mouse_frame_state(...)` returns viewport-relative position, delta, scroll, and button state together.

Use game-view coordinates for runtime UI and camera picking. Convert through the active Camera when a screen point must become a world ray.

Cursor locking is an explicit state. Lock for relative-look controls, unlock for menus, and always provide a predictable escape path.

## Time domains

| Value | Meaning |
|---|---|
| callback `delta_time` | scaled duration of the current rendered frame |
| `Time.fixed_delta_time` | fixed simulation interval |
| `Time.unscaled_delta_time` | frame duration unaffected by `time_scale` |
| `Time.time` | scaled time since game start |
| `Time.realtime_since_startup` | wall-clock-style runtime unaffected by pause |
| `Time.time_scale` | multiplier applied to scaled game time |

Use scaled time for gameplay that should slow or pause. Use unscaled time for pause menus, accessibility prompts, and other UI that must continue while gameplay time is stopped.

## Update or fixed update?

- Read immediate input edges in `update(delta_time)`.
- Apply physics decisions in `fixed_update(fixed_delta_time)`.
- If input must drive physics, capture the intent in `update`, then consume the stored intent in `fixed_update`.

Do not assume one rendered frame equals one physics step. A slow frame may require multiple fixed steps, while a fast frame may render before the next fixed step.

## Common failures

### A jump repeats while a key is held

Use `get_key_down`, not `get_key`, for one-shot actions.

### Movement speed changes with frame rate

Express speed per second and multiply by the callback's `delta_time`.

### Input fires when clicking editor panels

Check game focus and use game-viewport mouse coordinates.

### Pause menu animations freeze

Drive them from unscaled time rather than scaled gameplay time.

## Related reference

- [Input](../api/Input.md)
- [KeyCode](../api/KeyCode.md)
- [Time](../api/Time.md)
- [Camera](../api/Camera.md)
- [InxComponent lifecycle](../api/InxComponent.md)

