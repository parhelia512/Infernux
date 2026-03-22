"""Type stubs for InfEngine.ui.ui_texture_cache — shared UI texture cache."""

from __future__ import annotations

from typing import Any, Callable, Optional


class UITextureCache:
    """GUID-keyed texture-path -> ImGui-texture-ID cache.

    Call ``get(engine, tex_path)`` from any panel.  The cache is shared
    as a module-level singleton via ``get_shared_cache()``.
    """

    def __init__(self) -> None: ...

    def get(self, engine: Any, tex_path: str) -> int:
        """Return the ImGui texture ID for *tex_path*, loading if needed.

        Args:
            engine: The Engine instance for native texture upload.
            tex_path: Project-relative path to the texture file.

        Returns:
            An ImGui texture ID (> 0 on success, 0 on failure).
        """
        ...

    def get_bound(self, engine: Any) -> Callable[[str], int]:
        """Return a callable ``f(tex_path) -> tid`` bound to *engine*.

        Avoids creating a fresh lambda every frame.
        """
        ...

    def invalidate(self, identifier: Optional[str] = ...) -> None:
        """Drop cached entries.

        Args:
            identifier: A GUID or file path to invalidate, or ``None``
                to clear the entire cache.
        """
        ...


def get_shared_cache() -> UITextureCache:
    """Return (creating if needed) the module-level shared cache singleton."""
    ...
