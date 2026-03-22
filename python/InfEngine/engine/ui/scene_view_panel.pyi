"""SceneViewPanel — 3D viewport with camera controls and gizmos."""

from __future__ import annotations

from typing import Callable, Optional

from InfEngine.lib import InfGUIContext
from InfEngine.engine.ui.editor_panel import EditorPanel


class SceneViewPanel(EditorPanel):
    """3D scene viewport with orbit camera, transform gizmos, and picking."""

    def __init__(self, title: str = "Scene", engine: object = None) -> None: ...

    def set_engine(self, engine: object) -> None: ...
    def set_play_mode_manager(self, manager: object) -> None: ...
    def set_on_object_picked(self, callback: Callable) -> None: ...
    def set_on_box_select(self, callback: Callable) -> None: ...

    def reset_camera(self) -> None:
        """Reset camera to the default position and orientation."""
        ...

    def focus_on(self, x: float, y: float, z: float, distance: float = 10.0) -> None:
        """Smoothly fly the camera to look at position ``(x, y, z)``.

        Args:
            x: World X coordinate.
            y: World Y coordinate.
            z: World Z coordinate.
            distance: Camera distance from the target.
        """
        ...

    def fly_to_object(self, game_object: object) -> None:
        """Smoothly fly the camera to frame *game_object*."""
        ...

    def on_render_content(self, ctx: InfGUIContext) -> None: ...
