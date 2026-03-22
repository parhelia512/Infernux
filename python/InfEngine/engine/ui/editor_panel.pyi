"""EditorPanel — base class for all dockable editor panels.

Subclass this to create custom inspector-like panels with access to
:class:`EditorServices` and :class:`EditorEventBus`.

Example::

    from InfEngine.engine.ui.editor_panel import EditorPanel

    class MyPanel(EditorPanel):
        def on_enable(self):
            self.events.subscribe(EditorEvent.SELECTION_CHANGED, self._on_sel)

        def on_disable(self):
            self.events.unsubscribe(EditorEvent.SELECTION_CHANGED, self._on_sel)

        def on_render_content(self, ctx):
            ctx.text("Hello from my panel!")
"""

from __future__ import annotations

from typing import Optional

from InfEngine.lib import InfGUIContext
from InfEngine.engine.ui.closable_panel import ClosablePanel
from InfEngine.engine.ui.editor_services import EditorServices
from InfEngine.engine.ui.event_bus import EditorEventBus


class EditorPanel(ClosablePanel):
    """Base class for all dockable editor panels.

    Provides lifecycle hooks, service access, and size/style overrides.
    """

    def __init__(self, title: str, window_id: Optional[str] = None) -> None: ...

    @property
    def services(self) -> EditorServices:
        """Access to all editor subsystems (engine, undo, scenes, etc.)."""
        ...

    @property
    def events(self) -> EditorEventBus:
        """The editor-wide event bus for pub/sub communication."""
        ...

    def on_enable(self) -> None:
        """Called when the panel becomes visible. Subscribe to events here."""
        ...

    def on_disable(self) -> None:
        """Called when the panel is hidden. Unsubscribe from events here."""
        ...

    def on_render_content(self, ctx: InfGUIContext) -> None:
        """Override to render the panel body.

        Args:
            ctx: The ImGui rendering context.
        """
        ...

    def save_state(self) -> dict:
        """Return a dict of panel state for persistence."""
        ...

    def load_state(self, data: dict) -> None:
        """Restore panel state from a previously saved dict."""
        ...

    def on_render(self, ctx: InfGUIContext) -> None:
        """Full render cycle (framework calls this — override ``on_render_content``)."""
        ...
