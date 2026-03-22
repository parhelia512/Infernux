"""FrameSchedulerPanel — per-frame tick orchestrator.

Ticks deferred tasks, file-system watchers, and other per-frame services.
"""

from __future__ import annotations

from InfEngine.lib import InfGUIRenderable, InfGUIContext


class FrameSchedulerPanel(InfGUIRenderable):
    """Invisible panel that ticks per-frame services."""

    def __init__(self, engine: object = None) -> None: ...
    def set_engine(self, engine: object) -> None: ...
    def on_render(self, ctx: InfGUIContext) -> None: ...
