"""GameViewPanel — in-editor game preview viewport."""

from __future__ import annotations

from typing import Optional

from InfEngine.lib import InfGUIContext
from InfEngine.engine.play_mode import PlayModeManager
from InfEngine.engine.ui.editor_panel import EditorPanel


class GameViewPanel(EditorPanel):
    """Renders the game camera output with play/pause/step controls."""

    def __init__(
        self,
        title: str = "Game",
        engine: object = None,
        play_mode_manager: Optional[PlayModeManager] = None,
    ) -> None: ...

    def set_engine(self, engine: object) -> None: ...
    def set_play_mode_manager(self, manager: PlayModeManager) -> None: ...
    def on_render_content(self, ctx: InfGUIContext) -> None: ...
