---
category: Manual
tags: ["scene", "gameobject", "transform", "hierarchy"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "Explain Infernux scene ownership, GameObject identity, Transform hierarchy, component lookup, activation, and build-index scene loading."
source_paths: ["python/Infernux/scene", "python/Infernux/components", "python/Infernux/lib/_Infernux.pyi"]
---

# Scenes and Objects

Scenes, GameObjects, Transforms, and components form the ownership model for runtime content. Understanding which layer owns a value prevents fragile searches and cross-scene references.

## Ownership model

```text
Scene
└─ GameObject
   ├─ Transform
   │  └─ child GameObjects through Transform hierarchy
   ├─ built-in native Components
   └─ Python InxComponent instances
```

- A **Scene** is a loadable collection of objects.
- A **GameObject** supplies identity, activation, tag, layer, and component ownership.
- A **Transform** supplies spatial state and parent/child hierarchy.
- A **Component** supplies behavior or data without becoming a second object identity.

Do not treat a component as a free-standing scene object. Its lifetime and enabled state are constrained by its owning GameObject.

## GameObject identity and activation

`GameObject.name` is useful to humans but is not guaranteed to be unique. Use tags for broad role queries only when the project's tag contract makes the role stable. Keep direct component references for repeated frame work instead of calling global find operations every frame.

Activation has two related views:

- `active_self`: the object's own requested state;
- `active_in_hierarchy`: the effective state after parent activation is considered.

A child may request active state while remaining inactive because an ancestor is inactive. When diagnosing a component that does not update, inspect the effective hierarchy state as well as the component's `enabled` property.

## Transform hierarchy

The Transform exposes world and local values:

| Space | Position | Rotation | Scale |
|---|---|---|---|
| World | `position` | `rotation` / `euler_angles` | `lossy_scale` |
| Local | `local_position` | `local_rotation` / `local_euler_angles` | `local_scale` |

Use `set_parent(parent, world_position_stays=True)` when reparenting. With the default, the engine preserves the object's world placement and recomputes local values. Use `False` when the local relationship is the value you intend to preserve.

Prefer Transform traversal (`parent`, `get_child`, `find`) when the relationship is spatial. Prefer component references when the relationship is behavioral.

## Components

A GameObject can own built-in components and Python components. Common operations include:

- `add_component(type)` and `remove_component(instance)`;
- `get_component(type)` for one compatible component;
- `get_components(type)` for all compatible components;
- `get_component_in_children(type)` and `get_component_in_parent(type)` for hierarchy-aware lookup.

Cache a required reference in `start()` when it remains valid for the component's lifetime:

```python
from Infernux import InxComponent, Rigidbody


class Motor(InxComponent):
    def start(self) -> None:
        self.body = self.game_object.get_component(Rigidbody)

    def fixed_update(self, fixed_delta_time: float) -> None:
        if self.body is None:
            return
        # Apply fixed-step motor logic here.
```

When a component is mandatory, fail visibly during setup instead of silently searching the whole scene every frame.

## Loading scenes

`SceneManager` accepts a build index or scene identifier through `load_scene(...)`. Build indexes come from the ordered scene list in Build Settings.

```python
from Infernux import InxComponent
from Infernux.scene import SceneManager


class ExitPortal(InxComponent):
    next_scene_index: int = 1

    def travel(self) -> None:
        if not SceneManager.load_scene(self.next_scene_index):
            raise RuntimeError(f"Unable to queue scene {self.next_scene_index}")
```

The load request may be processed at an engine-safe point rather than replacing the active scene in the middle of a component callback. Do not continue mutating old-scene objects after requesting a transition.

Use `dont_destroy_on_load(game_object)` only for deliberately persistent objects such as a session coordinator. Persistent objects must handle repeated scene entry without duplicating themselves.

## Practical rules

1. Save scenes before adding them to Build Settings.
2. Do not rely on GameObject names as unique persistent identifiers.
3. Cache frequently used component references.
4. Distinguish local and world Transform values before assigning them.
5. Treat scene loads as ownership boundaries; old references may become invalid.
6. Keep persistent cross-scene objects few and explicit.

## Related reference

- [GameObject](../api/GameObject.md)
- [Transform](../api/Transform.md)
- [Scene](../api/Scene.md)
- [SceneManager](../api/SceneManager.md)
- [InxComponent](../api/InxComponent.md)
- [Build and Share a Project](../learn/build-and-share.md)

