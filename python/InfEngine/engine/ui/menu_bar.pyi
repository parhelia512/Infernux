"""menu_bar — top-level menu bar (File / Edit / Window / Help …)."""

from __future__ import annotations

from InfEngine.lib import InfGUIContext


class MenuBarPanel:
    """Main menu bar for the InfEngine Editor.

    Usage::

        bar = MenuBarPanel(app)
        bar.set_window_manager(wm)
        bar.set_scene_file_manager(sfm)
        bar.on_render(ctx)
    """

    def __init__(self, app: object) -> None: ...
    def set_window_manager(self, wm: object) -> None: ...
    def set_scene_file_manager(self, sfm: object) -> None: ...
    def on_render(self, ctx: InfGUIContext) -> None: ...
