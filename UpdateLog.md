# Infernux v0.2.9 · 0.3.0 Preview

This preview is the first large architecture update after `v0.2.1`. It rebuilds the scene, asset, rendering, physics, editor, automation, and distribution paths around stricter native data ownership while keeping Python as the public gameplay and tooling layer. It also adds new VFX, capture, build, and agent-facing workflows instead of being an MCP-only release.

**Baseline for comparison:** [`v0.2.1...029/030preview`](https://github.com/ChenlizheMe/Infernux/compare/v0.2.1...029/030preview)

---

### Scene data, serialization, and asset pipeline

* **Introduced typed Scene and Component documents** with stable object/component identities, strict validation, Python value codecs, missing-script recovery, and transactional publication or rollback.
* **Added native atomic document storage and asynchronous scene reads**, including dependency preflight, owner-thread commit boundaries, prefab-safe reference remapping, and stronger undo reconstruction.
* **Reworked the AssetDatabase around indexed records and dependency tracking**, with coordinated imports, artifact-backed meshes/textures/skinned meshes, safer rename/delete handling, and stable material and physical-material references.
* **Improved runtime isolation and Play Mode transitions.** Entering Play now refreshes the Python scripting domain without rebuilding an unchanged native graph; Stop restores the complete authored snapshot through the transaction path.

### Rendering, VFX, and capture

* **Expanded the render graph and RHI boundaries** with explicit upload/residency accounting, asynchronous transfer publication, transient resource tracking, multi-camera state, and clearer ScriptableRenderContext contracts.
* **Reworked material, texture, mesh, and preview lifetime management**, fixing stale previews, descriptor pressure, delayed Inspector updates, and resource replacement races.
* **Added the first VFX Graph and particle runtime**, including typed VFX assets, compiler validation, renderer submission, and scene/game camera support.
* **Added engine-native capture paths** for the full editor, individual editor views, and game cameras. Capture does not depend on Windows screen APIs and remains compatible with hidden/headless rendering.
* **Removed compute-shader authoring support.** Parallel compute is intentionally routed toward external Python-compatible backends instead of extending the old compute-shader path.

### Physics and large-scene performance

* **Moved transform, component, and physics state toward contiguous native stores**, with generation-safe handles, batched transform synchronization, deferred collider creation, and Jolt batch broadphase publication.
* **Expanded collider and Rigidbody correctness**, including physical materials, scene reload/rebinding behavior, contact lifecycle fixes, mesh cooking, runtime force delivery, and stricter serialized validation.
* **Improved large-scene rendering and simulation stability** through cached scene queries, render submission batching, static/dynamic body handling, and reduced Python/native round trips.
* **PerformanceLab Play/Stop no longer rebuilds 10,000 unchanged native objects on entry.** Measured internal transition cost fell from roughly `1.21s / 0.79s` to `0.43s / 0.59s` for Play/Stop, with repeated 10,001-collider cycles producing no runtime errors.

### Editor and runtime UI

* **Unified dirty-document, Save, Save As, close, and exit confirmation behavior** across scenes and asset editors, including focused-panel `Ctrl+S`, native file dialogs for people, and explicit paths for agent operations.
* **Improved Project, Inspector, Console, Hierarchy, menus, and window state**, with native fast paths, cached plans, better focus/close interception, semantic control metadata, and lower per-frame polling overhead.
* **Expanded Unity-style Screen UI behavior**, including Canvas collection caches, persistent Button event targets, first-click Game View focus, runtime input routing, and editor-visible interaction semantics.
* **Cached stable Screen UI rectangles and GPU command packets.** SystemsLab increased from about `150 FPS` to `265 FPS` in the packaged Release wheel while retaining invalidation for text, geometry, and button-state changes.
* **Improved animation, timeline, node graph, and VFX editor consistency**, including shared graph interaction behavior, corrected timeline preview/runtime paths, and more predictable document switching.

### Python API and agent validation

* **Kept Python as the public engine surface while tightening C++ ownership.** Public stubs, component identity, references, render APIs, physics settings, and parallel-backend contracts were expanded and validated.
* **Added a two-mode MCP workflow** for developer assistance and global validation, with semantic editor controls, deterministic input injection, frame/time-bounded runtime actions, transactions, checkpoints, blocker reports, and executable API guidance.
* **Agent control remains editor-side.** MCP is not exported into built games; player validation is launched and supervised from the editor so release games do not carry the development service.
* **Added logic-first automated validation and optional recording/capture artifacts** so agents can reproduce editor and gameplay workflows while human reviewers retain visual evidence.

### Build and distribution

* **Release presets now enforce the packaged runtime path**, clean Python build artifacts and source metadata, verify native wheel payloads, and build the Windows launcher with Release LTO/IPO.
* **Added a wheel-distributed Player Runtime Pack** so projects do not compile Nuitka dependencies on first use. Core and optional parallel modules are staged as Deflate-compressed archives and expanded only when required.
* **Reorganized game exports** around a native launcher, private engine runtime, public data directory, and compressed `Content.inxpkg` instead of exposing the source package layout directly.
* **Parallel support is prepared by Release builds by default** but included in a game only when its build settings require the independent Numba/LLVM module.

---

### Preview notes

* This branch is a `0.3.0` preview, not the final stable release. Scene/component documents, runtime packs, VFX, and MCP contracts are substantially newer than `v0.2.1` and should be tested on copies of important projects.
* Compute shaders are no longer accepted by the public shader API; use graphics shader stages or an external parallel backend.
* Restart the editor after installing a newly built wheel so Python modules, native bindings, and runtime-pack metadata come from the same build.
* Current verification: Release preset build succeeded, the packaged wheel passed SystemsLab and PerformanceLab validation, and the repository test suite completed with `1938 passed, 1 skipped`.
