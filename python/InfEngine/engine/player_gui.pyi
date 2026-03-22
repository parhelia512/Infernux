"""PlayerGUI — main GUI renderable for standalone player mode.

Handles game viewport rendering, screen-space UI, and input processing
without any editor chrome.
"""

from __future__ import annotations

from InfEngine.lib import InfGUIRenderable, InfGUIContext


class PlayerGUI(InfGUIRenderable):
    """Full-screen game renderer for player builds."""

    def __init__(
        self,
        engine: object,
        *,
        splash_items: list | None = None,
        data_root: str = "",
    ) -> None: ...

    def on_render(self, ctx: InfGUIContext) -> None: ...
