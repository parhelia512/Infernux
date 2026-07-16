<p align="center">
  <img src="docs/assets/logo.png" alt="Infernux logo" width="128" />
</p>

<h1 align="center">Infernux · 熔炉</h1>

<p align="center">
  <strong>A Python-native game engine with a C++17 / Vulkan runtime.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/version-0.2.9-orange.svg" alt="Version 0.2.9" />
  <img src="https://img.shields.io/badge/status-0.3.0_preview-yellow.svg" alt="0.3.0 preview" />
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/python-3.12+-brightgreen.svg" alt="Python" />
  <img src="https://img.shields.io/badge/C%2B%2B-17-blue.svg" alt="C++ 17" />
  <img src="https://img.shields.io/badge/graphics-Vulkan-red.svg" alt="Vulkan" />
</p>

<p align="center">
  <a href="README-zh.md">中文</a> ·
  <a href="https://infernux-engine.com/">Website</a> ·
  <a href="https://infernux-engine.com/wiki.html">Documentation</a> ·
  <a href="https://github.com/ChenlizheMe/Infernux/releases">Releases</a> ·
  <a href="https://arxiv.org/pdf/2604.10263">Technical Report</a>
</p>

<p align="center">
  <img src="docs/assets/demo.png" alt="Infernux editor rendering a 10,000-object scene" width="100%" />
</p>

## What Infernux Is

Infernux is an open-source game engine built around a native C++ runtime and a public Python production layer. Rendering, resource ownership, physics, scene state, and platform work stay native; gameplay, editor extensions, content workflows, render authoring, and external tools remain easy to inspect and iterate in Python through pybind11.

The project is intentionally not a sealed editor with a scripting attachment. Python is a first-class engine surface, which makes ordinary game code approachable and gives projects direct access to the wider Python ecosystem, including AI, vision, simulation, and data tooling.

Infernux is currently a Windows-first technical preview. The editor and runtime are usable, but data formats and newer APIs may still change before `0.3.0`.

## 0.2.9: A 0.3.0 Preview

Version `0.2.9` is the first large architecture update after `0.2.1`. It is not only an MCP update: scene documents, serialization, assets, rendering, physics, editor behavior, automation, and game distribution were all reworked around stricter ownership and more predictable runtime boundaries.

Highlights include:

- Typed Scene and Component documents with stable identities, validation, missing-script recovery, and transactional publication or rollback.
- Indexed asset records, dependency tracking, artifact-backed imports, and safer material, mesh, texture, and physical-material references.
- Expanded RenderGraph/RHI ownership, asynchronous transfer publication, multi-camera state, and repaired resource and preview lifetimes.
- A first VFX Graph and particle runtime with typed assets, compiler validation, and Scene/Game camera support.
- Batched native transform and Jolt physics paths for large scenes, including more reliable Play/Stop restoration and scene reloads.
- Unified dirty-document, Save, Save As, close, and exit behavior across scenes and asset editors.
- A smaller, structured game export with a native launcher, private runtime, compressed `Content.inxpkg`, and a wheel-distributed Player Runtime Pack.
- Engine-native capture for the full editor, individual views, and game cameras without relying on desktop screenshots.

See [UpdateLog.md](UpdateLog.md) for the complete release notes and migration warnings.

## Architecture

| Layer | Responsibility |
|:------|:---------------|
| C++17 / Vulkan | Rendering, resource ownership, scene state, physics, audio, platform services |
| pybind11 | Typed native handles and APIs exposed to Python |
| Python | Gameplay, components, editor logic, automation, content pipelines, render authoring |

The rule is simple: performance-sensitive state belongs to C++, while the public production workflow remains in Python. Native handles use stable identity and generation checks; document and asset changes cross explicit transaction boundaries instead of depending on arbitrary Python object lifetime.

## Systems

| Area | Current scope |
|:-----|:--------------|
| Rendering | Vulkan forward/deferred paths, PBR, cascaded shadows, MSAA, post-processing, RenderGraph, RenderStack |
| Physics | Jolt rigidbodies, primitive and mesh colliders, physical materials, queries, callbacks, layer filtering |
| Assets | GUID identity, dependency indexing, import artifacts, materials, prefabs, scenes, animation and VFX assets |
| Editor | Hierarchy, Inspector, Scene/Game views, Project, Console, UI editor, animation, timeline, VFX, build settings |
| Animation | 2D clips, skeletal playback, skinned meshes, FBX takes, state machines, timeline workflows |
| Runtime UI | Canvas, Text, Image, Button, pointer input, persistent component-method event bindings |
| Python | Component lifecycle, serialized fields, coroutines, reload support, public render and physics APIs |
| Distribution | Hub, Windows installer, wheel, compressed runtime pack, standalone game export |

Compute-shader authoring has been removed from the public shader path. Future general-purpose parallel computation is intended to integrate with Python-compatible backends rather than extend the former compute-shader API.

## MCP Harness

The repository includes an editor-side MCP Harness for deterministic engine development and validation. It was created to reduce the testing bottleneck of a project that is, in the strict sense, still maintained by one person.

The current workflow is deliberately restrained: AI may perform small implementation and test iterations, while a human reviews the changes and makes the engineering decisions. The Harness began as a way to let a developer agent operate a project through public engine APIs, but the same feedback loop also proved useful for finding and iterating engine defects.

It supports two distinct modes:

- **Developer assistance:** inspect semantic editor state, edit assets and scenes through public APIs, and help build a project.
- **Validation and blocker reporting:** inject frame/time-bounded input, pause deterministically, inspect state, create checkpoints, and report where a normal developer workflow becomes blocked.

Capture and recording are optional evidence for human review, not the primary control loop. MCP remains an editor development service and is not embedded into exported games.

## Quick Start

### Requirements

| Dependency | Windows |
|:-----------|:--------|
| OS | Windows 10/11, 64-bit |
| Python | 3.12+ |
| Vulkan SDK | 1.3+ |
| CMake | 3.22+ |
| Compiler | Visual Studio 2022, MSVC v143 |

macOS and Linux presets exist for ongoing platform work, but Windows is the primary supported development and distribution target for this preview.

### Clone and prepare

```bash
git clone --recurse-submodules https://github.com/ChenlizheMe/Infernux.git
cd Infernux
conda create -n infernux python=3.12 -y
conda activate infernux
pip install -r requirements.txt
```

If the repository was cloned without submodules:

```bash
git submodule update --init --recursive
```

### Configure and build

Use the checked-in CMake presets rather than an ad hoc build directory:

```bash
conda activate infernux
cmake --preset release
cmake --build --preset release
```

For a development build, use the `debug` configure and build presets. Platform presets include `release-macos`, `debug-macos`, `release-linux`, and `debug-linux`.

### Launch the Hub

```bash
conda activate infernux
python packaging/launcher.py
```

### Run tests

```bash
conda activate infernux
cd python
python -m pytest test/ -v
```

## Documentation

- Website: <https://infernux-engine.com/>
- Documentation hub: <https://infernux-engine.com/wiki.html>
- Technical report: [Infernux: A Python-Native Game Engine with JIT-Accelerated Scripting](https://arxiv.org/pdf/2604.10263)
- API reference: published under `docs/wiki/site/`

The publishing workflow consumes the checked-in API Markdown and regenerates the static documentation, indexes, localized bundles, sitemap, and service worker. Regenerate API source Markdown intentionally with `update_api_docs.bat`; website publication does not silently rewrite the public API baseline.

Local static documentation build:

```bash
conda activate infernux
python -m mkdocs build --clean -f docs/wiki/mkdocs.yml
```

Equivalent CMake targets include `generate_api_docs` and `build_wiki_html`.

## Packaging

Release builds prepare the native wheel and compressed Player Runtime Pack. Optional parallel-runtime payloads are prepared by Release builds but are included in a game only when its build settings require them.

```bash
conda activate infernux
cmake --build --preset packaging
cmake --build --preset packaging-installer
```

The first command builds the portable Hub bundle. The second builds the Windows installer. Exported games use a native launcher and a private runtime instead of exposing the repository's Python package layout.

## Citation

```bibtex
@software{chen2026infernux,
  author  = {Chen, Lizhe},
  title   = {Infernux},
  year    = {2026},
  version = {0.2.9},
  url     = {https://github.com/ChenlizheMe/Infernux},
  note    = {Open-source game engine with a C++17/Vulkan runtime and a Python production layer}
}
```

## Contributing

Bug reports, feature requests, and workflow feedback are welcome. Include the engine version, environment, reproduction steps, and whether the problem appears in the native runtime, Python layer, editor, or packaging path.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [SUPPORT.md](SUPPORT.md).

## License

Infernux is released under the [MIT License](LICENSE).
