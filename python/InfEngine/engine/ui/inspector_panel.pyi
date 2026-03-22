"""InspectorPanel — property inspector for GameObjects and assets."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from InfEngine.lib import InfGUIContext
from InfEngine.engine.ui.editor_panel import EditorPanel


class InspectorMode(Enum):
    OBJECT = ...
    FILE = ...
    DETAIL = ...


class InspectorPanel(EditorPanel):
    """Displays and edits properties of the selected object or asset."""

    def __init__(self, title: str = "Inspector", engine: object = None) -> None: ...

    def set_engine(self, engine: object) -> None: ...

    def set_selected_object(self, obj: object) -> None:
        """Set the currently inspected GameObject (or ``None`` to clear).

        Args:
            obj: A ``GameObject`` or ``None``.
        """
        ...

    def set_selected_file(self, file_path: str) -> None:
        """Switch to asset inspector mode for *file_path*."""
        ...

    def set_detail_file(self, file_path: str) -> None:
        """Open a secondary file detail view."""
        ...

    def on_render_content(self, ctx: InfGUIContext) -> None: ...
