"""Constant-time invalidation for cached runtime UI command lists."""

from __future__ import annotations


_runtime_ui_revision = 1


def mark_runtime_ui_dirty() -> int:
    """Invalidate runtime UI command lists after a visual state mutation."""
    global _runtime_ui_revision
    _runtime_ui_revision += 1
    return _runtime_ui_revision


def get_runtime_ui_revision() -> int:
    """Return the current process-wide runtime UI revision."""
    return _runtime_ui_revision
