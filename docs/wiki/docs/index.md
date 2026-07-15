# Infernux Documentation

Learn Infernux by completing a small task, look up a system in the manual, or jump directly to the generated Python API reference.

中文入口：[快速开始](zh/learn/getting-started.md) · [第一个组件](zh/learn/first-component.md) · [2D](zh/learn/2d-foundations.md) · [3D](zh/learn/3d-foundations.md) · [动画](zh/learn/animation-workflow.md) · [音频](zh/learn/audio-workflow.md) · [构建并分享](zh/learn/build-and-share.md) · [引擎地图](zh/manual/engine-map.md)

## Start here

| If you want to… | Go to |
|---|---|
| Install the preview and understand the editor | [Getting Started](en/learn/getting-started.md) |
| Write and attach gameplay logic | [Your First Component](en/learn/first-component.md) |
| Build an orthographic sprite scene | [2D Foundations](en/learn/2d-foundations.md) |
| Build a minimal lit mesh scene | [3D Foundations](en/learn/3d-foundations.md) |
| Create clips and Animator transitions | [Animation Workflow](en/learn/animation-workflow.md) |
| Configure persistent and one-shot sound | [Audio Workflow](en/learn/audio-workflow.md) |
| Build and validate a standalone player | [Build and Share a Project](en/learn/build-and-share.md) |
| Find the right engine system | [Engine Map](en/manual/engine-map.md) |
| Understand scene and object ownership | [Scenes and Objects](en/manual/scenes-and-objects.md) |
| Handle input and frame-independent motion | [Input and Time](en/manual/input-and-time.md) |
| Configure collisions, forces, and queries | [Physics](en/manual/physics.md) |
| Build responsive game interfaces | [Screen-space UI](en/manual/ui.md) |
| Import, reference, and move content safely | [Assets and `.meta` Files](en/manual/assets-and-meta.md) |
| Select pipelines and order render effects | [Rendering and RenderStack](en/manual/rendering-and-renderstack.md) |
| Check API release compatibility | [API Versioning and Compatibility](en/manual/api-versioning.md) |
| Diagnose errors and report evidence | [Debugging and the Console](en/manual/debugging.md) |
| Look up an exact class or method | [API Reference](en/api/index.md) |

## Quick Links

- [Project README](https://github.com/ChenlizheMe/Infernux#readme)
- [Chinese README](https://github.com/ChenlizheMe/Infernux/blob/main/README-zh.md)
- [Website](https://infernux-engine.com/)
- [Technical Report](https://arxiv.org/pdf/2604.10263)
- [API Reference](en/api/index.md)


## Architecture and Research

Project context and the current performance story live here:

| Page | Description |
|------|-------------|
| [Why Infernux Exists](en/architecture/about.md) | Project motivation, origin story, and long-term direction |
| [JIT-Accelerated Scripting](en/architecture/jit.md) | Batch bridge, Numba integration, auto-parallelization, and benchmark takeaways |
| [Technical Report](https://arxiv.org/pdf/2604.10263) | Full report: *Infernux: A Python-Native Game Engine with JIT-Accelerated Scripting* |

中文内容：[为什么会有 Infernux](zh/architecture/about.md) · [JIT 加速脚本](zh/architecture/jit.md) · [技术报告](https://arxiv.org/pdf/2604.10263)

## A minimal component

Infernux is an open-source game engine with a C++17 / Vulkan runtime and a Python production layer. Use Python for gameplay, tools, and iteration-heavy workflows while the engine handles rendering, physics, audio, and runtime ownership.

### Hello World

```python
from Infernux import *

class HelloWorld(InxComponent):
    speed: float = serialized_field(default=5.0)
    
    def start(self):
        Debug.log("Hello, Infernux!")
    
    def update(self, delta_time: float):
        self.transform.rotate(Vector3(0, self.speed * delta_time, 0))
```

See [Your First Component](en/learn/first-component.md) for where this file belongs, how to attach it, and how to verify the result.

## Modules

| Module | Description |
|--------|-------------|
| [Infernux](en/api/index.md) | Core types — GameObject, Transform, Scene, Component |
| [Infernux.components](en/api/InxComponent.md) | Component system — InxComponent, serialized_field, decorators |
| [Infernux.core](en/api/Material.md) | Assets — Material, Texture, Shader, AudioClip |
| [Infernux.coroutine](en/api/Coroutine.md) | Coroutines — WaitForSeconds, WaitUntil, WaitWhile |
| [Infernux.input](en/api/Input.md) | Input system — keyboard, mouse, touch |
| [Infernux.math](en/api/vector3.md) | Math — vector2, vector3, vector4, quaternion |
| [Infernux.mathf](en/api/Mathf.md) | Math utilities — clamp, lerp, smooth_step |
| [Infernux.physics](en/api/Physics.md) | Physics — Rigidbody, colliders, raycasting |
| [Infernux.rendergraph](en/api/RenderGraph.md) | Render graph — textures, passes, formats |
| [Infernux.renderstack](en/api/RenderStack.md) | Render stack — pipelines, post-processing effects |
| [Infernux.scene](en/api/SceneManager.md) | Scene management |
| [Infernux.timing](en/api/Time.md) | Time — delta_time, time_scale, frame timing |
| [Infernux.ui](en/api/UICanvas.md) | UI — Canvas, Text, Image, Button |
| [Infernux.debug](en/api/Debug.md) | Logging and diagnostics |
| [Infernux.gizmos](en/api/Gizmos.md) | Visual debugging aids |
