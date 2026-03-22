"""inspector_renderstack — RenderStack inspector with topology view."""

from __future__ import annotations

from InfEngine.lib import InfGUIContext


def render_renderstack_inspector(ctx: InfGUIContext, stack: object) -> None:
    """Render the full RenderStack inspector.

    Includes topology view, pass/effect rendering, add-effect popup,
    and drag-drop reordering.
    """
    ...
