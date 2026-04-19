"""Resource preview bridge for editor UI.

This module intentionally keeps only a thin Python wrapper and delegates
preview generation/caching to the native C++ preview task system.
"""

from __future__ import annotations

import os
import zlib
from typing import Any, Optional

from Infernux.debug import Debug


_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tga", ".gif", ".hdr", ".pic", ".psd"}
_MATERIAL_EXTS = {".mat"}
_MODEL_EXTS = {".fbx", ".obj", ".gltf", ".glb", ".dae", ".blend"}
_PREFAB_EXTS = {".prefab"}

_MATERIAL_PREVIEW_RENDER_SIZE = 256
_TEXTURE_PREVIEW_RENDER_SIZE = 256


def _meta_path_for(asset_path: str) -> str:
    return f"{asset_path}.meta"


def _safe_mtime_ns(path: str) -> int:
    try:
        return int(os.stat(path).st_mtime_ns)
    except OSError:
        return 0


_U64 = 0xFFFFFFFFFFFFFFFF  # mask for C++ uint64_t


def _texture_stamp(path: str) -> int:
    image_mtime = _safe_mtime_ns(path)
    meta_mtime = _safe_mtime_ns(_meta_path_for(path))
    # Truncate to uint64_t: meta_mtime * 2654435761 can exceed uint64_t in Python ints
    return int((image_mtime ^ ((meta_mtime * 2654435761) & _U64)) & _U64)


def _material_stamp(path: str) -> int:
    return _safe_mtime_ns(path)


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


def _try_pump_preview_tasks(native: Any) -> None:
    if native is None or not hasattr(native, "pump_preview_tasks"):
        return
    try:
        native.pump_preview_tasks()
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")


def _texture_preview_stamp(norm_path: str, texture_settings: Optional[Any]) -> int:
    stamp = _texture_stamp(norm_path)
    if stamp == 0:
        return 0

    filter_tag, srgb_tag, max_size_tag = _texture_settings_signature(texture_settings)
    setting_hash = _stable_mix_hash(filter_tag, srgb_tag, max_size_tag, str(_TEXTURE_PREVIEW_RENDER_SIZE))
    return int((stamp ^ setting_hash) & _U64)


def _try_get_cpp_texture_preview_texture(native: Any, norm_path: str, stamp: int,
                                         texture_settings: Optional[Any]) -> int:
    if native is None:
        return 0
    if not all(hasattr(native, name) for name in (
        "schedule_texture_preview_task",
        "pump_preview_tasks",
        "get_texture_preview_texture_id",
    )):
        return 0

    cache_key = f"tex|{norm_path}"
    nearest = _is_point_filter(texture_settings)
    srgb = bool(getattr(texture_settings, "srgb", False)) if texture_settings is not None else False
    import_max = int(getattr(texture_settings, "max_size", 0) or 0) if texture_settings is not None else 0
    max_size = min(import_max, _TEXTURE_PREVIEW_RENDER_SIZE) if import_max > 0 else _TEXTURE_PREVIEW_RENDER_SIZE

    try:
        native.pump_preview_tasks()
        tex_id = int(native.get_texture_preview_texture_id(cache_key, int(stamp)))
        if tex_id != 0:
            return tex_id
        native.schedule_texture_preview_task(cache_key, norm_path, int(stamp), int(max_size), bool(nearest), bool(srgb))
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
    return 0


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


def _try_get_cpp_texture_preview_size(native: Any, norm_path: str, stamp: int) -> tuple[int, int]:
    if native is None or not hasattr(native, "get_texture_preview_size"):
        return (0, 0)

    try:
        w, h = native.get_texture_preview_size(f"tex|{norm_path}", int(stamp))
        return (max(1, int(w)), max(1, int(h)))
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")
        return (0, 0)


def get_resource_preview_texture_id(panel: Any, file_path: str, preview_size: int = 128,
                                    texture_settings: Optional[Any] = None,
                                    cache_tag: str = "",
                                    material_async: bool = True) -> int:
    """Return ImGui texture ID for a resource path.

    This function only delegates to native C++ preview tasks.
    """
    _ = preview_size
    _ = material_async

    if not file_path:
        return 0

    native = _resolve_native_engine(panel)
    if not native:
        return 0

    norm_path = os.path.normpath(file_path)
    ext = os.path.splitext(norm_path)[1].lower()

    if ext in _IMAGE_EXTS:
        stamp = _texture_preview_stamp(norm_path, texture_settings)
        if stamp == 0:
            return 0
        return _try_get_cpp_texture_preview_texture(native, norm_path, stamp, texture_settings)

    if ext in _MATERIAL_EXTS:
        tag_hash = _stable_tag_hash(cache_tag)
        stamp = tag_hash if tag_hash != 0 else _material_stamp(norm_path)
        if stamp == 0:
            return 0
        return _try_get_cpp_material_preview_texture(native, norm_path, stamp)

    # model / prefab previews are intentionally removed from Python side.
    return 0


def render_resource_preview_rect(ctx: Any, panel: Any, file_path: str, width: float, height: float,
                                 preview_size: int = 128, texture_settings: Optional[Any] = None,
                                 preserve_aspect: bool = False, center: bool = False,
                                 cache_tag: str = "") -> bool:
    """Render a resource preview image directly to an ImGui rect."""
    if not file_path:
        return False

    native = _resolve_native_engine(panel)
    if not native:
        return False

    norm_path = os.path.normpath(file_path)
    ext = os.path.splitext(norm_path)[1].lower()

    # model / prefab previews are intentionally disabled in Python bridge.
    if ext in _MODEL_EXTS or ext in _PREFAB_EXTS:
        return False

    tex_id = get_resource_preview_texture_id(
        panel,
        norm_path,
        preview_size=preview_size,
        texture_settings=texture_settings,
        cache_tag=cache_tag,
    )
    if tex_id == 0:
        return False

    draw_w = float(width)
    draw_h = float(height)

    src_w = 0
    src_h = 0
    if preserve_aspect and ext in _IMAGE_EXTS:
        stamp = _texture_preview_stamp(norm_path, texture_settings)
        if stamp != 0:
            src_w, src_h = _try_get_cpp_texture_preview_size(native, norm_path, stamp)
    elif preserve_aspect and ext in _MATERIAL_EXTS:
        src_w = _MATERIAL_PREVIEW_RENDER_SIZE
        src_h = _MATERIAL_PREVIEW_RENDER_SIZE

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
    """Invalidate native preview task/cache entries for one file path."""
    if not file_path:
        return

    norm = os.path.normpath(file_path)
    native = _resolve_native_engine(None)
    if native is None:
        return

    ext = os.path.splitext(norm)[1].lower()
    try:
        if ext in _IMAGE_EXTS and hasattr(native, "invalidate_texture_preview_task"):
            native.invalidate_texture_preview_task(f"tex|{norm}")
        if ext in _MATERIAL_EXTS and hasattr(native, "invalidate_material_preview_task"):
            native.invalidate_material_preview_task(f"mat|{norm}")
    except Exception as exc:
        Debug.log(f"[Suppressed] {type(exc).__name__}: {exc}")


def invalidate_all_resource_previews() -> None:
    """Best-effort flush point for native previews.

    Native layer currently exposes per-resource invalidation only, so we just
    pump pending tasks to converge queued work.
    """
    native = _resolve_native_engine(None)
    _try_pump_preview_tasks(native)
