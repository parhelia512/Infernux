"""tag_layer_settings — Tags & Layers editor and physics collision matrix."""

from __future__ import annotations

from InfEngine.lib import InfGUIContext
from InfEngine.engine.ui.editor_panel import EditorPanel


class TagLayerSettingsPanel(EditorPanel):
    """Inspector-style panel for managing project-wide tags and layers.

    Usage::

        panel = TagLayerSettingsPanel()
        panel.set_project_path("C:/MyProject")
        panel.on_render_content(ctx)
    """

    def __init__(self) -> None: ...
    def set_project_path(self, path: str) -> None: ...
    def on_render_content(self, ctx: InfGUIContext) -> None: ...


class PhysicsLayerMatrixPanel:
    """Standalone floating panel for physics collision matrix editing.

    Usage::

        matrix = PhysicsLayerMatrixPanel()
        matrix.set_project_path("C:/MyProject")
        matrix.open()
        matrix.render(ctx)
    """

    def __init__(self) -> None: ...
    def set_project_path(self, path: str) -> None: ...

    @property
    def is_open(self) -> bool: ...

    def open(self) -> None: ...
    def close(self) -> None: ...
    def render(self, ctx: InfGUIContext) -> None: ...
