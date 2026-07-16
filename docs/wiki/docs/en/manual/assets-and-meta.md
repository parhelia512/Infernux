---
title: "Assets and `.meta` files"
description: "Explain project assets, GUID and path identity, .meta sidecars, typed references, import settings, safe move/delete operations, caching, and runtime loading."
category: Manual
tags: ["assets", "guid", "meta", "import", "material", "texture"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: ["Infernux.core.Texture","Infernux.core.Material","Infernux.ui.UIImage"]
agent_summary: "Explain project assets, GUID and path identity, .meta sidecars, typed references, import settings, safe move/delete operations, caching, and runtime loading."
source_paths: ["python/Infernux/core/assets.py", "python/Infernux/core/asset_ref.py", "python/Infernux/core/asset_types.py", "python/Infernux/engine/asset_reference_cleanup.py"]
---

# Assets and `.meta` files

An asset has two forms of identity: its current path and a stable GUID recorded through the asset database and sidecar metadata. Paths are useful to people; GUIDs let serialized references survive a rename or move.

```text
[INX-DIAGRAM:pipeline:Asset identity from source file to runtime object]
source file + matching .meta
             │ path + stable GUID + import settings
             ▼
        importer / reimport
             ▼
      Asset database + cache
             │
             ├── AssetRef: GUID + path_hint ── resolve ──┐
             └── project path ── AssetManager.load ──────┼──▶ typed runtime object

editor move / rename ── preserves GUID and updates references
raw .meta copy ── duplicates GUID ── breaks identity
```

## Project workflow

- Put project-owned content under the project's `Assets` hierarchy.
- Import, move, rename, reimport, and delete through the editor or `AssetManager` mutation APIs.
- Keep the asset and its `.meta` sidecar together in source control.
- Do not hand-copy one asset's `.meta` onto another asset; a duplicated GUID destroys identity.
- Review asset and metadata changes together in commits.

`AssetManager.move_asset()` is not equivalent to a raw filesystem move: it updates database state and references. `delete_asset()` also evicts loaded state and clears matching active component references. Use filesystem manipulation only for recovery with the editor closed and verify the result after rescan.

## References and loading

`AssetRefBase` stores a `guid` plus a human-readable `path_hint`. `TextureRef`, `MaterialRef`, `ShaderRef`, and `AudioClipRef` communicate the expected type. `resolve()` returns the current loaded object or `None` when missing.

For direct loading, use the unified manager:

```python
from Infernux.core.assets import AssetManager
from Infernux.core.texture import Texture

icon = AssetManager.load("Assets/UI/icon.png", Texture)
if icon is None:
    print("Icon could not be loaded")
```

`load_by_guid()` is appropriate when a stable serialized identifier is already available. `find_assets()` matches project assets by filename pattern. Loading is cached; call `invalidate_path`, `invalidate`, or `flush` only when tooling has changed files outside the normal import flow.

## Choose a reference path

| Situation | Use | Avoid |
|---|---|---|
| Serialized component field | typed `AssetRef` and GUID | storing only a fragile absolute path |
| Known project asset in setup code | `AssetManager.load(project_path, type)` | lower-level file loading that bypasses project identity |
| Existing serialized GUID | `load_by_guid()` or `resolve()` | guessing the asset's current path |
| External tool changed a source file | rescan/reimport, then targeted invalidation | flushing every asset during normal frame work |

## Import settings

Texture metadata includes type, wrap/filter mode, mipmap generation, sRGB interpretation, maximum size, and anisotropy. Audio and mesh assets have their own typed settings.

- Color textures normally use sRGB; data textures such as many masks do not.
- Normal maps should use the normal-map texture type.
- Generate mipmaps for textures viewed at varying distances; consider disabling them for fixed-resolution UI.
- Use clamp for UI edges and repeat only when tiling is intended.
- Apply settings through the Inspector or typed import-setting functions, then reimport.

## Materials and textures

`Texture.load()` is a lower-level file loader. `AssetManager.load()` adds project GUID resolution and caching, so it is the normal choice for project assets.

`Material` supports lit/unlit creation, cloning, shader properties, texture assignments, surface type, alpha clipping, render state, save, and explicit `flush()`. Prefer setting a material's texture from a GUID, project path, `Texture`, or `None` through `set_texture()` rather than reaching into its native object.

## Missing-reference diagnosis

1. Confirm the asset and `.meta` file both exist.
2. Check whether the GUID changed after copying or conflict resolution.
3. Reimport and inspect the mutation result instead of repeatedly reloading.
4. Confirm the reference type matches the asset category.
5. If a file changed outside the editor, invalidate its cache or trigger a rescan.
6. After deletion, expect matching active `AssetRefBase` fields to be cleared rather than silently pointing at another asset.

## Related reference

- [Texture](../api/Texture.md)
- [Material](../api/Material.md)
- [UIImage](../api/UIImage.md)
- [Build and Share](../learn/build-and-share.md)
