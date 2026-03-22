"""status_bar — fixed-position status bar at the bottom of the editor."""

from __future__ import annotations

from InfEngine.lib import InfGUIContext


class StatusBarPanel:
    """Fixed-position status bar rendered at the very bottom of the display.

    Usage::

        bar = StatusBarPanel()
        bar.set_console_panel(console)
        bar.on_render(ctx)
    """

    def __init__(self) -> None: ...
    def set_console_panel(self, console_panel: object) -> None: ...
    def clear_counts(self) -> None: ...
    def on_render(self, ctx: InfGUIContext) -> None: ...
