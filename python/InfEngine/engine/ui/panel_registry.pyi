"""PanelRegistry — decorator-based panel registration system.

Example::

    from InfEngine.engine.ui.panel_registry import editor_panel, PanelRegistry

    @editor_panel(type_id="my_debug", display_name="Debug Tools", menu_path="Window/Debug")
    class MyPanel(EditorPanel):
        def on_render_content(self, ctx):
            ctx.text("Hello!")
"""

from __future__ import annotations

from typing import Callable, List, Optional, Type

from InfEngine.engine.ui.window_manager import WindowManager


class _PanelRegistration:
    type_id: str
    display_name: str
    menu_path: Optional[str]
    cls: type
    factory: Optional[Callable]

    def __init__(
        self,
        type_id: str,
        display_name: str,
        menu_path: Optional[str],
        cls: type,
        factory: Optional[Callable] = None,
    ) -> None: ...


class PanelRegistry:
    """Global registry of @editor_panel-decorated panel classes."""

    @classmethod
    def get_registrations(cls) -> List[_PanelRegistration]:
        """Return all registered panel definitions."""
        ...

    @classmethod
    def apply_all(cls, window_manager: WindowManager) -> int:
        """Flush all registrations into *window_manager*.

        Returns:
            Number of panels registered.
        """
        ...

    @classmethod
    def clear(cls) -> None:
        """Clear all registrations (for testing)."""
        ...


def editor_panel(
    *,
    type_id: str,
    display_name: str,
    menu_path: Optional[str] = None,
    factory: Optional[Callable] = None,
) -> Callable[[Type], Type]:
    """Class decorator that registers an :class:`EditorPanel` subclass.

    Args:
        type_id: Unique string identifier for the panel type.
        display_name: Human-readable name shown in the Window menu.
        menu_path: Optional ``"Window/SubMenu/Name"`` menu placement.
        factory: Optional zero-arg callable that creates instances.

    Returns:
        The decorated class (unchanged).
    """
    ...
