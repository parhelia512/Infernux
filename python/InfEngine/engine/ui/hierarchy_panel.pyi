"""HierarchyPanel — scene object tree view."""

from __future__ import annotations

from typing import Callable, Optional

from InfEngine.lib import InfGUIContext
from InfEngine.engine.ui.editor_panel import EditorPanel


class HierarchyPanel(EditorPanel):
    """Displays the scene's GameObject hierarchy with drag-drop and context menus."""

    def __init__(self, title: str = "Hierarchy") -> None: ...

    def set_on_selection_changed(self, callback: Callable) -> None: ...
    def set_on_selection_changed_ui_editor(self, callback: Callable) -> None: ...
    def set_on_double_click_focus(self, callback: Callable) -> None: ...

    def set_ui_mode(self, enabled: bool) -> None:
        """Enter or exit UI editing mode.

        Args:
            enabled: ``True`` to filter to Canvas subtrees only.
        """
        ...

    @property
    def ui_mode(self) -> bool:
        """Whether UI editing mode is active."""
        ...

    def clear_selection(self) -> None: ...

    def set_selected_object_by_id(self, object_id: int) -> None:
        """Programmatically select a GameObject by its ID."""
        ...

    def expand_to_object(self, go: object) -> None:
        """Expand the tree to reveal *go* and its ancestors."""
        ...

    def get_selected_object(self) -> object:
        """Return the primary selected GameObject, or ``None``."""
        ...

    def get_selected_objects(self) -> list:
        """Return all selected GameObjects."""
        ...

    def on_render_content(self, ctx: InfGUIContext) -> None: ...
