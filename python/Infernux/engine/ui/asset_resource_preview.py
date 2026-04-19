"""Unified resource preview renderer for editor UI.

This module is intentionally independent from ProjectPanel and can be reused by
any Python-side panel. It supports texture/material preview textures and
model/prefab scene previews via ResourcePreviewManager.
"""

from __future__ import annotations

import concurrent.futures
import os
import zlib
from dataclasses import dataclass
from typing import Any, Optional

from Infernux.debug import Debug


_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tga", ".gif", ".hdr", ".pic", ".psd"}
_MATERIAL_EXTS = {".mat"}
_MODEL_EXTS = {".fbx", ".obj", ".gltf", ".glb", ".dae", ".blend"}
_PREFAB_EXTS = {".prefab"}
_SCENE_PREVIEW_EXTS = _MODEL_EXTS | _PREFAB_EXTS


@dataclass
class _PreviewEntry:
    texture_id: int
    stamp: int
    cache_name: str
    width: int = 0
    height: int = 0


_PREVIEW_CACHE: dict[str, _PreviewEntry] = {}


@dataclass
class _PendingMaterialJob:
    future: Any
    cache_key: str
    cache_name: str
    stamp: int


_MATERIAL_PREVIEW_EXECUTOR: Optional[concurrent.futures.ThreadPoolExecutor] = None
_PENDING_MATERIAL_JOBS: dict[str, _PendingMaterialJob] = {}


@dataclass
class _ScenePreviewState:
    loaded_path: str = ""
    loaded_stamp: int = 0


_SCENE_PREVIEW_STATE = _ScenePreviewState()


def _meta_path_for(asset_path: str) -> str:
    return f"{asset_path}.meta"


def _safe_mtime_ns(path: str) -> int:
    try:
        return int(os.stat(path).st_mtime_ns)
    except OSError:
        return 0


def _texture_stamp(path: str) -> int:
    image_mtime = _safe_mtime_ns(path)
    meta_mtime = _safe_mtime_ns(_meta_path_for(path))
    return image_mtime ^ (meta_mtime * 2654435761)


def _material_stamp(path: str) -> int:
    return _safe_mtime_ns(path)


def _scene_asset_stamp(path: str) -> int:
    file_mtime = _safe_mtime_ns(path)
    meta_mtime = _safe_mtime_ns(_meta_path_for(path))
    return file_mtime ^ (meta_mtime * 2654435761)


def _resolve_native_engine(panel: Any) -> Any:
    try:
        from Infernux.engine.ui.editor_services import EditorServices

        svc = EditorServices.instance()
        native = svc.native_engine if svc else None
        if native:
            return native
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")

    if panel is not None and hasattr(panel, "get_native_engine"):
        try:
            return panel.get_native_engine()
        except Exception as exc:
            Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
    return None


def _remove_cached_native_texture(native: Any, cache_name: str) -> None:
    if not native or not cache_name:
        return
    try:
        if native.has_imgui_texture(cache_name):
            native.remove_imgui_texture(cache_name)
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")


def _resolve_preview_manager(native: Any) -> Any:
    if not native:
        return None
    try:
        return native.get_resource_preview_manager()
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
        return None


def _render_scene_preview_rect(ctx: Any, native: Any, file_path: str, ext: str, width: float, height: float) -> bool:
    manager = _resolve_preview_manager(native)
    if not manager:
        return False

    stamp = _scene_asset_stamp(file_path)
    if stamp == 0:
        return False

    try:
        if hasattr(manager, "has_previewer") and not manager.has_previewer(ext):
            return False
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")

    # Reload preview when target asset changed or import settings changed.
    if _SCENE_PREVIEW_STATE.loaded_path != file_path or _SCENE_PREVIEW_STATE.loaded_stamp != stamp:
        try:
            if _SCENE_PREVIEW_STATE.loaded_path:
                manager.unload_preview()
        except Exception as exc:
            Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")

        try:
            manager.load_preview(file_path)
            _SCENE_PREVIEW_STATE.loaded_path = file_path
            _SCENE_PREVIEW_STATE.loaded_stamp = stamp
        except Exception as exc:
            Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
            return False

    try:
        manager.render_preview(ctx, float(width), float(height))
        return True
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
        return False


def _nearest_downsample_rgba(src: list[int], src_w: int, src_h: int, max_px: int) -> tuple[list[int], int, int]:
    if max_px <= 0 or (src_w <= max_px and src_h <= max_px):
        return src, src_w, src_h

    scale = float(max_px) / float(max(src_w, src_h))
    dst_w = max(1, int(src_w * scale))
    dst_h = max(1, int(src_h * scale))

    dst = [0] * (dst_w * dst_h * 4)
    for dy in range(dst_h):
        sy = min(int((dy + 0.5) * src_h / dst_h), src_h - 1)
        row_off = sy * src_w * 4
        for dx in range(dst_w):
            sx = min(int((dx + 0.5) * src_w / dst_w), src_w - 1)
            src_idx = row_off + sx * 4
            dst_idx = (dy * dst_w + dx) * 4
            dst[dst_idx + 0] = src[src_idx + 0]
            dst[dst_idx + 1] = src[src_idx + 1]
            dst[dst_idx + 2] = src[src_idx + 2]
            dst[dst_idx + 3] = src[src_idx + 3]

    return dst, dst_w, dst_h


def _apply_srgb_preview(pixels: list[int]) -> list[int]:
    lut = [int(((i / 255.0) ** (1.0 / 2.2)) * 255.0 + 0.5) for i in range(256)]
    out = pixels[:]
    for i in range(0, len(out), 4):
        out[i + 0] = lut[out[i + 0]]
        out[i + 1] = lut[out[i + 1]]
        out[i + 2] = lut[out[i + 2]]
    return out


def _texture_settings_signature(texture_settings: Any) -> tuple[str, str, str]:
    if texture_settings is None:
        return ("default", "default", "0")

    filter_mode = getattr(texture_settings, "filter_mode", None)
    filter_tag = getattr(filter_mode, "name", str(filter_mode)) if filter_mode is not None else "default"
    srgb_tag = "srgb" if bool(getattr(texture_settings, "srgb", False)) else "linear"
    max_size = int(getattr(texture_settings, "max_size", 0) or 0)
    return (filter_tag, srgb_tag, str(max_size))


def _is_point_filter(texture_settings: Any) -> bool:
    if texture_settings is None:
        return False

    filter_mode = getattr(texture_settings, "filter_mode", None)
    mode_name = getattr(filter_mode, "name", "")
    return str(mode_name).upper() == "POINT"


def _stable_tag_hash(tag: str) -> int:
    if not tag:
        return 0
    return int(zlib.crc32(tag.encode("utf-8")) & 0xFFFFFFFF)


def _stable_mix_hash(*parts: str) -> int:
    seed = 0
    for p in parts:
        seed = int(zlib.crc32(str(p).encode("utf-8"), seed) & 0xFFFFFFFF)
    return seed


# Fixed render size for material previews
_MATERIAL_PREVIEW_RENDER_SIZE = 256
# Fixed render size for texture previews to keep one shared resource per texture.
_TEXTURE_PREVIEW_RENDER_SIZE = 256


def _ensure_material_preview_executor() -> concurrent.futures.ThreadPoolExecutor:
    global _MATERIAL_PREVIEW_EXECUTOR
    if _MATERIAL_PREVIEW_EXECUTOR is None:
        # Single worker keeps resource usage predictable and avoids overloading I/O/CPU.
        _MATERIAL_PREVIEW_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
            max_workers=1,
            thread_name_prefix="material-preview",
        )
    return _MATERIAL_PREVIEW_EXECUTOR


def _drain_pending_material_jobs(native: Any) -> None:
    if not _PENDING_MATERIAL_JOBS:
        return

    done_keys = []
    for key, job in _PENDING_MATERIAL_JOBS.items():
        if not job.future.done():
            continue
        done_keys.append(key)

        try:
            pixels = job.future.result()
        except Exception as exc:
            Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
            continue

        if not pixels:
            continue

        current = _PREVIEW_CACHE.get(job.cache_key)
        if current and current.stamp == job.stamp and current.texture_id:
            continue

        if current:
            _remove_cached_native_texture(native, current.cache_name)
            _PREVIEW_CACHE.pop(job.cache_key, None)

        try:
            tex_id = int(native.upload_texture_for_imgui(
                job.cache_name,
                list(pixels),
                _MATERIAL_PREVIEW_RENDER_SIZE,
                _MATERIAL_PREVIEW_RENDER_SIZE,
            ))
            if tex_id:
                _PREVIEW_CACHE[job.cache_key] = _PreviewEntry(
                    texture_id=tex_id,
                    stamp=job.stamp,
                    cache_name=job.cache_name,
                    width=_MATERIAL_PREVIEW_RENDER_SIZE,
                    height=_MATERIAL_PREVIEW_RENDER_SIZE,
                )
        except Exception as exc:
            Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")

    for key in done_keys:
        _PENDING_MATERIAL_JOBS.pop(key, None)


def _queue_material_preview_job(native: Any, norm_path: str, cache_key: str, cache_name: str, stamp: int) -> None:
    pending = _PENDING_MATERIAL_JOBS.get(cache_key)
    if pending and pending.stamp == stamp and not pending.future.done():
        return

    # Keep at most one in-flight job per resource key.
    if pending and not pending.future.done():
        return

    try:
        executor = _ensure_material_preview_executor()
        future = executor.submit(native.render_material_preview_pixels, norm_path, _MATERIAL_PREVIEW_RENDER_SIZE)
        _PENDING_MATERIAL_JOBS[cache_key] = _PendingMaterialJob(
            future=future,
            cache_key=cache_key,
            cache_name=cache_name,
            stamp=stamp,
        )
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")


def _try_get_cpp_material_preview_texture(native: Any, norm_path: str, stamp: int) -> int:
    if native is None:
        return 0
    if not all(hasattr(native, name) for name in (
        "schedule_material_preview_task",
        "pump_preview_tasks",
        "get_material_preview_texture_id",
    )):
        return 0

    cache_key = f"mat|{norm_path}"
    try:
        native.pump_preview_tasks()
        tex_id = int(native.get_material_preview_texture_id(cache_key, int(stamp)))
        if tex_id != 0:
            return tex_id
        native.schedule_material_preview_task(cache_key, norm_path, int(stamp), _MATERIAL_PREVIEW_RENDER_SIZE)
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
    return 0


def _try_get_cpp_texture_preview_texture(native: Any, norm_path: str, stamp: int,
                                         texture_settings: Optional[Any]) -> tuple[int, int, int]:
    if native is None:
        return (0, 0, 0)
    if not all(hasattr(native, name) for name in (
        "schedule_texture_preview_task",
        "pump_preview_tasks",
        "get_texture_preview_texture_id",
    )):
        return (0, 0, 0)

    cache_key = f"tex|{norm_path}"
    nearest = _is_point_filter(texture_settings)
    srgb = bool(getattr(texture_settings, "srgb", False)) if texture_settings is not None else False
    import_max = int(getattr(texture_settings, "max_size", 0) or 0) if texture_settings is not None else 0
    max_size = min(import_max, _TEXTURE_PREVIEW_RENDER_SIZE) if import_max > 0 else _TEXTURE_PREVIEW_RENDER_SIZE

    try:
        native.pump_preview_tasks()
        tex_id = int(native.get_texture_preview_texture_id(cache_key, int(stamp)))
        if tex_id != 0:
            width = _TEXTURE_PREVIEW_RENDER_SIZE
            height = _TEXTURE_PREVIEW_RENDER_SIZE
            if hasattr(native, "get_texture_preview_size"):
                try:
                    w, h = native.get_texture_preview_size(cache_key, int(stamp))
                    width = int(w)
                    height = int(h)
                except Exception as exc:
                    Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
            return (tex_id, max(1, width), max(1, height))
        native.schedule_texture_preview_task(cache_key, norm_path, int(stamp), int(max_size),
                                             bool(nearest), bool(srgb))
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
    return (0, 0, 0)


def get_resource_preview_texture_id(panel: Any, file_path: str, preview_size: int = 128,
                                    texture_settings: Optional[Any] = None,
                                    cache_tag: str = "",
                                    material_async: bool = True) -> int:
    """Return ImGui texture ID for a resource path.

    Supported texture-id extensions:
    - Textures: png/jpg/jpeg/bmp/tga/gif/hdr/pic/psd
    - Materials: mat

    Model/prefab previews are scene-based and rendered directly by
    ``render_resource_preview_rect``.
    """
    if not file_path:
        return 0

    native = _resolve_native_engine(panel)
    if not native:
        return 0

    norm_path = os.path.normpath(file_path)
    ext = os.path.splitext(norm_path)[1].lower()
    size = max(16, int(preview_size))

    if ext in _IMAGE_EXTS:
        stamp = _texture_stamp(norm_path)
        if stamp == 0:
            return 0

        filter_tag, srgb_tag, max_size_tag = _texture_settings_signature(texture_settings)
        # API contract: one resource -> one cache entry globally.
        # Settings/size changes update this single entry instead of creating variants.
        cache_key = f"tex|{norm_path}"
        cache_name = f"__resource_preview_tex__{cache_key}"
        setting_hash = _stable_mix_hash(filter_tag, srgb_tag, max_size_tag, str(_TEXTURE_PREVIEW_RENDER_SIZE))
        stamp = stamp ^ setting_hash

        entry = _PREVIEW_CACHE.get(cache_key)
        if entry and entry.stamp == stamp and entry.texture_id:
            return entry.texture_id

        cpp_tex_id, cpp_w, cpp_h = _try_get_cpp_texture_preview_texture(native, norm_path, stamp, texture_settings)
        if cpp_tex_id:
            _PREVIEW_CACHE[cache_key] = _PreviewEntry(
                texture_id=cpp_tex_id,
                stamp=stamp,
                cache_name=cache_name,
                width=max(1, int(cpp_w)),
                height=max(1, int(cpp_h)),
            )
            return cpp_tex_id

        # Keep showing stale texture while C++ task is in-flight.
        if entry and entry.texture_id:
            return entry.texture_id

        if entry:
            _remove_cached_native_texture(native, entry.cache_name)
            _PREVIEW_CACHE.pop(cache_key, None)

        try:
            from Infernux.lib import TextureLoader

            td = TextureLoader.load_from_file(norm_path)
            if not td or not td.is_valid():
                return 0

            pixels = td.get_pixels_list()
            width = int(td.width)
            height = int(td.height)

            if bool(getattr(texture_settings, "srgb", False)):
                pixels = _apply_srgb_preview(pixels)

            # Respect both import max_size and requested preview size.
            import_max = int(getattr(texture_settings, "max_size", 0) or 0)
            limit = min(x for x in (import_max, size) if x > 0) if (import_max > 0) else size
            pixels, width, height = _nearest_downsample_rgba(pixels, width, height, limit)

            tex_id = int(native.upload_texture_for_imgui(cache_name, pixels, width, height,
                                                         nearest=_is_point_filter(texture_settings)))
            if tex_id == 0:
                return 0

            _PREVIEW_CACHE[cache_key] = _PreviewEntry(texture_id=tex_id, stamp=stamp, cache_name=cache_name,
                                                      width=width, height=height)
            return tex_id
        except Exception as exc:
            Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
            return 0

    if ext in _MATERIAL_EXTS:
        # Material previews always use one fixed render size. External preview_size
        # is intentionally ignored to prevent cache fragmentation/stutter.
        # Important: when caller provides cache_tag (material inspector), avoid
        # depending on file mtime. Drag-editing material values may autosave the
        # .mat file every frame, and mtime-based invalidation would force expensive
        # re-rendering on every frame.
        tag_hash = _stable_tag_hash(cache_tag)
        if tag_hash != 0:
            stamp = tag_hash
        else:
            stamp = _material_stamp(norm_path)
            if stamp == 0:
                return 0

        # API contract: one resource -> one cache entry globally.
        # cache_tag only affects stamp (refresh decision), never cache identity.
        cache_key = f"mat|{norm_path}"
        cache_name = f"__resource_preview_mat__{cache_key}"

        # Prefer C++ task system (thread pool + task queue) when available.
        cpp_tex_id = _try_get_cpp_material_preview_texture(native, norm_path, stamp)
        if cpp_tex_id:
            _PREVIEW_CACHE[cache_key] = _PreviewEntry(
                texture_id=cpp_tex_id,
                stamp=stamp,
                cache_name=cache_name,
                width=_MATERIAL_PREVIEW_RENDER_SIZE,
                height=_MATERIAL_PREVIEW_RENDER_SIZE,
            )
            return cpp_tex_id

        existing = _PREVIEW_CACHE.get(cache_key)
        if existing and existing.texture_id:
            # While C++ task is running, keep showing the last ready texture.
            return existing.texture_id

        # Fallback: legacy Python-side async path for older native builds.
        _drain_pending_material_jobs(native)

        entry = _PREVIEW_CACHE.get(cache_key)
        if entry and entry.texture_id:
            if entry.stamp == stamp:
                return entry.texture_id

            if material_async:
                # Keep showing stale image while new preview is generated asynchronously.
                _queue_material_preview_job(native, norm_path, cache_key, cache_name, stamp)
                return entry.texture_id

            _remove_cached_native_texture(native, entry.cache_name)
            _PREVIEW_CACHE.pop(cache_key, None)

        if material_async:
            _queue_material_preview_job(native, norm_path, cache_key, cache_name, stamp)
            return 0

        try:
            pixels = native.render_material_preview_pixels(norm_path, _MATERIAL_PREVIEW_RENDER_SIZE)
            if not pixels:
                return 0
            tex_id = int(native.upload_texture_for_imgui(cache_name, list(pixels),
                                                         _MATERIAL_PREVIEW_RENDER_SIZE, _MATERIAL_PREVIEW_RENDER_SIZE))
            if tex_id == 0:
                return 0

            _PREVIEW_CACHE[cache_key] = _PreviewEntry(texture_id=tex_id, stamp=stamp, cache_name=cache_name,
                                                      width=_MATERIAL_PREVIEW_RENDER_SIZE, height=_MATERIAL_PREVIEW_RENDER_SIZE)
            return tex_id
        except Exception as exc:
            Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
            return 0

    return 0


def render_resource_preview_rect(ctx: Any, panel: Any, file_path: str, width: float, height: float,
                                 preview_size: int = 128, texture_settings: Optional[Any] = None,
                                 preserve_aspect: bool = False, center: bool = False,
                                 cache_tag: str = "") -> bool:
    """Render a resource preview image directly to ImGui rect.

    Returns True when preview was drawn; False means caller should draw fallback UI.
    """
    if not file_path:
        return False

    native = _resolve_native_engine(panel)
    if not native:
        return False

    norm_path = os.path.normpath(file_path)
    ext = os.path.splitext(norm_path)[1].lower()

    if ext in _SCENE_PREVIEW_EXTS:
        return _render_scene_preview_rect(ctx, native, norm_path, ext, width, height)

    tex_id = get_resource_preview_texture_id(panel, norm_path, preview_size=preview_size,
                                             texture_settings=texture_settings,
                                             cache_tag=cache_tag)
    if tex_id == 0:
        return False

    draw_w = float(width)
    draw_h = float(height)

    src_w = 0
    src_h = 0
    if preserve_aspect:
        # Inspector renders one preview at a time, so a tiny scan is acceptable.
        for entry in _PREVIEW_CACHE.values():
            if entry.texture_id == tex_id:
                src_w = int(entry.width)
                src_h = int(entry.height)
                break

        if src_w > 0 and src_h > 0:
            scale = min(float(width) / float(src_w), float(height) / float(src_h))
            draw_w = max(1.0, float(src_w) * scale)
            draw_h = max(1.0, float(src_h) * scale)

    if center:
        offset_y = max((float(height) - draw_h) * 0.5, 0.0)
        if offset_y > 0.0:
            ctx.dummy(1.0, offset_y)

        offset_x = max((float(width) - draw_w) * 0.5, 0.0)
        if offset_x > 0.0:
            ctx.set_cursor_pos_x(ctx.get_cursor_pos_x() + offset_x)

    ctx.image(tex_id, draw_w, draw_h)

    if center:
        remaining_y = max(float(height) - draw_h - max((float(height) - draw_h) * 0.5, 0.0), 0.0)
        if remaining_y > 0.0:
            ctx.dummy(1.0, remaining_y)

    return True


def invalidate_resource_preview(file_path: str) -> None:
    """Invalidate preview cache entries for one file path."""
    if not file_path:
        return
    norm = os.path.normpath(file_path)
    native = _resolve_native_engine(None)

    ext = os.path.splitext(norm)[1].lower()
    if native is not None:
        try:
            if ext in _IMAGE_EXTS and hasattr(native, "invalidate_texture_preview_task"):
                native.invalidate_texture_preview_task(f"tex|{norm}")
            if ext in _MATERIAL_EXTS and hasattr(native, "invalidate_material_preview_task"):
                native.invalidate_material_preview_task(f"mat|{norm}")
        except Exception as exc:
            Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")

    keys_to_drop = [
        k for k in _PREVIEW_CACHE.keys()
        if k == f"tex|{norm}"
        or k == f"mat|{norm}"
        or f"|{norm}|" in k
    ]
    for key in keys_to_drop:
        _PREVIEW_CACHE.pop(key, None)
        pending = _PENDING_MATERIAL_JOBS.pop(key, None)
        if pending and hasattr(pending.future, "cancel"):
            try:
                pending.future.cancel()
            except Exception as exc:
                Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")

    if _SCENE_PREVIEW_STATE.loaded_path == norm:
        _SCENE_PREVIEW_STATE.loaded_path = ""
        _SCENE_PREVIEW_STATE.loaded_stamp = 0


def invalidate_all_resource_previews() -> None:
    """Clear all Python-side preview cache entries."""
    _PREVIEW_CACHE.clear()
    for pending in list(_PENDING_MATERIAL_JOBS.values()):
        if hasattr(pending.future, "cancel"):
            try:
                pending.future.cancel()
            except Exception as exc:
                Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
    _PENDING_MATERIAL_JOBS.clear()
    _SCENE_PREVIEW_STATE.loaded_path = ""
    _SCENE_PREVIEW_STATE.loaded_stamp = 0
