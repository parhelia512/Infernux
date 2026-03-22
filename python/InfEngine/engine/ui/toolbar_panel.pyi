"""toolbar_panel — play/pause/stop controls and gizmo tool buttons."""

from __future__ import annotations

from typing import Optional

from InfEngine.lib import InfGUIContext
from InfEngine.engine.ui.editor_panel import EditorPanel


class ToolbarPanel(EditorPanel):
    """Toolbar panel with play/pause/stop and gizmo tool selection.

    Usage::

        toolbar = ToolbarPanel(engine=eng, play_mode_manager=pm)
        toolbar.on_render_content(ctx)
    """

    WINDOW_TYPE_ID: str
    WINDOW_DISPLAY_NAME: str

    def __init__(
        self,
        title: str = "Toolbar",
        engine: object = None,
        play_mode_manager: Optional[object] = None,
    ) -> None: ...
    def set_engine(self, engine: object) -> None: ...
    def set_play_mode_manager(self, manager: object) -> None: ...
    def on_render_content(self, ctx: InfGUIContext) -> None: ...
