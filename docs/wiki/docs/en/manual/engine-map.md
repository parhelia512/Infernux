---
category: Manual
tags: ["overview", "systems", "reference"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "A routing map from common Infernux development tasks to the responsible engine systems and canonical API pages."
source_paths: ["python/Infernux", "docs/wiki/docs/en/api"]
---

# Engine Map

Use this page when you know **what you want to build** but not which Infernux type or module owns it. It is a routing map, not a replacement for task tutorials or exact API signatures.

## Core authoring model

```text
Project
└─ Scene
   └─ GameObject
      ├─ Transform
      ├─ built-in Components
      └─ Python InxComponent scripts
```

A Scene contains GameObjects. Each GameObject always has spatial state through its Transform and gains behavior through components. Python gameplay behavior derives from `InxComponent` and participates in the engine lifecycle.

## Find a system by task

| I want to… | Start with | Canonical reference |
|---|---|---|
| Move, rotate, scale, or parent an object | Transform | [Transform](../api/Transform.md) |
| Write Python gameplay behavior | Component lifecycle | [InxComponent](../api/InxComponent.md) |
| Expose a value in the Inspector | Serialized fields | [serialized_field](../api/serialized_field.md) |
| Create, find, enable, or destroy objects | Object model | [GameObject](../api/GameObject.md) |
| Load or switch levels | Scene management | [SceneManager](../api/SceneManager.md) |
| Read keyboard, mouse, or touch input | Input | [Input](../api/Input.md) · [KeyCode](../api/KeyCode.md) |
| Run fixed-step physical behavior | Physics components and queries | [Physics](../api/Physics.md) · [Rigidbody](../api/Rigidbody.md) |
| Wait across frames without blocking | Coroutines | [Coroutine](../api/Coroutine.md) · [WaitForSeconds](../api/WaitForSeconds.md) |
| Read frame and fixed timing | Timing | [Time](../api/Time.md) |
| Log diagnostics | Debug | [Debug](../api/Debug.md) |
| Build runtime user interfaces | UI | [UICanvas](../api/UICanvas.md) · [UIButton](../api/UIButton.md) |
| Configure cameras and lights | Rendering components | [Camera](../api/Camera.md) · [Light](../api/Light.md) |
| Add post-processing | Render stack | [RenderStack](../api/RenderStack.md) |
| Build custom render passes | Render graph | [RenderGraph](../api/RenderGraph.md) |
| Optimize array-heavy Python loops | JIT subsystem | [JIT guide](../architecture/jit.md) · [njit](../api/njit.md) |

## Component lifecycle at a glance

```text
created → awake → enabled → start → update / fixed_update / late_update → disabled → destroyed
```

- Use `awake()` for the component's own invariant setup.
- Use `start()` when setup depends on the active scene.
- Use `update(delta_time)` for regular frame work.
- Use `fixed_update(fixed_delta_time)` for fixed-step physics decisions.
- Use `late_update(delta_time)` for work that must follow normal updates.
- Use `on_enable()`, `on_disable()`, and `on_destroy()` to manage external registrations and resources.

Lifecycle details live in the [InxComponent API](../api/InxComponent.md).

## Documentation layers

| Layer | Best for | Stability |
|---|---|---|
| Learn | Completing a small end-to-end task | Curated and version-checked |
| Manual | Understanding concepts and system ownership | Curated and version-checked |
| API | Exact classes, properties, methods, and signatures | Generated from current bindings and stubs |
| Architecture | Design rationale and research context | Explanatory; may describe experimental work |

When a guide and generated signature disagree, treat the current generated API as the signature authority and report the guide mismatch.

## Preview-status rule

Infernux is in preview. Before relying on a behavior:

1. check the page's `since` and `last_verified` metadata;
2. compare it with the engine version you are running;
3. verify the exact API signature;
4. inspect the Console for the first relevant error.

For your first practical workflow, continue to [Your First Component](../learn/first-component.md).

