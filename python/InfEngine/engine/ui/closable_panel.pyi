"""ClosablePanel — base class for dockable ImGui windows.

Provides open/close state management, window-manager integration,
and focus tracking. Subclassed by :class:`EditorPanel`.
"""

from __future__ import annotations

from typing import Callable, Optional

from InfEngine.lib import InfGUIRenderable, InfGUIContext


class ClosablePanel(InfGUIRenderable):
    """A dockable ImGui window with open/close lifecycle."""

    def __init__(self, title: str, window_id: Optional[str] = None) -> None: ...

    @property
    def window_id(self) -> str:
        """Unique window identifier used by the window manager."""
        ...

    @property
    def is_open(self) -> bool:
        """Whether the panel is currently visible."""
        ...

    def set_window_manager(self, window_manager: object) -> None: ...

    def open(self) -> None:
        """Show the panel (registers with window manager if needed)."""
        ...

    def request_focus(self, ctx: InfGUIContext) -> None:
        """Request ImGui keyboard focus for this panel."""
        ...

    @classmethod
    def set_on_panel_focus_changed(cls, callback: Optional[Callable[[str, str], None]]) -> None:
        """Register a global callback for panel focus changes.

        Args:
            callback: ``(old_panel_id, new_panel_id)`` handler.
        """
        ...

    @classmethod
    def get_active_panel_id(cls) -> Optional[str]:
        """Return the ``window_id`` of the currently focused panel."""
        ...

    @classmethod
    def focus_panel_by_id(cls, panel_id: str) -> None:
        """Programmatically focus a panel by its ``window_id``."""
        ...
