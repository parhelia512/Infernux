---
title: "Native–Python Boundary"
description: "Maps ownership across the C++ runtime, pybind11 module, Python public API, and PyComponentProxy lifecycle bridge, including the rules for identity, lifetime, and serialization."
category: Architecture
tags: ["cpp", "python", "pybind11", "components", "lifecycle"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["advanced-user", "contributor", "agent"]
related_api: []
agent_summary: "Maps ownership across the C++ runtime, pybind11 module, Python public API, and PyComponentProxy lifecycle bridge, including the rules for identity, lifetime, and serialization."
source_paths: ["cpp/infernux/tools/pybinding/BindingInfernux.cpp", "cpp/infernux/tools/pybinding/BindingScene.cpp", "cpp/infernux/function/scene/PyComponentProxy.cpp", "python/Infernux/__init__.py", "python/Infernux/lib/__init__.py", "python/Infernux/components/component.py", "python/Infernux/components/registry.py"]
---

# Native–Python Boundary

Infernux is Python-native at the authoring layer, but it is not a Python-only engine. The runtime deliberately divides responsibility between a C++ execution core and a Python orchestration and gameplay layer. Understanding that boundary is the fastest way to answer three recurring questions: where a feature belongs, who owns an object's lifetime, and whether a call is cheap enough for a per-frame loop.

## The four layers

```text
Game script / editor tool
        │ public imports and Unity-style wrappers
        ▼
Infernux Python package
        │ Infernux.lib re-exports native symbols
        ▼
_Infernux pybind11 extension
        │ non-owning handles, value conversion, callback forwarding
        ▼
C++ runtime: scene, renderer, physics, audio, assets
```

The native extension is created by `PYBIND11_MODULE(_Infernux, m)` in `BindingInfernux.cpp`. The same module then registers focused binding groups for scenes, resources, render graphs, input, physics, audio, batch operations, and other subsystems. This is the capability surface, not the recommended user-facing namespace.

`Infernux.lib` exposes the bound types. The top-level `Infernux` package and its subpackages then add stable imports, Pythonic wrappers, editor behavior, gameplay components, and compatibility routing. User code should normally import from documented public modules rather than `_Infernux` directly.

## Ownership rules

The most important distinction is between **lifetime authority** and **Python reachability**.

| Object family | Lifetime authority | Python sees |
| --- | --- | --- |
| Engine and managers | C++ singleton or engine instance | a non-owning facade or bound instance |
| Scene and GameObject | C++ scene graph | handles and bound methods |
| Built-in components | C++ GameObject | native component facades, sometimes wrapped for a consistent API |
| Script components | C++ `PyComponentProxy` plus a Python `InxComponent` mirror | the gameplay object users subclass |
| Pure Python authoring data | Python | builders, registries, editor orchestration |

Keeping a Python reference does not necessarily keep its native target alive. Scene changes and object destruction can invalidate native handles. Public wrappers therefore resolve components through the current GameObject and treat native lifetime errors as invalidation, not as permission to resurrect an object.

## How a Python component enters the engine

A gameplay component derives from `InxComponent`. Class creation performs work before any instance exists:

1. `__init_subclass__` discovers serializable fields and assigns stable type identity.
2. Numeric fields are registered with the native `ComponentDataStore` bridge.
3. The component class is made discoverable through the Python registry and script-loading path.
4. When attached to a GameObject, the native scene creates a `PyComponentProxy` that holds the Python object.

The proxy is the lifecycle authority. It binds the Python mirror to the native Component and GameObject, synchronizes enabled/start/destroyed state, acquires the GIL when forwarding a callback, and calls the internal `_call_awake`, `_call_update`, `_call_on_destroy`, and physics callback entry points.

```text
C++ scene tick
  → PyComponentProxy::Update(deltaTime)
    → acquire GIL
      → Python InxComponent._call_update(deltaTime)
        → user update(delta_time)
```

The proxy inspects whether `update`, `fixed_update`, or `late_update` is actually overridden. If a callback is not overridden and no coroutine scheduler needs it, the forwarding call can be skipped. This is an important optimization, but a large number of active Python callbacks still means a large number of boundary crossings.

## Identity and serialization

Python script components carry more identity than a class name:

- `type_guid` identifies the module and qualified class type.
- `script_guid` identifies the script asset used to restore the component.
- `component_id` identifies the attached component instance.
- `py_fields` stores the serialized field document.

`PyComponentProxy::SerializeDocument` refuses to serialize a Python component without stable script and type GUIDs. During loading, C++ restores the native scene structure and pending component records; Python resolves the script type and reconstructs its fields. This split is why renaming or moving scripts is an asset-identity concern, not merely an import concern.

## Boundary cost model

Treat each Python/native property access as a real operation involving dispatch, possible type conversion, and often the GIL. The practical rules are:

- Ordinary gameplay and editor interactions can use the object API directly.
- Avoid repeated per-object getter/setter traffic in large inner loops.
- Use batch APIs and contiguous arrays for data-parallel work.
- Keep resource allocation, Vulkan synchronization, scene ownership, and physics ownership in native subsystems.
- Keep declarative topology, tools, gameplay policy, and high-level composition in Python unless profiling proves otherwise.

The JIT architecture page explains the batch path in detail. JIT only accelerates computation after boundary traffic has already been consolidated.

## Contributor routing

When changing behavior, begin with the owner:

| Change | Start here |
| --- | --- |
| Add or expose a native capability | focused `Binding*.cpp`, then public Python export and stubs |
| Change component lifetime semantics | C++ `Component` / `PyComponentProxy` and Python lifecycle mixins together |
| Add an Inspector field type | serialized-field metadata, codec, Inspector rendering, and native CDS support if numeric |
| Add a friendly gameplay API | Python wrapper first; bind C++ only when the capability is absent |
| Optimize many-object math | batch bridge and data layout before JIT kernels |

Do not infer public API stability from a symbol merely existing in `_Infernux`. The generated API reference and its version metadata are the public contract for the documented release.

## Verification notes

This page describes the repository state verified on 2026-07-15. It does not promise that every bound `_Infernux` symbol is stable. For exact current signatures, consult the generated API reference; for measured high-volume scripting behavior, continue to [JIT-Accelerated Scripting](jit.md).
