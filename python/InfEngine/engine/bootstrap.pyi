"""EditorBootstrap — structured editor initialization.

Orchestrates the full editor startup sequence (JIT pre-compilation,
renderer init, manager creation, panel wiring, layout persistence, etc.).

Typically invoked via :func:`InfEngine.engine.release_engine`.
"""

from __future__ import annotations

from typing import Optional

from InfEngine.engine.engine import Engine, LogLevel
from InfEngine.engine.scene_manager import SceneFileManager
from InfEngine.engine.ui.window_manager import WindowManager
from InfEngine.engine.ui.editor_services import EditorServices
from InfEngine.engine.ui.event_bus import EditorEventBus
from InfEngine.engine.ui.hierarchy_panel import HierarchyPanel
from InfEngine.engine.ui.inspector_panel import InspectorPanel
from InfEngine.engine.ui.console_panel import ConsolePanel
from InfEngine.engine.ui.scene_view_panel import SceneViewPanel
from InfEngine.engine.ui.game_view_panel import GameViewPanel
from InfEngine.engine.ui.project_panel import ProjectPanel
from InfEngine.engine.ui.ui_editor_panel import UIEditorPanel


class EditorBootstrap:
    """Orchestrates the full editor startup sequence.

    Example::

        bootstrap = EditorBootstrap("/path/to/project", LogLevel.Info)
        bootstrap.run()
        bootstrap.engine.show()
        bootstrap.engine.run()
    """

    project_path: str
    engine_log_level: LogLevel

    engine: Optional[Engine]
    undo_manager: object
    scene_file_manager: Optional[SceneFileManager]
    window_manager: Optional[WindowManager]
    services: Optional[EditorServices]
    event_bus: Optional[EditorEventBus]

    hierarchy: Optional[HierarchyPanel]
    inspector_panel: Optional[InspectorPanel]
    project_panel: Optional[ProjectPanel]
    console: Optional[ConsolePanel]
    scene_view: Optional[SceneViewPanel]
    game_view: Optional[GameViewPanel]
    ui_editor: Optional[UIEditorPanel]

    def __init__(self, project_path: str, engine_log_level: LogLevel = ...) -> None: ...

    def run(self) -> None:
        """Execute all bootstrap phases and prepare the main loop."""
        ...
